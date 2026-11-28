import { test as base, expect, type Page } from '@playwright/test';

/** Thursday Nov 26 2026, 2:10 PM Pacific — a fixed "now" so dates and greetings are predictable. */
export const NOW = new Date('2026-11-26T14:10:00-08:00');

const WEATHER = {
  current: { temperature_2m: 52.4, weather_code: 0 },
  daily: {
    time: ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'],
    weather_code: [0, 1, 3, 61, 0],
    temperature_2m_max: [61, 63, 58, 54, 60],
    temperature_2m_min: [41, 44, 43, 40, 42]
  }
};

/** Fake speech recognizer: speaks whatever the test queued in window.__speech, word by word. */
const FAKE_SPEECH = `
  window.__speech = [];
  class FakeRec {
    constructor() { this.lang = ''; this.onresult = null; this.onend = null; this.onerror = null; }
    start() {
      if (window.__hang) return; // behaves like a recognizer that never reports back
      const text = window.__speech.shift() || '';
      const words = text ? text.split(' ') : [];
      let i = 0;
      if (!words.length) { setTimeout(() => this.onend && this.onend(), 120); return; }
      this._t = setInterval(() => {
        i++;
        this.onresult && this.onresult({ results: [[{ transcript: words.slice(0, i).join(' ') }]] });
        if (i >= words.length) { clearInterval(this._t); setTimeout(() => this.onend && this.onend(), 150); }
      }, 30);
    }
    stop() { clearInterval(this._t); if (!window.__hang) this.onend && this.onend(); }
    abort() {}
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
`;

export const test = base.extend<{ app: Page; errors: string[] }>({
  errors: async ({}, use) => { await use([]); },
  app: async ({ page, errors }, use) => {
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    // Pin the app's "now" (see src/dates.ts) instead of freezing the browser clock, which stalls fade animations.
    await page.addInitScript((t) => { (window as unknown as { __FF_NOW__: number }).__FF_NOW__ = t; }, NOW.getTime());
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: WEATHER }));
    await page.addInitScript(FAKE_SPEECH);
    await page.goto('/');
    await expect(page.getByTestId('app')).toBeVisible();
    await use(page);
    expect(errors, 'no console errors').toEqual([]);
  }
});

export { expect };

export type Section = 'home' | 'stock' | 'calendar' | 'tasks' | 'groceries' | 'meals' | 'settings';

/** Opens the sidebar and picks a section. */
export async function goTab(page: Page, tab: Section) {
  await page.getByTestId('menu-button').first().click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.getByTestId('nav-' + tab).click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-tab', tab);
  await expect(page.getByTestId('menu')).toHaveCount(0);
  await expect(page.getByTestId('menu-button')).toHaveCount(1);
}

/** Reloads the app, like closing and reopening it. */
export async function restart(page: Page) {
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
}

export async function say(page: Page, text: string) {
  await page.evaluate((t) => { (window as unknown as { __speech: string[] }).__speech.push(t); }, text);
}

/** Opens the assistant with nothing spoken, then types a request. */
export async function typeRequest(page: Page, text: string) {
  const sheet = page.getByTestId('assistant');
  if (!(await sheet.isVisible())) {
    await page.getByTestId('voice').click();
    await expect(sheet).toBeVisible();
  }
  const input = page.locator('#assistant-input');
  await expect(input).toBeVisible();
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}
