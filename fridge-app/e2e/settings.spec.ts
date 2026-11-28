import type { Page } from '@playwright/test';
import { expect, goTab, test, typeRequest, restart } from './fixtures';

async function openSettings(app: Page) {
  await goTab(app, 'settings');
  await expect(app.getByTestId('settings')).toBeVisible();
}

test('settings is a section with every group of options', async ({ app }) => {
  await openSettings(app);
  for (const r of ['Family', 'Groceries', 'Home screen', 'Feel', 'Your data']) {
    await expect(app.getByTestId('settings').getByRole('region', { name: r })).toBeVisible();
  }
  await goTab(app, 'home');
  await expect(app.getByTestId('settings')).toHaveCount(0);
});

test('saying "open settings" opens it', async ({ app }) => {
  await typeRequest(app, 'Open settings');
  await expect(app.getByTestId('settings')).toBeVisible();
  await expect(app.getByTestId('assistant')).toHaveCount(0);
});

test('renaming a family member shows everywhere and the assistant understands the name', async ({ app }) => {
  await openSettings(app);
  await app.getByLabel('Name for Kid').fill('Ava');
  await goTab(app, 'home');

  await goTab(app, 'tasks');
  await expect(app.getByTestId('person-Ava')).toBeVisible();
  await expect(app.getByText('Ava’s tasks')).toBeVisible();
  await expect(app.locator('#new-task')).toHaveAttribute('placeholder', 'Add a task for Ava');

  await goTab(app, 'calendar');
  await expect(app.getByTestId('agenda')).toContainText('3:15 PM – 3:45 PM · Ava');

  await typeRequest(app, 'Remind Ava to practice the recorder');
  await expect(app.getByTestId('results')).toContainText('Ava: Practice the recorder · Today');
  await typeRequest(app, 'Book a haircut for Ava on Saturday at 11');
  await expect(app.getByTestId('results')).toContainText('Haircut · Sat, Nov 28 at 11 AM');
  await app.getByTestId('assistant-done').click();

  await goTab(app, 'tasks');
  await expect(app.locator('[data-testid=task-row][data-title="Practice the recorder"]')).toBeVisible();
  await goTab(app, 'calendar');
  await app.getByRole('button', { name: /^Sat, Nov 28,/ }).click();
  await expect(app.getByTestId('agenda')).toContainText('11 AM – 12 PM · Ava');

  // Names survive a restart, and a blank name falls back to the default.
  await restart(app);
  await openSettings(app);
  await expect(app.getByLabel('Name for Kid')).toHaveValue('Ava');
  await app.getByLabel('Name for Kid').fill('');
  await app.getByLabel('Name for Mom').click();
  await expect(app.getByLabel('Name for Kid')).toHaveValue('Kid');
});

test('default store is used for new groceries, from the list, meals and voice', async ({ app }) => {
  await openSettings(app);
  await app.getByRole('radio', { name: 'Target' }).click();
  await expect(app.getByRole('radio', { name: 'Target' })).toHaveAttribute('aria-checked', 'true');
  await goTab(app, 'groceries');
  await app.getByTestId('grocery-add').click();
  await expect(app.getByRole('button', { name: 'Add to Target list' })).toBeVisible();
  await app.getByTestId('scrim').click({ position: { x: 20, y: 120 } });

  await typeRequest(app, 'Add lemons to the list');
  await expect(app.getByTestId('results')).toContainText('Lemons · Target');
  await typeRequest(app, 'Add lemons to the Costco list');
  await expect(app.getByTestId('results')).toContainText('Lemons · Costco');
});

test('weather can be turned off and switched to Celsius', async ({ app }) => {
  const urls: string[] = [];
  app.on('request', (r) => { if (r.url().includes('open-meteo')) urls.push(r.url()); });
  await expect(app.getByTestId('weather')).toBeVisible();

  await openSettings(app);
  await app.getByTestId('set-units').getByRole('tab', { name: '°C' }).click();
  await goTab(app, 'home');
  await expect.poll(() => urls.some((u) => u.includes('temperature_unit=celsius'))).toBe(true);
  await expect(app.getByTestId('weather')).toBeVisible();

  await openSettings(app);
  await app.getByTestId('set-weather').click();
  await expect(app.getByTestId('set-units')).toHaveCount(0);
  await goTab(app, 'home');
  await expect(app.getByTestId('weather')).toHaveCount(0);
  await expect(app.getByTestId('greeting')).toBeVisible();
});

test('vibration and reduce motion switches work and are remembered', async ({ app }) => {
  await openSettings(app);
  await app.getByTestId('set-haptics').click();
  await expect(app.getByTestId('set-haptics')).toHaveAttribute('aria-checked', 'false');
  await app.getByTestId('set-motion').click();
  await expect(app.getByTestId('set-motion')).toHaveAttribute('aria-checked', 'true');
  await expect(app.getByTestId('app')).toHaveClass(/calm/);
  await restart(app);
  await expect(app.getByTestId('app')).toHaveClass(/calm/);
  await openSettings(app);
  await expect(app.getByTestId('set-haptics')).toHaveAttribute('aria-checked', 'false');
  await expect(app.getByTestId('set-motion')).toHaveAttribute('aria-checked', 'true');
});

test('start fresh asks first, empties everything, can be undone; sample data comes back', async ({ app }) => {
  await openSettings(app);
  await app.getByLabel('Name for Dad').fill('Sam');

  await app.getByTestId('set-fresh').click();
  await expect(app.getByTestId('confirm-sheet')).toContainText('Clear all lists?');
  await app.getByRole('button', { name: 'Cancel' }).click();
  await expect(app.getByTestId('confirm-sheet')).toHaveCount(0);

  await app.getByTestId('set-fresh').click();
  await app.getByTestId('confirm-yes').click();
  await expect(app.getByTestId('toast')).toContainText('All lists cleared');
  await goTab(app, 'home');

  await expect(app.getByTestId('home-stock')).toContainText('0 items');
  await expect(app.getByTestId('home-groceries')).toContainText('0');
  await expect(app.getByTestId('home-calendar')).toContainText('Nothing scheduled today.');
  await expect(app.getByTestId('home-task-count')).toHaveText('0/0');
  await goTab(app, 'calendar');
  await expect(app.getByTestId('agenda')).toContainText('Nothing planned');
  await goTab(app, 'tasks');
  await expect(app.getByTestId('person-Sam')).toBeVisible();
  await expect(app.getByTestId('task-row')).toHaveCount(0);

  await openSettings(app);
  await app.getByTestId('set-sample').click();
  await expect(app.getByTestId('confirm-sheet')).toContainText('Restore the sample data?');
  await app.getByTestId('confirm-yes').click();
  await goTab(app, 'home');
  await expect(app.getByTestId('home-stock')).toContainText('69 items');
  await expect(app.getByTestId('home-task-count')).toHaveText('5/20');
  await goTab(app, 'tasks');
  await expect(app.getByTestId('person-Sam')).toBeVisible();

  await openSettings(app);
  await app.getByTestId('set-fresh').click();
  await app.getByTestId('confirm-yes').click();
  await app.getByTestId('undo').click();
  await goTab(app, 'home');
  await expect(app.getByTestId('home-stock')).toContainText('69 items');
});

test('settings fit a small phone without sideways scrolling', async ({ app }) => {
  await app.setViewportSize({ width: 360, height: 740 });
  await openSettings(app);
  await app.waitForTimeout(500);
  const over = await app.evaluate(() => {
    const el = document.querySelector('[data-testid=settings] .scroll') as HTMLElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(1);
});
