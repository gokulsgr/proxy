#!/usr/bin/env node

/**
 * First-time SSL setup for the proxy.
 *
 * Generates a local development Certificate Authority (rootCA.key / rootCA.pem)
 * and a server certificate (server.key / server.crt) signed by it. The server
 * certificate's Subject Alternative Names are derived from the hostnames in the
 * active route config, so the cert always matches what the proxy actually serves.
 *
 * Output paths and filenames are read from index.js (DEFAULT_OPTIONS), so this
 * script never drifts from what the server reads at startup.
 *
 * Usage:
 *   npm run gen:ssl              Generate certs (skips if they already exist)
 *   npm run gen:ssl -- --force   Regenerate everything, overwriting existing files
 *   npm run gen:ssl -- --trust   Also add the CA to the OS trust store (needs sudo)
 *   npm run gen:ssl -- --help    Show help
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { ROUTES, DEFAULT_OPTIONS } = require('../index');

const CA_KEY_FILE = 'rootCA.key';
const CA_CERT_FILE = 'rootCA.pem';
const CA_SUBJECT = '/CN=hub365 proxy dev CA';
const CA_DAYS = 3650; // 10 years for the local CA
const LEAF_DAYS = 825; // Max accepted by modern browsers/Apple

function parseArgs(argv) {
    const flags = new Set(argv);

    if (flags.has('--help') || flags.has('-h')) {
        return { help: true };
    }

    return {
        help: false,
        force: flags.has('--force'),
        trust: flags.has('--trust'),
    };
}

function printHelp() {
    console.log(`Usage:
  npm run gen:ssl              Generate SSL certs (skips if they already exist)
  npm run gen:ssl -- --force   Regenerate everything, overwriting existing files
  npm run gen:ssl -- --trust   Also add the CA to the OS trust store (needs sudo)
  npm run gen:ssl -- --help    Show this help

SANs are taken from the hostnames in your route config, so the cert matches
whatever the proxy serves.
`);
}

function ensureOpensslAvailable() {
    try {
        execFileSync('openssl', ['version'], { stdio: 'ignore' });
    } catch {
        throw new Error(
            'openssl was not found on your PATH. Install OpenSSL (or LibreSSL) and try again.',
        );
    }
}

function collectHostnames(routes) {
    const hosts = new Set(['localhost']);

    routes.forEach((route) => {
        (route.hosts || []).forEach((host) => {
            hosts.add(String(host).toLowerCase().split(':')[0]);
        });
    });

    return Array.from(hosts).sort();
}

function buildOpensslConfig(hostnames) {
    const dnsEntries = hostnames
        .map((host, index) => `DNS.${index + 1} = ${host}`)
        .join('\n');

    return `[req]
distinguished_name = dn
prompt = no

[dn]
CN = ${hostnames[0]}

[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign

[v3_leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${dnsEntries}
IP.1 = 127.0.0.1
`;
}

function openssl(args) {
    execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function generateCa(paths) {
    console.log('• Generating root CA...');
    openssl(['genrsa', '-out', paths.caKey, '2048']);
    openssl([
        'req', '-x509', '-new', '-nodes',
        '-key', paths.caKey,
        '-sha256', '-days', String(CA_DAYS),
        '-subj', CA_SUBJECT,
        '-config', paths.config,
        '-extensions', 'v3_ca',
        '-out', paths.caCert,
    ]);
    fs.chmodSync(paths.caKey, 0o600);
}

function generateLeaf(paths, hostnames) {
    console.log('• Generating server certificate...');
    openssl(['genrsa', '-out', paths.serverKey, '2048']);
    openssl([
        'req', '-new',
        '-key', paths.serverKey,
        '-subj', `/CN=${hostnames[0]}`,
        '-config', paths.config,
        '-out', paths.csr,
    ]);
    openssl([
        'x509', '-req',
        '-in', paths.csr,
        '-CA', paths.caCert,
        '-CAkey', paths.caKey,
        '-CAcreateserial',
        '-days', String(LEAF_DAYS),
        '-sha256',
        '-extfile', paths.config,
        '-extensions', 'v3_leaf',
        '-out', paths.serverCert,
    ]);
    fs.chmodSync(paths.serverKey, 0o600);
    fs.rmSync(paths.csr, { force: true });
}

function verifySan(serverCert, hostnames) {
    const text = execFileSync('openssl', ['x509', '-in', serverCert, '-noout', '-text'], {
        encoding: 'utf8',
    });
    const match = text.match(/X509v3 Subject Alternative Name:[\s\S]*?\n\s*([^\n]+)/);
    const sanLine = match ? match[1] : '';

    const missing = hostnames.filter((host) => !sanLine.includes(`DNS:${host}`));

    if (!sanLine || missing.length > 0) {
        throw new Error(
            `Generated certificate is missing expected SAN entries: ${missing.join(', ') || '(none found)'}.\n`
            + 'Browsers reject certs without a matching SAN, so this would not work.',
        );
    }

    return sanLine;
}

function trustCa(caCert) {
    console.log('• Adding CA to the OS trust store...');

    if (process.platform === 'darwin') {
        execFileSync('sudo', [
            'security', 'add-trusted-cert', '-d',
            '-r', 'trustRoot',
            '-k', '/Library/Keychains/System.keychain',
            caCert,
        ], { stdio: 'inherit' });
        return;
    }

    if (process.platform === 'linux') {
        const dest = '/usr/local/share/ca-certificates/hub365-proxy-dev-ca.crt';
        execFileSync('sudo', ['cp', caCert, dest], { stdio: 'inherit' });
        execFileSync('sudo', ['update-ca-certificates'], { stdio: 'inherit' });
        return;
    }

    console.warn(`  ! Automatic trust is not supported on ${process.platform}. Trust ${caCert} manually.`);
}

function printNextSteps(paths, trusted) {
    console.log('\n✓ SSL certificates generated:');
    console.log(`    ${paths.caCert}`);
    console.log(`    ${paths.caKey}`);
    console.log(`    ${paths.serverCert}`);
    console.log(`    ${paths.serverKey}`);

    if (!trusted) {
        console.log('\nNext: trust the CA so browsers stop warning.');
        console.log('  Re-run with --trust (needs sudo), or trust it manually:');

        if (process.platform === 'darwin') {
            console.log(`    sudo security add-trusted-cert -d -r trustRoot \\`);
            console.log(`      -k /Library/Keychains/System.keychain "${paths.caCert}"`);
        } else if (process.platform === 'linux') {
            console.log(`    sudo cp "${paths.caCert}" /usr/local/share/ca-certificates/hub365-proxy-dev-ca.crt`);
            console.log('    sudo update-ca-certificates');
        } else {
            console.log(`    Import "${paths.caCert}" into your system/browser trust store.`);
        }
    }

    console.log('\nThen start the proxy:  sudo npm start');
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printHelp();
        return;
    }

    ensureOpensslAvailable();

    const sslDir = DEFAULT_OPTIONS.sslDir;
    const paths = {
        caKey: path.join(sslDir, CA_KEY_FILE),
        caCert: path.join(sslDir, CA_CERT_FILE),
        serverKey: path.join(sslDir, DEFAULT_OPTIONS.sslKeyFile),
        serverCert: path.join(sslDir, DEFAULT_OPTIONS.sslCertFile),
        csr: path.join(sslDir, 'server.csr'),
        config: path.join(sslDir, 'openssl.tmp.cnf'),
    };

    const certsExist = fs.existsSync(paths.serverKey) && fs.existsSync(paths.serverCert);

    if (certsExist && !args.force) {
        console.log(`SSL certificates already exist in ${sslDir}.`);
        console.log('Nothing to do. Re-run with --force to regenerate.');
        return;
    }

    const hostnames = collectHostnames(ROUTES);
    console.log(`Generating certificate for ${hostnames.length} hostname(s):`);
    hostnames.forEach((host) => console.log(`    ${host}`));

    fs.mkdirSync(sslDir, { recursive: true });
    fs.writeFileSync(paths.config, buildOpensslConfig(hostnames), { mode: 0o600 });

    try {
        const caExists = fs.existsSync(paths.caKey) && fs.existsSync(paths.caCert);

        if (!caExists || args.force) {
            generateCa(paths);
        } else {
            console.log('• Reusing existing root CA.');
        }

        generateLeaf(paths, hostnames);
        verifySan(paths.serverCert, hostnames);
    } finally {
        fs.rmSync(paths.config, { force: true });
    }

    if (args.trust) {
        trustCa(paths.caCert);
    }

    printNextSteps(paths, args.trust);
}

try {
    main();
} catch (err) {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
}
