# Heating bridge (Heatmiser neoHub → Foxgrove Road)

The neoHub's API only answers on the home network, so the app (on Vercel)
can't reach it. This small Node script runs on a Raspberry Pi in the house,
reads the hub every minute and reports to the app. It also picks up the
commands queued from the Heating page (set a temperature for a while, back to
schedule, away mode) and runs them.

It only makes **outbound** connections. Nothing on the internet can reach
the hub or the Pi.

## What you need

- The neoHub plugged into the router, with a fixed IP (set a DHCP
  reservation in the router).
- An API token: Heatmiser app → **Settings → System → API Access** → add one.
- A Raspberry Pi (a Pi Zero 2 W is plenty) on the same network, with
  Node.js 20.6 or newer.

## One-time setup in the app

1. Run `db/12_heating.sql` in the Supabase SQL Editor (after `db/11_security_hardening.sql`).
2. In Vercel → Project → Settings → Environment Variables, add
   `HEATING_BRIDGE_TOKEN` (generate with `openssl rand -hex 32`) and redeploy.
3. Optional but recommended: the watchdog that spots a silent bridge.
   Add `CRON_SECRET` to Vercel, then follow `db/13_heating_watchdog.sql`.

## Install on the Pi

```bash
# Node 20+ (Raspberry Pi OS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Copy this folder to the Pi, then:
cd ~/foxgrove-heating-bridge
npm ci --omit=dev || npm install --omit=dev
cp .env.example .env && nano .env      # fill in host, tokens, app URL
chmod 600 .env

# Check it can see the hub. Prints the raw data and what the app will get.
npm run probe
```

If the probe shows your rooms with sensible temperatures, install the service:

```bash
sudo cp foxgrove-heating-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now foxgrove-heating-bridge
journalctl -u foxgrove-heating-bridge -f     # watch it check in
```

Thermostats appear on the app's Heating page within a minute. Link each one
to its room there (⚙ on the card) so the "empty guest room being heated"
alert works.

## Things to check against your hub

The field and command names follow neoHub API rev 3 as used by the
open-source `neohubapi` / openHAB integrations. Before relying on remote
control, try each from the Heating page and watch the result in the
"Recent changes" list:

- **Set temperature…** sends `HOLD` for the chosen time.
- **Back to schedule** sends a zero-length `HOLD`. If your firmware ignores
  that, tell Claude and it can switch to the hub's cancel command.
- **Away mode** sends `AWAY_ON` / `AWAY_OFF` (frost protection on every stat).

If `npm run probe` shows different field names (e.g. no `ACTUAL_TEMP`), the
mapping in `toReport()` in `bridge.mjs` is the one place to change.
