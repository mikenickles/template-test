// Which web addresses agents may reach: public sites only, never this PC, the home network or a private VPN.
import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Whether an address is out on the internet, rather than this PC, the home network, or a private VPN.
 * Agents read pages they find on the web, so a page must never steer them at the router or the hub itself.
 */
export function isPublicAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT, and Tailscale
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::' || low === '::1') return false;
    if (low.startsWith('::ffff:')) return isPublicAddress(low.slice(7));
    if (/^f[cd]/.test(low) || /^fe[89ab]/.test(low) || low.startsWith('ff')) return false;
    return true;
  }
  return false;
}

/** A web address agents may use: http or https, on a public address. Throws, in words for the agent, when not. */
export async function checkUrl(raw, lookup = dns.lookup) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new Error("That isn't a web address.");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https pages can be read.');
  if (url.username || url.password) throw new Error("Addresses with a login in them can't be read.");
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new Error(`Couldn't find ${host}.`);
  if (!addresses.every(isPublicAddress)) throw new Error("That address is on this PC or the home network, which agents can't read.");
  return url;
}

