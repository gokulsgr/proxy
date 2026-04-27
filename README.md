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

## Hosts CLI

Manage `/etc/hosts` entries for proxy domains.

```bash
# Show status of all proxy hosts
npm run hosts:status

# List all active hosts in /etc/hosts
npm run hosts:list

# Enable all proxy hosts (requires sudo)
sudo npm run hosts:enable:all

# Disable all proxy hosts
sudo npm run hosts:disable:all

# Enable specific hosts
sudo npm run hosts -- enable perkinswill.hub365.dev ai.hub.perkinswill.com

# Remove hosts from /etc/hosts
sudo npm run hosts:remove:all
```

### Options

```
--file <path>   Hosts file path (default: /etc/hosts)
--ip <ip>       IP to use when enabling (default: 127.0.0.1)
--all           Apply to all proxy hosts
--dry-run       Print result without writing
--help          Show help
```
