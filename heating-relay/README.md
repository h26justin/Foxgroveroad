# Heating relay

The Heatmiser neoHub only answers on the house network, and the app runs
on Vercel, so something at the house has to pass messages between them.
This relay does that:

```
neoHub  ⇄  relay (at the house)  ⇄  https://foxgroveroad.vercel.app/api/heating/sync  ⇄  Supabase
```

It only makes outgoing connections, so no router port-forwarding is
needed and the hub stays off the internet.

## What you need

- A neoHub **Gen2 or Gen3** (sticker on the back).
- Something always on at the house that can run Node.js 20+. A Raspberry
  Pi (any model from 3B+ up, or a Pi Zero 2 W) is ideal, but a NAS that
  runs Docker/Node or an always-on PC works too.

## 1. One-time app setup

1. Run `db/11_heating.sql` in the Supabase SQL editor.
2. Make a long random secret, e.g. `openssl rand -hex 32`.
3. In Vercel → foxgroveroad → Settings → Environment Variables, add
   `HEATING_RELAY_SECRET` = that secret (Production). Redeploy.

## 2. Hub token

Heatmiser Neo app → Settings → System → API Access → **+**. Name it
`Foxgrove relay` and copy the token.

Find the hub's IP address in your router's device list. Reserve it there
(a "DHCP reservation") so it doesn't change.

## 3. Install on the Pi

```bash
sudo apt install -y nodejs npm git     # or install Node 20+ from nodesource
git clone https://github.com/h26justin/Foxgroveroad.git
cd Foxgroveroad/heating-relay
npm install
```

Create `relay.env` in this folder (it's git-ignored):

```
HUB_HOST=192.168.1.50
HUB_TOKEN=<token from the Neo app>
APP_URL=https://foxgroveroad.vercel.app
RELAY_SECRET=<same value as HEATING_RELAY_SECRET>
# Optional:
# POLL_SECONDS=60       how often to check for changes queued in the app
# READING_MINUTES=5     how often to record temperatures
```

Try it: `npm start`. Within a minute the Heating page in the app should
show your zones.

## 4. Keep it running (systemd)

```bash
sudo tee /etc/systemd/system/foxgrove-heating.service >/dev/null <<EOF
[Unit]
Description=Foxgrove heating relay
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$PWD
ExecStart=$(which node) --env-file=relay.env relay.mjs
Restart=always
RestartSec=30
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now foxgrove-heating
journalctl -u foxgrove-heating -f     # logs
```

## How changes work

Admins queue a change on /admin/heating (set target, hold, frost, away).
The relay picks it up on its next poll (≤ `POLL_SECONDS`), runs it on the
hub, and reports the result. The page shows each change as
pending → sent → done/failed.

## Notes

- The hub uses a self-signed certificate, so the relay doesn't verify it.
  That only applies to the LAN connection; the connection to the app is
  verified normally.
- If the app shows "relay hasn't reported", check the Pi is powered and
  online, then `journalctl -u foxgrove-heating`.
- Changing the secret: update both Vercel and `relay.env`, then
  `sudo systemctl restart foxgrove-heating`.
