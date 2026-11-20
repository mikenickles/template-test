import os from 'node:os';

// Adapters a phone on the home network can't reach: WSL, Hyper-V, Docker and VM software.
const VIRTUAL = /vethernet|wsl|hyper-v|docker|virtualbox|vmware|vbox|loopback/i;
// Private VPNs that reach the PC from anywhere. Tailscale names its adapter, and its addresses sit in 100.64.0.0/10.
const VPN = /tailscale|zerotier|wireguard|^wg\d/i;

const isCgnat = (address) => {
  const [a, b] = address.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
};

/**
 * Where a phone can reach this PC: `home` addresses on the local network (192.168.x and 10.x first),
 * and `away` addresses on a private VPN such as Tailscale, which work from anywhere.
 * `interfaces` is os.networkInterfaces(), passed in for tests.
 */
export function hubAddresses(port, interfaces = os.networkInterfaces()) {
  const home = [];
  const away = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const n of nets ?? []) {
      if (n.family !== 'IPv4' && n.family !== 4) continue;
      if (n.internal || n.address.startsWith('169.254.')) continue;
      if (VPN.test(name) || isCgnat(n.address)) away.push(`${n.address}:${port}`);
      else if (!VIRTUAL.test(name)) home.push(`${n.address}:${port}`);
    }
  }
  const homeFirst = (a) => Number(!/^(192\.168|10)\./.test(a));
  home.sort((a, b) => homeFirst(a) - homeFirst(b));
  return { home, away };
}
