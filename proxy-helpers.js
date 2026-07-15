/**
 * Build a proxy target descriptor.
 *
 * @param {number|string} port - Target port.
 * @param {{ protocol?: string, host?: string }} [opts]
 * @returns {{ protocol: string, host: string, port: string }}
 */
function target(port, { protocol = 'https:', host = 'localhost' } = {}) {
    return { protocol, host, port: String(port) };
}

module.exports = { target };
