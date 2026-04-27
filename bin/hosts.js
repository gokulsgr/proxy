#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ROUTES } = require('../index');

const DEFAULT_HOSTS_FILE = '/etc/hosts';
const DEFAULT_IP = '127.0.0.1';
const MANAGED_HEADER = '# hub365 proxy hosts';

const knownHosts = Array.from(new Set(ROUTES.flatMap((route) => route.hosts))).sort();

function printHelp() {
    console.log(`Usage:
  npm run hosts -- status [host ...]
  npm run hosts -- list
  npm run hosts -- enable <host ...>
  npm run hosts -- enable --all
  npm run hosts -- disable <host ...>
  npm run hosts -- disable --all
  npm run hosts -- remove <host ...>
  npm run hosts -- remove --all

Options:
  --file <path>   Hosts file to read/write. Default: ${DEFAULT_HOSTS_FILE}
  --ip <ip>       IP address to use when enabling hosts. Default: ${DEFAULT_IP}
  --all           Use every host from the proxy route config
  --dry-run       Print the updated file without writing it
  --help          Show this help

Examples:
  hosts list
  npm run hosts -- status --all
  sudo npm run hosts -- enable perkinswill.fluentmind.dev ai.hub.perkinswill.com
  sudo npm run hosts -- disable --all
  sudo npm run hosts -- remove x.com

Note:
  list shows active domains found in the hosts file.
`);
}

function parseArgs(argv) {
    const args = [...argv];
    let command = args.shift() || 'status';

    if (command === '--help' || command === '-h') {
        command = 'help';
    }

    const options = {
        command,
        file: DEFAULT_HOSTS_FILE,
        ip: DEFAULT_IP,
        all: false,
        dryRun: false,
        hosts: [],
    };

    while (args.length > 0) {
        const arg = args.shift();

        if (arg === '--help' || arg === '-h') {
            options.command = 'help';
            continue;
        }

        if (arg === '--all') {
            options.all = true;
            continue;
        }

        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        if (arg === '--file') {
            options.file = args.shift();
            continue;
        }

        if (arg === '--ip') {
            options.ip = args.shift();
            continue;
        }

        options.hosts.push(arg);
    }

    if (options.all) {
        options.hosts = knownHosts;
    }

    return options;
}

function normalizeHost(host) {
    return String(host || '').trim().toLowerCase();
}

function parseHostsLine(line) {
    const match = line.match(/^(\s*#\s*)?([0-9a-f:.]+)\s+(.+)$/i);

    if (!match) {
        return null;
    }

    const hostPart = match[3].split('#')[0].trim();
    const hosts = hostPart ? hostPart.split(/\s+/).map(normalizeHost) : [];

    return {
        commented: Boolean(match[1]),
        ip: match[2],
        hosts,
    };
}

function lineHasHost(line, host) {
    const parsed = parseHostsLine(line);
    return parsed ? parsed.hosts.includes(host) : false;
}

function getHostsFileHosts(content) {
    return content
        .split('\n')
        .flatMap((line) => {
            const parsed = parseHostsLine(line);
            return parsed && !parsed.commented ? parsed.hosts : [];
        })
        .filter((host) => host.includes('.'));
}

function commentLine(line) {
    return line.trimStart().startsWith('#') ? line : `#${line}`;
}

function setHostLine(host, ip) {
    return `${ip}\t${host}`;
}

function formatHostLine(parsed) {
    const prefix = parsed.commented ? '#' : '';
    return `${prefix}${parsed.ip}\t${parsed.hosts.join(' ')}`;
}

function ensureTrailingNewline(content) {
    return content.endsWith('\n') ? content : `${content}\n`;
}

function setHost(content, host, enabled, ip) {
    const lines = content.split('\n');
    let found = false;
    let activated = false;
    let changed = false;

    const nextLines = lines.map((line) => {
        if (!lineHasHost(line, host)) {
            return line;
        }

        found = true;

        if (!enabled) {
            const nextLine = commentLine(line);
            changed = changed || nextLine !== line;
            return nextLine;
        }

        if (!activated) {
            activated = true;
            const nextLine = setHostLine(host, ip);
            changed = changed || nextLine !== line;
            return nextLine;
        }

        const nextLine = commentLine(line);
        changed = changed || nextLine !== line;
        return nextLine;
    });

    if (enabled && !activated) {
        if (!found) {
            nextLines.push(MANAGED_HEADER);
        }

        nextLines.push(setHostLine(host, ip));
        changed = true;
    }

    return {
        content: nextLines.join('\n'),
        changed,
    };
}

function removeHost(content, host) {
    let changed = false;

    const lines = content.split('\n').flatMap((line) => {
        const parsed = parseHostsLine(line);

        if (!parsed?.hosts.includes(host)) {
            return [line];
        }

        changed = true;

        const remainingHosts = parsed.hosts.filter((entry) => entry !== host);

        if (remainingHosts.length === 0) {
            return [];
        }

        return [formatHostLine({ ...parsed, hosts: remainingHosts })];
    });

    return {
        content: lines.join('\n'),
        changed,
    };
}

function getHostStatus(content, host) {
    const matches = content
        .split('\n')
        .map((line) => ({ line, parsed: parseHostsLine(line) }))
        .filter(({ parsed }) => parsed?.hosts.includes(host));

    const active = matches.filter(({ parsed }) => !parsed.commented);
    const commented = matches.filter(({ parsed }) => parsed.commented);

    if (active.length > 0) {
        return {
            state: 'enabled',
            ip: active.map(({ parsed }) => parsed.ip).join(', '),
        };
    }

    if (commented.length > 0) {
        return {
            state: 'disabled',
            ip: commented.map(({ parsed }) => parsed.ip).join(', '),
        };
    }

    return {
        state: 'missing',
        ip: '',
    };
}

function requireHosts(options) {
    if (options.hosts.length > 0) {
        return;
    }

    throw new Error(`No hosts specified. Use --all or pass one or more host names.`);
}

function readHostsFile(file) {
    return fs.readFileSync(path.resolve(file), 'utf8');
}

function writeHostsFile(file, content) {
    fs.writeFileSync(path.resolve(file), ensureTrailingNewline(content), 'utf8');
}

function run(options) {
    if (options.command === 'help') {
        printHelp();
        return;
    }

    if (options.command === 'list') {
        const content = readHostsFile(options.file);
        const hosts = Array.from(new Set(getHostsFileHosts(content))).sort();
        hosts.forEach((host) => console.log(host));
        return;
    }

    if (!['status', 'enable', 'disable', 'remove'].includes(options.command)) {
        throw new Error(`Unknown command: ${options.command}`);
    }

    if (options.command === 'status' && options.hosts.length === 0) {
        options.hosts = knownHosts;
    }

    requireHosts(options);

    let content = readHostsFile(options.file);

    if (options.command === 'status') {
        options.hosts.forEach((rawHost) => {
            const host = normalizeHost(rawHost);
            const status = getHostStatus(content, host);
            const ip = status.ip ? ` ${status.ip}` : '';
            console.log(`${status.state.padEnd(8)} ${host}${ip}`);
        });
        return;
    }

    let changed = false;

    options.hosts.forEach((rawHost) => {
        const host = normalizeHost(rawHost);
        const result = options.command === 'remove'
            ? removeHost(content, host)
            : setHost(content, host, options.command === 'enable', options.ip);

        content = result.content;
        changed = changed || result.changed;
    });

    if (options.dryRun) {
        process.stdout.write(ensureTrailingNewline(content));
        return;
    }

    if (changed) {
        writeHostsFile(options.file, content);
    }

    console.log(changed ? 'Hosts file updated.' : 'No changes needed.');
}

try {
    run(parseArgs(process.argv.slice(2)));
} catch (err) {
    console.error(err.message);
    console.error('Run `npm run hosts -- --help` for usage.');
    process.exit(1);
}
