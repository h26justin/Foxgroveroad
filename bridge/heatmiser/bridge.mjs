// Foxgrove Road heating bridge.
//
// Runs on a Raspberry Pi in the house. Every POLL_SECONDS it:
//   1. asks the neoHub for live data (local WebSocket API, port 4243),
//   2. POSTs it to <APP_URL>/api/heating/bridge with the results of any
//      commands it ran last time,
//   3. runs the commands the app hands back (hold / cancel hold / away).
//
// Only outbound connections: nothing on the internet can reach the hub.
//
//   npm start          run the bridge
//   npm run probe      print the hub's raw live data once and exit
//                      (use this first to check the field names)

import WebSocket from 'ws'

const VERSION = '1.0.0'

// Must match lib/heating-limits.ts in the app.
const HOLD_MIN_TEMP = 5
const HOLD_MAX_TEMP = 25
const HOLD_MIN_MINUTES = 15
const HOLD_MAX_MINUTES = 720

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback
  if (v === undefined || v === '') {
    console.error(`Missing ${name} in .env`)
    process.exit(1)
  }
  return v
}

const NEOHUB_HOST = env('NEOHUB_HOST')
const NEOHUB_TOKEN = env('NEOHUB_TOKEN')
const POLL_MS = Math.max(15, Number(env('POLL_SECONDS', '60'))) * 1000
const PROBE = process.argv.includes('--probe')
const APP_URL = PROBE ? '' : env('APP_URL').replace(/\/$/, '')
const BRIDGE_TOKEN = PROBE ? '' : env('HEATING_BRIDGE_TOKEN')

const log = (...a) => console.log(new Date().toISOString(), ...a)

// ─── neoHub client ─────────────────────────────────────────────────────
// The hub speaks JSON over wss with a self-signed certificate, so the
// certificate isn't checked. That's only acceptable because this
// connection never leaves the home network.

class NeoHub {
  constructor(host, token) {
    this.url = `wss://${host}:4243`
    this.token = token
    this.ws = null
    this.nextId = 1
    this.waiting = new Map()
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        rejectUnauthorized: false,
        handshakeTimeout: 10_000,
      })
      ws.once('open', () => {
        this.ws = ws
        resolve()
      })
      ws.once('error', reject)
      ws.on('message', (data) => this.onMessage(data))
      ws.on('close', () => {
        if (this.ws === ws) this.ws = null
        for (const { reject: r } of this.waiting.values()) r(new Error('Hub connection closed'))
        this.waiting.clear()
      })
    })
  }

  onMessage(data) {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    const w = this.waiting.get(msg.command_id)
    if (!w) return
    this.waiting.delete(msg.command_id)
    try {
      w.resolve(typeof msg.response === 'string' ? JSON.parse(msg.response) : msg.response)
    } catch (err) {
      w.reject(err)
    }
  }

  // The hub wants each command as a dict written with single quotes,
  // e.g. "{'GET_LIVE_DATA':0}", wrapped in a JSON message.
  async send(command) {
    await this.connect()
    const id = this.nextId++
    const inner = JSON.stringify(command).replaceAll('"', "'")
    const message = JSON.stringify({
      token: this.token,
      COMMANDS: [{ COMMAND: inner, COMMANDID: id }],
    })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        reject(new Error('Hub did not answer in 10s'))
      }, 10_000)
      this.waiting.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      this.ws.send(JSON.stringify({ message_type: 'hm_get_command_queue', message }))
    })
  }

  close() {
    this.ws?.close()
  }
}

// ─── Mapping ───────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n
}

function toReport(live) {
  const devices = Array.isArray(live?.devices) ? live.devices : []
  const zones = devices
    // Thermostats only: skip timeclocks, plugs and repeaters.
    .filter((d) => d.ZONE_NAME && d.THERMOSTAT !== false && !d.TIMECLOCK)
    .map((d) => ({
      name: String(d.ZONE_NAME),
      current_temp: num(d.ACTUAL_TEMP),
      set_temp: num(d.SET_TEMP),
      heat_on: !!d.HEAT_ON,
      offline: !!d.OFFLINE,
      low_battery: !!d.LOW_BATTERY,
      hold_on: !!d.HOLD_ON,
      hold_temp: num(d.HOLD_TEMP),
      standby: !!d.STANDBY,
    }))
  return {
    hub: { away: !!live?.HUB_AWAY, holiday: !!live?.HUB_HOLIDAY, bridge_version: VERSION },
    zones,
  }
}

const safeZone = (z) => typeof z === 'string' && z.length > 0 && z.length <= 100 && !/['"\\]/.test(z)

// Only these four commands exist. Anything else from the app is refused.
function toHubCommand(cmd, zones) {
  switch (cmd.kind) {
    case 'hold': {
      if (!safeZone(cmd.zone)) throw new Error('Bad zone name')
      const t = Number(cmd.temp)
      const m = Number(cmd.minutes)
      if (!(t >= HOLD_MIN_TEMP && t <= HOLD_MAX_TEMP)) throw new Error('Temperature out of range')
      if (!(Number.isInteger(m) && m >= HOLD_MIN_MINUTES && m <= HOLD_MAX_MINUTES)) {
        throw new Error('Duration out of range')
      }
      return {
        HOLD: [{ temp: t, hours: Math.floor(m / 60), minutes: m % 60, id: 'Foxgrove' }, [cmd.zone]],
      }
    }
    case 'cancel_hold': {
      if (!safeZone(cmd.zone)) throw new Error('Bad zone name')
      // A zero-length hold ends the current one; the stat goes back to
      // its schedule.
      const z = zones.find((x) => x.name === cmd.zone)
      const t = z?.set_temp ?? 20
      return { HOLD: [{ temp: t, hours: 0, minutes: 0, id: 'Foxgrove' }, [cmd.zone]] }
    }
    case 'away_on':
      return { AWAY_ON: 0 }
    case 'away_off':
      return { AWAY_OFF: 0 }
    default:
      throw new Error(`Unknown command ${cmd.kind}`)
  }
}

// ─── App ───────────────────────────────────────────────────────────────

async function report(body) {
  const res = await fetch(`${APP_URL}/api/heating/bridge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`App answered ${res.status}`)
  const json = await res.json()
  return Array.isArray(json.commands) ? json.commands : []
}

// ─── Main loop ─────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const hub = new NeoHub(NEOHUB_HOST, NEOHUB_TOKEN)

  if (PROBE) {
    const live = await hub.send({ GET_LIVE_DATA: 0 })
    console.log(JSON.stringify(live, null, 2))
    console.log('\nAs the app will see it:')
    console.log(JSON.stringify(toReport(live), null, 2))
    hub.close()
    return
  }

  log(`Bridge ${VERSION} starting. Hub ${NEOHUB_HOST}, app ${APP_URL}, every ${POLL_MS / 1000}s.`)
  let results = []

  for (;;) {
    let delay = POLL_MS
    try {
      const live = await hub.send({ GET_LIVE_DATA: 0 })
      const body = toReport(live)
      const commands = await report({ ...body, results })
      results = []

      for (const cmd of commands.slice(0, 10)) {
        try {
          const reply = await hub.send(toHubCommand(cmd, body.zones))
          if (reply && typeof reply === 'object' && reply.error) throw new Error(String(reply.error))
          results.push({ id: cmd.id, ok: true })
          log(`Ran ${cmd.kind}${cmd.zone ? ` on ${cmd.zone}` : ''}`)
        } catch (err) {
          results.push({ id: cmd.id, ok: false, error: String(err?.message ?? err) })
          log(`Failed ${cmd.kind}: ${err?.message ?? err}`)
        }
      }
      // Report results (and the hub's new state) straight away.
      if (commands.length > 0) delay = 5_000
    } catch (err) {
      // Hub or app unreachable: keep trying. The app raises a
      // "hub not reporting" alert after 20 minutes of silence.
      log(`Check-in failed: ${err?.message ?? err}`)
      hub.close()
    }
    await sleep(delay)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
