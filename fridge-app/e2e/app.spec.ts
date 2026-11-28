import { expect, goTab, say, test, typeRequest } from './fixtures';

test.describe('Home', () => {
  test('shows live greeting, weather, summary and counts', async ({ app }) => {
    await expect(app.getByTestId('greeting')).toHaveText('Good afternoon');
    await expect(app.getByTestId('weather')).toContainText('52°');
    await expect(app.getByTestId('weather')).toContainText('H 61° · L 41°');
    await expect(app.getByTestId('summary')).toContainText('Chicken tacos for dinner');
    await expect(app.getByTestId('summary')).toContainText('School pickup at 3:15 PM');
    await expect(app.getByTestId('home-task-count')).toHaveText('5/20');
    await expect(app.getByTestId('home-calendar')).toContainText('Soccer practice');
    await expect(app.getByTestId('home-calendar')).toContainText('Dentist appointment');
    await expect(app.getByTestId('home-stock')).toContainText('69 items');
    await expect(app.getByTestId('home-groceries')).toContainText('15');
    await expect(app.getByTestId('home-dinner')).toContainText('Chicken tacos');
  });

  test('each card opens its section', async ({ app }) => {
    const cards: [string, string, string?][] = [
      ['home-calendar', 'calendar'], ['home-tasks', 'tasks'], ['home-stock', 'stock'],
      ['home-dinner', 'food', 'Meals'], ['home-groceries', 'food', 'Groceries']
    ];
    for (const [card, tab, sub] of cards) {
      await goTab(app, 'home');
      await app.getByTestId(card).click();
      await expect(app.getByTestId('app')).toHaveAttribute('data-tab', tab);
      if (sub) await expect(app.getByRole('tab', { name: new RegExp(sub) })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('hides weather when location is unavailable', async ({ app, context }) => {
    await context.clearPermissions();
    await app.evaluate(() => localStorage.removeItem('family-fridge:weather'));
    await app.reload();
    await expect(app.getByTestId('greeting')).toBeVisible();
    await expect(app.getByTestId('weather')).toHaveCount(0);
  });
});

test('tab bar reaches every section and marks the current one', async ({ app }) => {
  for (const t of ['stock', 'calendar', 'tasks', 'food', 'home'] as const) {
    await goTab(app, t);
    await expect(app.getByTestId('tab-' + t)).toHaveAttribute('aria-current', 'page');
  }
  await expect(app.locator('.tab')).toHaveCount(5);
});

test.describe('Stock', () => {
  test('quantities go up and down, low and out badges update, and empty items can be removed', async ({ app }) => {
    await goTab(app, 'stock');
    const milk = app.locator('[data-testid=stock-row][data-name="Milk"]');
    await expect(milk.getByTestId('stock-qty')).toHaveText('1 gal');
    await expect(milk).toContainText('Low');
    await milk.getByRole('button', { name: 'Increase Milk' }).click();
    await expect(milk.getByTestId('stock-qty')).toHaveText('2 gal');
    await expect(milk).not.toContainText('Low');

    const spinach = app.locator('[data-testid=stock-row][data-name="Spinach"]');
    await spinach.getByRole('button', { name: 'Decrease Spinach' }).click();
    await expect(spinach.getByTestId('stock-qty')).toHaveText('0 bag');
    await expect(spinach).toContainText('Out');
    await spinach.getByRole('button', { name: 'Remove Spinach' }).click();
    await expect(spinach).toHaveCount(0);
  });

  test('location tabs switch lists', async ({ app }) => {
    await goTab(app, 'stock');
    await app.getByRole('tab', { name: /Freezer/ }).click();
    await expect(app.getByRole('tab', { name: /Freezer/ })).toHaveAttribute('aria-selected', 'true');
    await expect(app.locator('[data-testid=stock-row][data-name="Ice cream"]')).toBeVisible();
    await expect(app.locator('[data-testid=stock-row][data-name="Milk"]')).toHaveCount(0);
    await app.getByRole('tab', { name: /Pantry/ }).click();
    await expect(app.locator('[data-testid=stock-row][data-name="Bananas"]')).toBeVisible();
  });

  test('new items sort themselves into the right place', async ({ app }) => {
    await goTab(app, 'stock');
    await app.getByTestId('stock-add').click();
    await app.locator('#stock-name').fill('strawberry ice cream');
    await expect(app.getByTestId('stock-guess')).toContainText('Goes in the freezer');
    await app.getByRole('button', { name: 'Add to stock' }).click();
    await expect(app.getByTestId('stock-sheet')).toHaveCount(0);
    await expect(app.getByRole('tab', { name: /Freezer/ })).toHaveAttribute('aria-selected', 'true');
    await expect(app.getByTestId('stock-summary')).toHaveText('Added Strawberry ice cream to Freezer · Frozen');
    await expect(app.locator('[data-testid=stock-row][data-name="Strawberry ice cream"]')).toBeVisible();

    await app.getByTestId('stock-add').click();
    await app.locator('#stock-name').fill('kale');
    await app.locator('#stock-qty').fill('2');
    await app.getByRole('button', { name: 'Add to stock' }).click();
    await expect(app.getByRole('tab', { name: /Fridge/ })).toHaveAttribute('aria-selected', 'true');
    await expect(app.locator('[data-testid=stock-row][data-name="Kale"]').getByTestId('stock-qty')).toHaveText('2');
  });

  test('add sheet closes by tapping outside', async ({ app }) => {
    await goTab(app, 'stock');
    await app.getByTestId('stock-add').click();
    await expect(app.getByTestId('stock-sheet')).toBeVisible();
    await app.getByTestId('scrim').click({ position: { x: 20, y: 120 } });
    await expect(app.getByTestId('stock-sheet')).toHaveCount(0);
  });
});

test.describe('Calendar', () => {
  test('month view, navigation and picking a day', async ({ app }) => {
    await goTab(app, 'calendar');
    await expect(app.getByTestId('cal-title')).toHaveText('November 2026');
    const agenda = app.getByTestId('agenda');
    await expect(agenda).toContainText('Today · Thu, Nov 26');
    await expect(agenda).toContainText('School pickup');
    await expect(agenda).toContainText('Soccer practice');

    await app.getByTestId('cal-next').click();
    await expect(app.getByTestId('cal-title')).toHaveText('December 2026');
    await app.getByTestId('cal-prev').click();
    await expect(app.getByTestId('cal-title')).toHaveText('November 2026');
    await expect(agenda).toHaveCount(1);

    await app.getByRole('button', { name: /^Fri, Nov 27,/ }).click();
    await expect(agenda).toContainText('Fri, Nov 27');
    await expect(agenda).toContainText('Dentist appointment');
    await expect(agenda).toContainText('Movie night');
  });

  test('swiping the month changes it', async ({ app }) => {
    await goTab(app, 'calendar');
    const grid = app.getByTestId('month-view');
    const box = (await grid.boundingBox())!;
    await app.mouse.move(box.x + box.width - 30, box.y + 120);
    await app.mouse.down();
    await app.mouse.move(box.x + 140, box.y + 125, { steps: 8 });
    await app.mouse.move(box.x + 40, box.y + 125, { steps: 4 });
    await app.mouse.up();
    await expect(app.getByTestId('cal-title')).toHaveText('December 2026');
  });

  test('add, open and delete an event; skip a weekly routine', async ({ app }) => {
    await goTab(app, 'calendar');
    await app.getByRole('button', { name: /^Fri, Nov 27,/ }).click();
    await app.getByTestId('cal-add').click();
    await app.locator('#ev-title').fill('Piano recital');
    await app.locator('#ev-time').fill('18:00');
    await app.getByRole('button', { name: 'Kid', exact: true }).click();
    await app.getByRole('button', { name: 'Add to calendar' }).click();
    const agenda = app.getByTestId('agenda');
    await expect(agenda).toContainText('Piano recital');
    await expect(agenda).toContainText('6 PM – 7 PM · Kid');

    await agenda.getByTestId('event-row').filter({ hasText: 'Piano recital' }).click();
    await expect(app.getByTestId('event-detail')).toContainText('Piano recital');
    await app.getByTestId('event-delete').click();
    await expect(agenda).not.toContainText('Piano recital');

    await agenda.getByTestId('event-row').filter({ hasText: 'Movie night' }).click();
    await expect(app.getByTestId('event-delete')).toHaveText('Skip this week');
    await app.getByTestId('event-delete').click();
    await expect(agenda).not.toContainText('Movie night');
    // Next week's movie night is still there.
    await app.getByRole('button', { name: /^Fri, Dec 4,/ }).click();
    await expect(agenda).toHaveCount(1);
    await expect(agenda).toContainText('Movie night');
  });

  test('week and day views', async ({ app }) => {
    await goTab(app, 'calendar');
    await app.getByRole('tab', { name: 'Week' }).click();
    await expect(app.getByTestId('cal-title')).toHaveText('Nov 23 – 29');
    await expect(app.getByTestId('week-view')).toHaveCount(1);
    await expect(app.getByTestId('week-view').locator('section')).toHaveCount(7);
    await expect(app.getByTestId('week-view')).toContainText('Swim lessons');
    await app.getByTestId('cal-next').click();
    await expect(app.getByTestId('cal-title')).toHaveText('Nov 30 – Dec 6');
    await app.getByTestId('cal-prev').click();
    await expect(app.getByTestId('week-view')).toHaveCount(1);

    await app.getByRole('button', { name: 'Open Sat, Nov 28' }).click();
    await expect(app.getByRole('tab', { name: 'Day' })).toHaveAttribute('aria-selected', 'true');
    await expect(app.getByTestId('cal-title')).toHaveText('Sat, Nov 28');
    await expect(app.getByTestId('day-view')).toHaveCount(1);
    await expect(app.getByTestId('day-view')).toContainText('Farmers market');

    await app.getByTestId('cal-next').click();
    await expect(app.getByTestId('cal-title')).toHaveText('Sun, Nov 29');
    await expect(app.getByTestId('day-view')).toHaveCount(1);
    await expect(app.getByTestId('day-view')).toContainText('Meal prep');
    await app.getByTestId('cal-today').click();
    await expect(app.getByTestId('cal-title')).toHaveText('Thu, Nov 26');
  });
});

test.describe('Tasks', () => {
  test('switch people, add, complete, hide and delete tasks', async ({ app }) => {
    await goTab(app, 'tasks');
    await expect(app.getByTestId('tasks-progress')).toHaveText('2 of 6 done');
    await app.getByTestId('person-Dad').click();
    await expect(app.getByTestId('tasks-progress')).toHaveCount(1);
    await expect(app.getByTestId('tasks-progress')).toHaveText('1 of 5 done');
    await expect(app.getByText('Dad’s tasks')).toBeVisible();

    await app.locator('#new-task').fill('clean the gutters');
    await app.getByRole('button', { name: 'Add task for Dad' }).click();
    const row = app.locator('[data-testid=task-row][data-title="Clean the gutters"]');
    await expect(row).toBeVisible();
    await expect(app.getByTestId('tasks-progress')).toHaveText('1 of 6 done');

    await row.getByRole('checkbox').click();
    await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    await expect(app.getByTestId('tasks-progress')).toHaveText('2 of 6 done');
    await expect(app.getByTestId('tasks-summary')).toHaveText('6 of 21 done across the family');

    await app.getByTestId('hide-done').click();
    await expect(row).toHaveCount(0);
    await expect(app.locator('[data-testid=task-row][data-title="Take out recycling"]')).toHaveCount(0);
    await app.getByTestId('hide-done').click();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Delete Clean the gutters' }).click();
    await expect(row).toHaveCount(0);
    await expect(app.getByTestId('tasks-progress')).toHaveText('1 of 5 done');
  });
});

test.describe('Food · Meals', () => {
  test('week plan: remove and add dinners', async ({ app }) => {
    await goTab(app, 'food');
    const tonight = app.getByTestId('plan-day').first();
    await expect(tonight).toHaveAttribute('data-meal', 'Chicken tacos');
    await app.getByRole('button', { name: 'Remove Chicken tacos' }).click();
    await expect(tonight).toHaveAttribute('data-meal', '');

    const first = app.getByTestId('idea').first();
    const name = (await first.getAttribute('data-name'))!;
    await first.getByTestId('plan-btn').click();
    await expect(tonight).toHaveAttribute('data-meal', name);
    await expect(first.getByTestId('plan-btn')).toHaveText('Planned · Tonight');
    await expect(app.getByTestId('toast')).toContainText(name + ' planned for tonight');

    await goTab(app, 'home');
    await expect(app.getByTestId('home-dinner')).toContainText(name);
  });

  test('filters, missing ingredients go to groceries, and new ideas reshuffle', async ({ app }) => {
    await goTab(app, 'food');
    await app.getByRole('button', { name: 'Vegetarian' }).click();
    const names = await app.getByTestId('idea').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(names.sort()).toEqual(['Black bean quesadillas', 'Grilled cheese & tomato soup', 'Lemon spinach pasta', 'Spinach & cheddar frittata']);

    const pasta = app.locator('[data-testid=idea][data-name="Lemon spinach pasta"]');
    await expect(pasta).toContainText('Need Parmesan');
    await pasta.getByTestId('need-btn').click();
    await expect(pasta.getByTestId('need-btn')).toHaveText('On the list');
    await expect(app.getByTestId('toast')).toContainText('Added 1 to Groceries');
    await expect(app.getByRole('tab', { name: /Groceries/ })).toContainText('16');

    await app.getByTestId('undo').click();
    await expect(pasta.getByTestId('need-btn')).toHaveText('Add 1 to groceries');

    await app.getByRole('button', { name: 'Vegetarian' }).click();
    await app.getByTestId('new-ideas').click();
    await expect(app.locator('.shim').first()).toBeVisible();
    await expect(app.getByTestId('idea')).toHaveCount(6);
  });
});

test.describe('Food · Groceries', () => {
  test('filter by store, check off, put away into stock, undo', async ({ app }) => {
    await goTab(app, 'food');
    await app.getByRole('tab', { name: /Groceries/ }).click();
    await expect(app.getByTestId('store-card')).toHaveCount(4);
    await app.getByRole('tab', { name: /^Costco/ }).click();
    await expect(app.getByTestId('store-card')).toHaveCount(1);
    await app.getByRole('tab', { name: /^All/ }).click();
    await expect(app.getByTestId('store-card')).toHaveCount(4);

    const towels = app.locator('[data-testid=grocery-row][data-name="Paper towels"]');
    await towels.getByRole('checkbox').click();
    await expect(towels.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    await expect(app.getByTestId('put-away')).toContainText('Put away 4 checked');
    await app.getByTestId('put-away').click();
    await expect(app.getByTestId('toast')).toContainText('Put away 4 items into Stock');
    await expect(towels).toHaveCount(0);
    await app.getByTestId('undo').click();
    await expect(towels).toBeVisible();
    await expect(app.getByTestId('put-away')).toContainText('Put away 4 checked');

    await app.getByTestId('put-away').click();
    await expect(towels).toHaveCount(0);
    await goTab(app, 'stock');
    await app.getByRole('tab', { name: /Pantry/ }).click();
    await expect(app.locator('[data-testid=stock-row][data-name="Paper towels"]')).toBeVisible();
    await app.getByRole('tab', { name: /Fridge/ }).click();
    await expect(app.locator('[data-testid=stock-row][data-name="Avocados"]')).toHaveCount(0);
    await app.getByRole('tab', { name: /Pantry/ }).click();
    await expect(app.locator('[data-testid=stock-row][data-name="Avocados"]').getByTestId('stock-qty')).toHaveText('4');
  });

  test('add and remove items', async ({ app }) => {
    await goTab(app, 'food');
    await app.getByRole('tab', { name: /Groceries/ }).click();
    await app.getByTestId('grocery-add').click();
    await app.locator('#g-name').fill('limes');
    await app.locator('#g-qty').fill('6');
    await app.getByTestId('grocery-sheet').getByRole('button', { name: 'Target' }).click();
    await app.getByRole('button', { name: 'Add to Target list' }).click();
    await app.getByTestId('scrim').click({ position: { x: 20, y: 120 } });
    const limes = app.getByRole('region', { name: 'Target' }).locator('[data-testid=grocery-row][data-name="Limes"]');
    await expect(limes).toContainText('6');

    const oil = app.locator('[data-testid=grocery-row][data-name="Olive oil"]');
    await oil.getByRole('button', { name: 'Remove Olive oil' }).click();
    await expect(oil).toHaveCount(0);
  });
});

test.describe('Voice assistant', () => {
  test('listens, shows the words live, and carries out several requests at once', async ({ app }) => {
    await say(app, 'Add paper plates and limes to the Target list, and put the vet on Friday at 10');
    await app.getByTestId('voice').click();
    await expect(app.getByTestId('assistant')).toBeVisible();
    await expect(app.getByTestId('heard')).toContainText('put the vet on Friday at 10');
    await expect(app.getByTestId('result')).toHaveCount(2);
    await expect(app.getByTestId('results')).toContainText('Paper plates, Limes · Target');
    await expect(app.getByTestId('results')).toContainText('Vet · Tomorrow at 10 AM');

    await app.getByTestId('result').nth(1).click();
    await expect(app.getByTestId('app')).toHaveAttribute('data-tab', 'calendar');
    await app.getByRole('button', { name: /^Fri, Nov 27,/ }).click();
    await expect(app.getByTestId('agenda')).toContainText('Vet');

    await goTab(app, 'food');
    await app.getByRole('tab', { name: /Groceries/ }).click();
    await expect(app.getByRole('region', { name: 'Target' })).toContainText('Paper plates');
  });

  test('typed requests: tasks, stock, out-of, done, meal plan, unknown', async ({ app }) => {
    const results = app.getByTestId('results');
    await typeRequest(app, 'Remind Dad to fix the sink tomorrow');
    await expect(results).toContainText('Dad: Fix the sink · Tomorrow');
    await typeRequest(app, "We're out of coffee");
    await expect(results).toContainText('Added Coffee');
    await expect(results).toContainText('Coffee marked as out');
    await typeRequest(app, 'I just bought a dozen eggs');
    await expect(results).toContainText('Eggs +12 · Fridge');
    await typeRequest(app, 'Mark finish homework done');
    await expect(results).toContainText('Finish homework marked done');
    await typeRequest(app, 'Plan tacos for dinner on Sunday');
    await expect(results).toContainText('Tacos for dinner Sun, Nov 29');
    await typeRequest(app, 'purple monkey dishwasher');
    await expect(results).toContainText('Not sure');
    await app.getByTestId('assistant-done').click();
    await expect(app.getByTestId('assistant')).toHaveCount(0);

    await goTab(app, 'tasks');
    await app.getByTestId('person-Dad').click();
    await expect(app.getByTestId('tasks-progress')).toHaveCount(1);
    await expect(app.locator('[data-testid=task-row][data-title="Fix the sink"]')).toContainText('Tomorrow');
    await app.getByTestId('person-Kid').click();
    await expect(app.getByTestId('tasks-progress')).toHaveCount(1);
    await expect(app.locator('[data-testid=task-row][data-title="Finish homework"]').getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

    await goTab(app, 'stock');
    await expect(app.locator('[data-testid=stock-row][data-name="Eggs"]').getByTestId('stock-qty')).toHaveText('20');
    await app.getByRole('tab', { name: /Pantry/ }).click();
    await expect(app.locator('[data-testid=stock-row][data-name="Coffee"]')).toContainText('Out');

    await goTab(app, 'food');
    await expect(app.getByTestId('plan-day').nth(3)).toHaveAttribute('data-meal', 'Tacos');
  });

  test('navigation commands and example chips move you around', async ({ app }) => {
    await typeRequest(app, 'Open the calendar');
    await expect(app.getByTestId('app')).toHaveAttribute('data-tab', 'calendar');
    await expect(app.getByTestId('assistant')).toHaveCount(0);

    await app.getByTestId('voice').click();
    await app.getByRole('button', { name: "What's for dinner?" }).click();
    await expect(app.getByTestId('results')).toContainText('Tonight is Chicken tacos');
    await expect(app.getByTestId('app')).toHaveAttribute('data-tab', 'food');
    await expect(app.getByRole('tab', { name: /Meals/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('voice button stays on every screen and toggles the panel', async ({ app }) => {
    for (const t of ['home', 'stock', 'calendar', 'tasks', 'food'] as const) {
      await goTab(app, t);
      await expect(app.getByTestId('voice')).toBeVisible();
      await expect(app.getByTestId('voice')).toBeInViewport();
    }
    await app.getByTestId('voice').click();
    await expect(app.getByTestId('assistant')).toBeVisible();
    await expect(app.getByTestId('assistant-error')).toContainText('didn’t hear anything');
    await app.getByTestId('voice').click();
    await expect(app.getByTestId('assistant')).toHaveCount(0);
  });
});

test('everything is saved and survives a restart', async ({ app }) => {
  await goTab(app, 'tasks');
  await app.locator('#new-task').fill('Walk the dog');
  await app.getByRole('button', { name: 'Add task for Kid' }).click();
  await goTab(app, 'food');
  await app.getByRole('button', { name: 'Remove Chicken tacos' }).click();
  await app.reload();
  await goTab(app, 'tasks');
  await expect(app.locator('[data-testid=task-row][data-title="Walk the dog"]')).toBeVisible();
  await goTab(app, 'food');
  await expect(app.getByTestId('plan-day').first()).toHaveAttribute('data-meal', '');
});

test('no sideways scrolling on a small phone', async ({ app }) => {
  await app.setViewportSize({ width: 360, height: 740 });
  for (const t of ['home', 'stock', 'calendar', 'tasks', 'food'] as const) {
    await goTab(app, t);
    await app.waitForTimeout(450);
    const over = await app.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll('.scroll, .screen-head').forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') bad.push(el.className + ' ' + el.scrollWidth + '>' + el.clientWidth);
      });
      if (document.documentElement.scrollWidth > window.innerWidth) bad.push('page ' + document.documentElement.scrollWidth);
      return bad;
    });
    expect(over, 'overflow on ' + t).toEqual([]);
  }
});

test('sheets can be swiped down to close', async ({ app }) => {
  await goTab(app, 'food');
  await app.getByRole('tab', { name: /Groceries/ }).click();
  await app.getByTestId('grocery-add').click();
  const sheet = app.getByTestId('grocery-sheet');
  await expect(sheet).toBeVisible();
  await app.waitForTimeout(500);
  const grip = (await sheet.locator('.sheet-grip').boundingBox())!;
  await app.mouse.move(grip.x + grip.width / 2, grip.y + 2);
  await app.mouse.down();
  await app.mouse.move(grip.x + grip.width / 2, grip.y + 120, { steps: 6 });
  await app.mouse.move(grip.x + grip.width / 2, grip.y + 260, { steps: 6 });
  await app.mouse.up();
  await expect(sheet).toHaveCount(0);
});

test('Stop always ends listening, even if the recognizer goes silent', async ({ app }) => {
  await app.evaluate(() => { (window as unknown as { __hang: boolean }).__hang = true; });
  await app.getByTestId('voice').click();
  await expect(app.getByTestId('assistant-state')).toHaveText('Listening…');
  await app.getByTestId('assistant-done').click();
  await expect(app.getByTestId('assistant-state')).not.toHaveText('Listening…', { timeout: 3000 });
  await expect(app.locator('#assistant-input')).toBeVisible();
  await app.getByTestId('assistant-done').click();
  await expect(app.getByTestId('assistant')).toHaveCount(0);
  await goTab(app, 'stock');
});
