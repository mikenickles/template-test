import { isConnected } from '../connections.ts';
import { getSettings } from '../settings.ts';
import { calendarTools } from './calendar.ts';
import { coreTools } from './core.ts';
import { driveTools } from './drive.ts';
import { gmailTools } from './gmail.ts';
import { spotifyTools } from './spotify.ts';
import { walletTools } from './wallet.ts';
import type { Tool } from './types.ts';

const registry = new Map<string, Tool>();

export function registerTools(tools: Tool[]): void {
  for (const tool of tools) registry.set(tool.name, tool);
}

registerTools([...coreTools, ...gmailTools, ...calendarTools, ...driveTools, ...spotifyTools, ...walletTools]);

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export function allTools(): Tool[] {
  return [...registry.values()];
}

/** The tools the model is offered right now: only for connected accounts, and none while paused. */
export function offeredTools(): Tool[] {
  if (getSettings().paused) return [];
  return allTools().filter((t) => (!t.needs || isConnected(t.needs)) && (!t.available || t.available()));
}

export function isMoneyTool(name: string): boolean {
  return registry.get(name)?.risk === 'money';
}
