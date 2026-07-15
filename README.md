# hub365 Proxy

HTTPS reverse proxy that routes traffic to local services by hostname. Includes a CLI for managing `/etc/hosts` entries.

## Prerequisites

- Node.js
- `openssl` on your `PATH` (used by the cert generator; ships with macOS/Linux)

## First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Create your own route table (hosts + ports)
cp routes.config.example.js routes.config.js
#    ...then edit routes.config.js for your hosts/ports

# 3. Generate SSL certs (SANs are derived from your routes)
npm run gen:ssl

# 4. Point your hosts at 127.0.0.1
sudo npm run hosts:enable:all

# 5. Start the proxy
sudo npm start
```

> `sudo` is required to bind port 443 and to write `/etc/hosts`.

## Routes config

The route table lives in **`routes.config.js`** (gitignored — your own config).
If it does not exist, `index.js` falls back to the committed
`routes.config.example.js` template. Each route is matched by the request's
`Host` header:

```js
const { target } = require('./proxy-helpers');

module.exports = [
    { hosts: ['app.example.dev'], target: target(3000) },
    { hosts: ['api.example.dev'], target: target(8080, { protocol: 'http:' }) },
    { hosts: ['ws.example.dev'],  target: target(5173), ws: true },
];
```

See `routes.config.example.js` for the full documented template (`pathRoutes`,
protocols, WebSockets).

## SSL certificates

`npm run gen:ssl` creates a local dev CA (`rootCA.pem` / `rootCA.key`) and a
server certificate (`server.key` / `server.crt`) in `.ssl/`, signed by that CA.
The certificate's SANs are taken from the hostnames in your route config, so it
always matches what the proxy serves.

```bash
npm run gen:ssl              # generate (skips if certs already exist)
npm run gen:ssl -- --force   # regenerate, overwriting existing files
npm run gen:ssl -- --trust   # also add the CA to the OS trust store (sudo)
```

Until the CA is trusted, browsers will warn. Re-run with `--trust`, or follow
the manual trust command the script prints for your OS.

## Configuration

Set environment variables (or use a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `443` | Listen port |
| `SSL_DIR` | `.ssl` | Directory holding the cert/key |
| `SSL_KEY_FILE` | `server.key` | Key filename inside `SSL_DIR` |
| `SSL_CERT_FILE` | `server.crt` | Cert filename inside `SSL_DIR` |
| `PROXY_TIMEOUT` | `30000` | Proxy timeout (ms) |
| `CORS_ORIGIN` | `true` | CORS origin (`true` = reflect) |

## Start

```bash
sudo npm start
```

> `sudo` required to bind port 443. If certs are missing the server exits with
> a hint to run `npm run gen:ssl`.

## Routes

Requests are routed by their `Host` header. The active table is whatever is in
your `routes.config.js` (see [Routes config](#routes-config) above).

## npm Scripts

| Command | Description |
|---|---|
| `npm start` | Start proxy server |
| `npm run gen:ssl` | Generate SSL CA + server cert into `.ssl/` |
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
