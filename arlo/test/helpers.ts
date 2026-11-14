// Shared test setup: an in-memory database and a throwaway encryption key.
process.env.ARLO_TEST_KEY = 'test-key';

import { openDb, resetDbForTests } from '../hub/db.ts';
import { subscribe } from '../hub/events.ts';
import type { HubEvent } from '../hub/events.ts';
import { resetSettingsCacheForTests } from '../hub/settings.ts';

export function freshDb(): void {
  resetDbForTests();
  openDb(':memory:');
  resetSettingsCacheForTests();
}

/** Collect hub events for the duration of a test. */
export function record(): { events: HubEvent[]; stop: () => void } {
  const events: HubEvent[] = [];
  const stop = subscribe((e) => events.push(e));
  return { events, stop };
}

export const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
