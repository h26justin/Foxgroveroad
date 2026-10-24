#!/usr/bin/env node
/**
 * Foxgrove Road heating relay.
 *
 * Runs on an always-on device on the house network. Talks to the
 * Heatmiser neoHub over its local websocket API (wss://<hub>:4243) and
 * to the app's /api/heating/sync endpoint, so the hub never has to be
 * exposed to the internet.
 *
 * Each tick:
 *   1. If a reading is due, ask the hub for GET_LIVE_DATA.
 *   2. POST { live, error, results } to the app; get back queued commands.
 *   3. Run those commands on the hub, then immediately sync again with
 *      the results and fresh live data so the app updates straight away.
 *
 * Config (environment variables — see README.md):
 *   HUB_HOST, HUB_TOKEN, APP_URL, RELAY_SECRET,
 *   POLL_SECONDS (default 60), READING_MINUTES (default 5)
 */

import WebSocket from 'ws'

const HUB_HOST = required('HUB_HOST')
const HUB_TOKEN = required('HUB_TOKEN')
const APP_URL = required('APP_URL').replace(/\/$/, '')
const RELAY_SECRET = required('RELAY_SECRET')
const POLL_MS = Number(process.env.POLL_SECONDS ?? 60) * 1000
const READING_MS = Number(process.env.READING_MINUTES ?? 5) * 60_000
const HUB_TIMEOUT_MS = 15_000

function required(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`[relay] missing env var ${name}`)
    process.exit(1)
  }
  return v
}

function log(...args) {
  console.log(new Date().toISOString(), '[relay]', ...args)
}

// ─── neoHub websocket client ───────────────────────────────────────────────

let socket = null
let nextCommandId = 1
const pending = new Map()

function connect() {
  return new Promise((resolve, reject) => {
    // The hub serves a self-signed certificate, so it can't be verified.
    // This only applies to this LAN connection — calls to the app below
    // use normal certificate checks.
    const ws = new WebSocket(`wss://${HUB_HOST}:4243`, { rejectUnauthorized: false })
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('hub connection timed out'))
    }, HUB_TIMEOUT_MS)
    ws.on('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    ws.on('message', (data) => onMessage(String(data)))
    ws.on('close', () => {
      if (socket === ws) socket = null
      for (const p of pending.values()) p.reject(new Error('hub connection closed'))
      pending.clear()
    })
  })
}

function onMessage(raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return log('unparseable hub message', raw.slice(0, 200))
  }
  const p = pending.get(msg.command_id)
  if (!p) return
  pending.delete(msg.command_id)
  let response = msg.response
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response)
    } catch {
      // leave as string
    }
  }
  p.resolve(response)
}

/**
 * The hub expects each command as a Python-style string with single
 * quotes, e.g. "{'GET_LIVE_DATA': 0}". Zone names containing quotes
 * are rejected by the app before they get here.
 */
function toHubString(command) {
  return JSON.stringify(command).replace(/"/g, "'")
}

async function hub(command) {
  if (!socket || socket.readyState !== WebSocket.OPEN) socket = await connect()
  const id = nextCommandId++
  const envelope = {
    message_type: 'hm_get_command_queue',
    message: JSON.stringify({
      token: HUB_TOKEN,
      COMMANDS: [{ COMMAND: toHubString(command), COMMANDID: id }],
    }),
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('hub request timed out'))
    }, HUB_TIMEOUT_MS)
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    })
    socket.send(JSON.stringify(envelope))
  })
}

// ─── App commands → hub commands ───────────────────────────────────────────

/** Latest SET_TEMP per zone — used to cancel a hold at the normal target. */
const lastSetTemp = new Map()

function toHubCommand(c) {
  const zones = [c.zone_name]
  const temp = c.temp === null ? null : Number(c.temp)
  switch (c.kind) {
    case 'set_temp':
      return { SET_TEMP: [temp, zones] }
    case 'hold':
      return {
        HOLD: [
          { temp, hours: Math.floor(c.minutes / 60), minutes: c.minutes % 60, id: 'Foxgrove' },
          zones,
        ],
      }
    case 'cancel_hold':
      // A hold of 0h 0m clears any active hold on the zone.
      return {
        HOLD: [
          { temp: Math.round(lastSetTemp.get(c.zone_name) ?? 20), hours: 0, minutes: 0, id: 'Foxgrove' },
          zones,
        ],
      }
    case 'frost_on':
      return { FROST_ON: zones }
    case 'frost_off':
      return { FROST_OFF: zones }
    case 'away_on':
      return { AWAY_ON: 0 }
    case 'away_off':
      return { AWAY_OFF: 0 }
    default:
      throw new Error(`unknown command kind ${c.kind}`)
  }
}

async function runCommand(c) {
  try {
    const response = await hub(toHubCommand(c))
    const failed = response && typeof response === 'object' && 'error' in response
    log('ran', c.kind, c.zone_name ?? '', '→', JSON.stringify(response))
    return { id: c.id, ok: !failed, result: JSON.stringify(response) }
  } catch (err) {
    log('command failed', c.kind, err.message)
    return { id: c.id, ok: false, result: err.message }
  }
}

// ─── App sync ──────────────────────────────────────────────────────────────

async function sync(body) {
  const res = await fetch(`${APP_URL}/api/heating/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${RELAY_SECRET}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`app sync HTTP ${res.status}`)
  const json = await res.json()
  return Array.isArray(json.commands) ? json.commands : []
}

async function readLive() {
  const live = await hub({ GET_LIVE_DATA: 0 })
  for (const d of live?.devices ?? []) {
    const t = parseFloat(d.SET_TEMP)
    if (d.ZONE_NAME && Number.isFinite(t)) lastSetTemp.set(d.ZONE_NAME, t)
  }
  return live
}

let lastReadingAt = 0
let results = []

async function tick() {
  let live = null
  let error = null
  const readingDue = Date.now() - lastReadingAt >= READING_MS || results.length > 0
  if (readingDue) {
    try {
      live = await readLive()
      lastReadingAt = Date.now()
    } catch (err) {
      error = `hub: ${err.message}`
      log(error)
    }
  }

  const sent = results
  results = []
  let commands
  try {
    commands = await sync({ live, error, results: sent })
  } catch (err) {
    log('sync failed:', err.message)
    results = sent // retry reporting next tick
    return false
  }

  for (const c of commands) results.push(await runCommand(c))
  return commands.length > 0
}

async function main() {
  log(`starting — hub ${HUB_HOST}, app ${APP_URL}, poll ${POLL_MS / 1000}s`)
  for (;;) {
    let again = false
    try {
      again = await tick()
    } catch (err) {
      log('tick error:', err.message)
    }
    // After running commands, sync straight back (after a short pause
    // so the hub has applied them) instead of waiting a full poll.
    await new Promise((r) => setTimeout(r, again ? 3000 : POLL_MS))
  }
}

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
main()
