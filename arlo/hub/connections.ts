import { hasSecret } from './secrets.ts';
import type { Connection } from './tools/types.ts';

const SECRET: Record<Connection, string> = {
  google: 'google.tokens',
  spotify: 'spotify.tokens',
  stripe: 'stripe.key',
};

let demo = false;

/** Demo mode pretends every account is connected (to canned data). */
export function setDemoConnections(on: boolean): void {
  demo = on;
}

export function isConnected(service: Connection): boolean {
  return demo || hasSecret(SECRET[service]);
}
