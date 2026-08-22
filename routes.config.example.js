const { target } = require('./proxy-helpers');

// Route table template.
//
// First-time setup:
//   1. Copy this file to routes.config.js  (it is gitignored — your own config)
//        cp routes.config.example.js routes.config.js
//   2. Replace the hosts and ports below with your own.
//   3. Generate SSL certs that cover your hosts:  npm run gen:ssl
//        A wildcard SAN saves a regen per added subdomain:
//          SSL_EXTRA_SANS='*.your.domain' npm run gen:ssl -- --force
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
    // Parallel worktree slots. A second checkout needs its own hostname, not just
    // its own port: the app derives its API host from window.location, and the auth
    // cookie is scoped to the tenant domain, so only a host under that domain is
    // authenticated. Keep ws: true or Vite HMR breaks behind the proxy.
    //
    // Provision every slot up front and enable the slot hosts in /etc/hosts once:
    //   sudo npm run hosts -- enable wt1.app.example.dev wt2.app.example.dev ...
    // Name the slots explicitly. hosts:enable:all points EVERY host in this table at
    // 127.0.0.1, including any real API or production hostname you proxy.
    // Adding a worktree then needs no sudo and no proxy restart -- point its .env at a
    // free slot and start the dev server.
    {
        hosts: ['wt1.app.example.dev'],
        target: target(5176),
        ws: true,
    },
    {
        hosts: ['wt2.app.example.dev'],
        target: target(5177),
        ws: true,
    },
    {
        hosts: ['wt3.app.example.dev'],
        target: target(5178),
        ws: true,
    },
    {
        hosts: ['wt4.app.example.dev'],
        target: target(5179),
        ws: true,
    },
    {
        hosts: ['wt5.app.example.dev'],
        target: target(5180),
        ws: true,
    },
];
