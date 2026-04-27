require('dotenv').config();

const https = require('https');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');
const express = require('express');
const cors = require('cors');

const DEFAULT_OPTIONS = {
    listenPort: Number(process.env.PORT || 443),
    sslDir: path.join(__dirname, '.ssl'),
    sslKeyFile: process.env.SSL_KEY_FILE || 'server.key',
    sslCertFile: process.env.SSL_CERT_FILE || 'server.crt',
    proxyTimeout: Number(process.env.PROXY_TIMEOUT || 30000),
    corsOrigin: process.env.CORS_ORIGIN || true,
};

const ROUTES = [
    {
        hosts: [
            'perkinswill.hub365.dev',
            'perkinswill.hub365.cloud',
            'dargroup.hub365.cloud',
            'sidaraconnect.com',
            'kindsnacks.fourjunctions.cloud',
            'dargroup.hub365.dev',
            'hub365.work',
        ],
        target: target(8089),
    },
    {
        hosts: ['connect.dargroup.com', 'plus.perkinswill.com'],
        target: target(8083, { protocol: 'http:' }),
    },
    {
        hosts: ['hub.perkinswill.com'],
        target: target(8080),
    },
    {
        hosts: [
            'perkinswill.fluentmind.dev',
            'ai.hub.perkinswill.com',
            'ai.sidaraconnect.com',
        ],
        target: target(5173),
        ws: true,
    },
    {
        hosts: ['amplify.perkinswill.com'],
        target: target(9096),
    },
    {
        hosts: ['pmtk.hub365.dev'],
        target: target(9007),
    },
];

function target(port, { protocol = 'https:', host = 'localhost' } = {}) {
    return { protocol, host, port: String(port) };
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
        const proxy = createProxy(route, options);

        route.hosts.forEach((host) => {
            const normalizedHost = normalizeHost(host);
            routeByHost.set(normalizedHost, { route, proxy });

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
    return {
        key: fs.readFileSync(path.join(options.sslDir, options.sslKeyFile), 'utf8'),
        cert: fs.readFileSync(path.join(options.sslDir, options.sslCertFile), 'utf8'),
    };
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
