const { target } = require('./proxy-helpers');

// Route table template.
//
// First-time setup:
//   1. Copy this file to routes.config.js  (it is gitignored — your own config)
//        cp routes.config.example.js routes.config.js
//   2. Replace the hosts and ports below with your own.
//   3. Generate SSL certs that cover your hosts:  npm run gen:ssl
//   4. Point your hosts to 127.0.0.1:              sudo npm run hosts:enable:all
//   5. Start the proxy:                            sudo npm start
//
// If routes.config.js does not exist, index.js falls back to this file.
//
// Each route is matched by the incoming request's `Host` header:
//   hosts       - one or more hostnames served by this route (required)
//   target      - where to forward: target(port, { protocol, host })
//                   protocol defaults to 'https:', host defaults to 'localhost'
//   ws          - set true to proxy WebSocket upgrades for these hosts
//   pathRoutes  - optional sub-routes matched by URL prefix, e.g. mount an
//                 API at "/" and an AI service at "/ai":
//                   pathRoutes: [
//                     { prefix: '/ai', target: target(3001), stripPrefix: true },
//                   ]
module.exports = [
    {
        hosts: ['app.example.dev'],
        target: target(3000),
    },
    {
        hosts: ['api.example.dev'],
        target: target(8080, { protocol: 'http:' }),
    },
    {
        hosts: ['ws.example.dev'],
        target: target(5173),
        ws: true,
    },
];
