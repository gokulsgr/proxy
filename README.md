# hub365 Proxy

HTTPS reverse proxy that routes traffic to local services by hostname. Includes a CLI for managing `/etc/hosts` entries.

## Prerequisites

- Node.js
- SSL cert/key in `.ssl/` (default: `server.key`, `server.crt`)

## Setup

```bash
npm install
```

## Configuration

Copy `.env.example` or set environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `443` | Listen port |
| `SSL_KEY_FILE` | `server.key` | Key filename inside `.ssl/` |
| `SSL_CERT_FILE` | `server.crt` | Cert filename inside `.ssl/` |
| `PROXY_TIMEOUT` | `30000` | Proxy timeout (ms) |
| `CORS_ORIGIN` | `true` | CORS origin (`true` = reflect) |

SSL files live in `.ssl/` relative to `index.js`.

## Start

```bash
sudo npm start
```

> `sudo` required to bind port 443.

## Routes

Requests are routed by `Host` header:

| Hosts | Target | Notes |
|---|---|---|
| `perkinswill.hub365.dev`, `perkinswill.hub365.cloud`, `dargroup.hub365.cloud`, `sidaraconnect.com`, `kindsnacks.fourjunctions.cloud`, `dargroup.hub365.dev`, `hub365.work` | `https://localhost:8089` | |
| `connect.dargroup.com`, `plus.perkinswill.com` | `http://localhost:8083` | |
| `hub.perkinswill.com` | `https://localhost:8080` | |
| `perkinswill.fluentmind.dev`, `ai.hub.perkinswill.com`, `ai.sidaraconnect.com` | `https://localhost:5173` | WebSocket support |
| `amplify.perkinswill.com` | `https://localhost:9096` | |
| `pmtk.hub365.dev` | `https://localhost:9007` | |

## npm Scripts

| Command | Description |
|---|---|
| `npm start` | Start proxy server |
| `npm test` | Syntax-check all JS files |
| `npm run hosts:list` | List active hosts in `/etc/hosts` |
| `npm run hosts:status` | Status of all proxy hosts |
| `npm run hosts:status:all` | Status of every known host |
| `npm run hosts:enable` | Enable specific hosts (pass names after `--`) |
| `npm run hosts:enable:all` | Enable all proxy hosts |
| `npm run hosts:disable` | Disable specific hosts |
| `npm run hosts:disable:all` | Disable all proxy hosts |
| `npm run hosts:remove` | Remove specific hosts from `/etc/hosts` |
| `npm run hosts:remove:all` | Remove all proxy hosts from `/etc/hosts` |

> `enable` / `disable` / `remove` write to `/etc/hosts` — run with `sudo`.

## Hosts CLI

Install the `hosts` binary globally:

```bash
npm link
```

Then use it directly:

```bash
hosts list
hosts status
hosts status hub.perkinswill.com perkinswill.hub365.dev

sudo hosts enable hub.perkinswill.com
sudo hosts enable --all

sudo hosts disable hub.perkinswill.com
sudo hosts disable --all

sudo hosts remove hub.perkinswill.com
sudo hosts remove --all

# Dry-run (print without writing)
hosts enable --all --dry-run

# Custom hosts file or IP
sudo hosts enable hub.perkinswill.com --file /tmp/hosts --ip 192.168.1.10
```

Without `npm link`, use `npm run hosts -- <args>` instead.

### Options

```
--file <path>   Hosts file path (default: /etc/hosts)
--ip <ip>       IP to use when enabling (default: 127.0.0.1)
--all           Apply to all proxy hosts
--dry-run       Print result without writing
--help          Show help
```
