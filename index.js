require('dotenv').config();

const https = require('https');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');
const express = require('express');
const cors = require('cors');
const { target } = require('./proxy-helpers');

const DEFAULT_OPTIONS = {
    listenPort: Number(process.env.PORT || 443),
    sslDir: process.env.SSL_DIR || path.join(__dirname, '.ssl'),
    sslKeyFile: process.env.SSL_KEY_FILE || 'server.key',
    sslCertFile: process.env.SSL_CERT_FILE || 'server.crt',
    proxyTimeout: Number(process.env.PROXY_TIMEOUT || 30000),
    corsOrigin: process.env.CORS_ORIGIN || true,
};

// Load the per-user route table. Prefer the gitignored `routes.config.js`;
// fall back to the committed `routes.config.example.js` template so a fresh
// clone still boots.
function loadRoutes() {
    const userConfig = path.join(__dirname, 'routes.config.js');
    const exampleConfig = path.join(__dirname, 'routes.config.example.js');
    const configPath = fs.existsSync(userConfig) ? userConfig : exampleConfig;

    return require(configPath);
}

const ROUTES = loadRoutes();

function normalizePrefix(prefix = '') {
    const trimmed = String(prefix).replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '';
}

function matchPathRoute(pathProxies, url = '') {
    const pathname = url.split('?')[0];
    return pathProxies.find(({ prefix }) => (
        prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))
    ));
}

function stripPrefix(url, prefix) {
    const rest = url.slice(prefix.length);

    if (rest === '') {
        return '/';
    }

    return rest.startsWith('?') ? `/${rest}` : rest;
}

function normalizeHost(hostHeader = '') {
    return hostHeader.toLowerCase().split(':')[0];
}

function getRouteLabel(route) {
    return route.hosts[0] || `${route.target.protocol}//${route.target.host}:${route.target.port}`;
}

function createProxy(route, options) {
    const routeLabel = getRouteLabel(route);
    const proxy = httpProxy.createProxyServer({
        target: route.target,
        changeOrigin: route.changeOrigin ?? true,
        secure: route.secure ?? false,
        ws: route.ws ?? false,
        proxyTimeout: route.proxyTimeout ?? options.proxyTimeout,
        timeout: route.timeout ?? options.proxyTimeout,
    });

    proxy.on('error', (err, req, res) => {
        const url = req?.url || '';
        console.error(`[${routeLabel}] proxy error for ${url}`, err.message);

        if (!res) {
            return;
        }

        if (typeof res.status === 'function') {
            return res.status(502).send(`Unable to connect to proxy. ${routeLabel}`);
        }

        if (!res.headersSent && typeof res.writeHead === 'function') {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
        }

        if (typeof res.end === 'function') {
            return res.end(`Unable to connect to proxy. ${routeLabel}`);
        }

        if (typeof res.destroy === 'function') {
            res.destroy();
        }
    });

    return proxy;
}

function createRouter(routes, options) {
    const routeByHost = new Map();
    const wsRoutes = new Set();

    routes.forEach((route) => {
        const proxy = route.target ? createProxy(route, options) : null;

        const pathProxies = (route.pathRoutes || []).map((pathRoute) => ({
            prefix: normalizePrefix(pathRoute.prefix),
            stripPrefix: pathRoute.stripPrefix ?? false,
            proxy: createProxy({ ...route, ...pathRoute }, options),
        }));

        route.hosts.forEach((host) => {
            const normalizedHost = normalizeHost(host);
            routeByHost.set(normalizedHost, { route, proxy, pathProxies });

            if (route.ws) {
                wsRoutes.add(normalizedHost);
            }
        });
    });

    return {
        handleRequest(req, res) {
            const host = normalizeHost(req.headers.host);
            const match = routeByHost.get(host);

            if (!match) {
                return res.status(404).send('Not Supported!');
            }

            const pathMatch = matchPathRoute(match.pathProxies, req.url);

            if (pathMatch) {
                if (pathMatch.stripPrefix) {
                    req.url = stripPrefix(req.url, pathMatch.prefix);
                }

                return pathMatch.proxy.web(req, res);
            }

            if (!match.proxy) {
                return res.status(404).send('Not Supported!');
            }

            return match.proxy.web(req, res);
        },

        handleUpgrade(req, socket, head) {
            const host = normalizeHost(req.headers.host);
            const match = routeByHost.get(host);

            if (!match || !wsRoutes.has(host)) {
                socket.destroy();
                return;
            }

            match.proxy.ws(req, socket, head);
        },
    };
}

function readSslOptions(options) {
    const keyPath = path.join(options.sslDir, options.sslKeyFile);
    const certPath = path.join(options.sslDir, options.sslCertFile);

    try {
        return {
            key: fs.readFileSync(keyPath, 'utf8'),
            cert: fs.readFileSync(certPath, 'utf8'),
        };
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(
                `SSL certificate not found in ${options.sslDir}.\n`
                + `Expected "${options.sslKeyFile}" and "${options.sslCertFile}".\n`
                + 'Generate them for first-time setup with:  npm run gen:ssl',
            );
        }

        throw err;
    }
}

function createApp(routes = ROUTES, options = DEFAULT_OPTIONS) {
    const app = express();
    const router = createRouter(routes, options);

    app.use(cors({
        origin: (origin, callback) => callback(null, options.corsOrigin),
        credentials: true,
    }));

    app.use('/', router.handleRequest);

    return { app, router };
}

function startServer(options = DEFAULT_OPTIONS, routes = ROUTES) {
    const { app, router } = createApp(routes, options);
    const server = https.createServer(readSslOptions(options), app);

    server.on('upgrade', router.handleUpgrade);

    server.listen(options.listenPort, () => {
        console.log(`Started Proxy Server on port ${options.listenPort}!`);
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    DEFAULT_OPTIONS,
    ROUTES,
    createApp,
    createProxy,
    createRouter,
    getRouteLabel,
    normalizeHost,
    readSslOptions,
    startServer,
    target,
};
