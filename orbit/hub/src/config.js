import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const dataDir = process.env.ORBIT_HUB_DATA || path.join(os.homedir(), '.orbit-hub');
export const configFile = path.join(dataDir, 'config.json');

const DEFAULT_CONFIG = {
  name: os.hostname(),
  port: 8787,
  discoveryPort: 8788,
  providers: {
    anthropic: { apiKey: '' },
    openai: { apiKey: '' },
    xai: { apiKey: '' },
    gemini: { apiKey: '' },
    openrouter: { apiKey: '' },
    ollama: { baseUrl: 'http://localhost:11434/v1' },
  },
};

/** Reads config.json, creating it with defaults on first run. */
export function loadConfig() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(configFile)) saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };
}

/** Writes config.json atomically. It holds API keys, so only the current user can read it. */
export function saveConfig(config) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${configFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, configFile);
}
