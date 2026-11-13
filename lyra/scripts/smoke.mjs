// End-to-end check of the app on a phone-sized screen, using the practice model.
// It runs the same build the Android app ships, in Chromium.
// Run: npm run build && npm run smoke [-- <screenshot folder>]
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
// Playwright is a dev-only tool here; it is not one of Lyra's dependencies.
const { chromium, devices } = require("playwright");

const root = resolve(import.meta.dirname, "..");
const shots = resolve(process.argv[2] ?? join(root, "smoke-shots"));
mkdirSync(shots, { recursive: true });
const port = 4399;
const base = `http://localhost:${port}`;

const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((ok, fail) => {
  server.stdout.on("data", (d) => String(d).includes(String(port)) && ok());
  server.on("exit", (c) => fail(new Error(`preview exited ${c}`)));
  setTimeout(() => fail(new Error("preview did not start")), 20_000);
});

const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

// a pretend microphone, so live voice can be tested
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: "light" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    await page.waitForTimeout(400); // let entrance animations finish
    await page.screenshot({ path: join(shots, `${name}.png`) });
  };

  await page.goto(base);
  await page.getByText("I'm Lyra.").waitFor();
  check(true, "app starts on the welcome screen");
  await shot("light-1-welcome");

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: /AI model.*Practice mode/ }).waitFor();
  check((await page.locator(".settings-home .item").count()) === 7, "settings opens on seven clear areas");
  await shot("light-5-settings");
  await page.getByRole("link", { name: /You and appearance/ }).click();
  await page.getByLabel("What should Lyra call you?").fill("Sam");
  await page.getByRole("button", { name: "Save" }).first().click();
  await page.getByText("Saved", { exact: true }).first().waitFor();
  check(true, "settings saves your name");
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("link", { name: /Notifications and privacy/ }).click();
  check((await page.getByRole("switch", { name: /Notify me/ }).isChecked()) === true, "notifications are on by default");
  check((await page.getByRole("radio", { name: "Off" }).getAttribute("aria-checked")) === "true", "heads-ups are off until you choose");
  await page.getByRole("radio", { name: "Light" }).click();
  await page.getByText("Heads-ups: Light").waitFor();
  check(await page.getByRole("switch", { name: /Check in when it's quiet/ }).isChecked(), "with heads-ups on, Lyra also checks in when things are quiet (on by default)");
  await page.getByLabel("Quiet from").fill("22:30");
  await page.getByText("Quiet hours saved").waitFor();
  await shot("light-32-heads-ups");
  await page.reload();
  check((await page.getByLabel("Quiet from").inputValue()) === "22:30", "heads-ups can be turned on, with quiet hours that stick");
  await page.getByRole("radio", { name: "Off" }).click();
  await page.getByText("Heads-ups off").waitFor();
  await page.getByRole("link", { name: "Back" }).click();

  // ---- AI model: add a key, pick from the models it can use (a pretend Claude API) ----
  await page.route("https://api.anthropic.com/v1/models**", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: "claude-sonnet-test", display_name: "Claude Sonnet Test", created_at: "2026-05-01T00:00:00Z" },
          { id: "claude-haiku-test", display_name: "Claude Haiku Test", created_at: "2026-03-01T00:00:00Z" },
        ],
      },
    }),
  );
  await page.getByRole("link", { name: /AI model/ }).click();
  await page.locator("#key-anthropic").fill("sk-ant-smoke-test");
  await page.locator(".provider", { has: page.locator("#key-anthropic") }).getByRole("button", { name: "Save" }).click();
  await page.getByText("Key saved").waitFor();
  await page.getByRole("radio", { name: /Claude Haiku Test/ }).waitFor();
  check((await page.getByRole("radio").count()) === 2, "adding a key lists the models it can use");
  await page.getByRole("radio", { name: /Claude Sonnet Test/ }).click();
  await page.getByText("Lyra now uses Claude Sonnet Test").waitFor();
  check((await page.getByRole("radio", { name: /Claude Sonnet Test/ }).getAttribute("aria-checked")) === "true", "tapping a model switches to it, no typing");
  await shot("light-5b-model");
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("link", { name: /AI model.*Claude · claude-sonnet-test/ }).waitFor();
  check(true, "the settings front page shows the model in use");
  await page.getByRole("link", { name: /AI model/ }).click();
  await page.getByRole("button", { name: /Practice/ }).click();
  await page.getByText("Lyra now uses Practice").waitFor();
  await page.goto(`${base}/#/`);
  await page.getByText("Hi Sam, I'm Lyra.").waitFor();
  check(true, "greeting uses your name");

  const box = page.getByPlaceholder("Message Lyra");
  await box.fill("Remember that Rowan's party is Sat Nov 14, 10:30 AM to 2 PM");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".note", { hasText: "Rowan's party" }).waitFor();
  check(true, "remember shows a memory note");
  await box.fill("When is it?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("practice model").waitFor();
  check(true, "practice model replies");
  await shot("light-2-chat");

  await page.reload();
  await page.getByText("practice model").waitFor();
  check((await page.locator(".bubble").count()) === 2, "chat survives a restart (saved to storage)");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByText("Undone").waitFor();
  check(true, "undo from chat works");

  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".drawer-sections").getByRole("link", { name: "Lyra" }).click();
  await page.getByText("What Lyra has access to").waitFor();
  check((await page.getByText("Needs the Android app").count()) === 3, "browser preview says Google connections need the Android app");
  await shot("light-3-access");

  await page.getByRole("link", { name: /Memory/ }).click();
  await page.getByRole("heading", { name: "Memory" }).waitFor();
  await shot("light-4-memory");
  check(await page.getByRole("switch", { name: /Tidy my notes each week/ }).isChecked(), "the weekly memory tidy-up is on, with a switch");
  // ---- people cards ----
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByRole("button", { name: "Add a person" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a person" });
  await sheet.getByLabel("Name").fill("Dana Ortiz");
  await sheet.getByLabel("Who they are to you").fill("sister");
  await sheet.getByLabel("Email").fill("dana@example.com");
  await sheet.getByLabel("What Lyra knows (one per line)").fill("Birthday is March 3\nAllergic to cats");
  await sheet.getByRole("button", { name: "Save" }).click();
  await page.locator(".item", { hasText: "Dana Ortiz" }).waitFor();
  check((await page.locator(".item", { hasText: "sister · dana@example.com · 2 notes" }).count()) === 1, "people can be added as cards on the Memory page");
  await shot("light-37-people");
  await page.getByRole("tab", { name: "Notes" }).click();

  // ---- tasks ----
  await page.goto(`${base}/#/`);
  await page.getByRole("link", { name: "Tasks" }).click();
  await page.getByText("Nothing on your plate.").waitFor();
  check(true, "tasks tab shows an empty state");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Find a plumber for the kitchen leak");
  await page.getByLabel("Details").fill("Before Monday, under $200");
  await shot("light-12-new-task");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("heading", { name: "Find a plumber for the kitchen leak" }).waitFor();
  check(true, "creates a task and opens it");
  for (const step of ["Get three quotes", "Check reviews", "Book one"]) {
    await page.getByLabel("Add a step").fill(step);
    await page.getByLabel("Add a step").press("Enter");
    await page.getByText(step, { exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "Finish Get three quotes" }).click();
  await page.getByText("You finished: Get three quotes").waitFor();
  check(true, "steps can be added and checked, and the log records it");
  await shot("light-13-task");
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByText("1 of 3 steps").waitFor();
  await shot("light-14-tasks");
  await page.getByRole("link", { name: /Find a plumber/ }).click();
  await page.getByRole("button", { name: "Start worker" }).click();
  await page.locator(".needs-text", { hasText: "Review the result and mark it done." }).waitFor();
  check(true, "a worker runs the task and hands it back as Ready for you");
  await shot("light-15-task-ready");
  await page.getByRole("link", { name: /Worker log/ }).click();
  await page.getByText("Run 1").waitFor();
  check(true, "the worker log shows the run");
  await shot("light-16-worker-log");
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("link", { name: "Back" }).click();
  await page.locator(".badge").waitFor();
  check(true, "the Tasks tab shows a badge for tasks ready for you");
  // a ready task is a card: swipe it left, then Done
  check((await page.locator(".ready-card", { hasText: "Find a plumber" }).count()) === 1, "a task that's ready for you stands out as a card");
  const card = await page.locator(".ready-card").boundingBox();
  await page.mouse.move(card.x + card.width - 30, card.y + card.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(card.x + card.width - 30 - i * 25, card.y + card.height / 2);
  await page.mouse.up();
  await shot("light-34-swipe");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByText("Nothing on your plate.").waitFor();
  check(true, "swiping a task reveals Later and Done");
  await page.getByRole("tab", { name: "Done" }).click();
  await page.getByText("Find a plumber for the kitchen leak").waitFor();
  check(true, "marking done moves a task to the Done tab");
  await page.getByRole("tab", { name: "Active" }).click();
  await page.getByRole("link", { name: "Chat" }).click();
  await page.getByText("practice model").first().waitFor();
  check(true, "Chat tab goes back to the chat");

  // ---- soul ----
  await page.goto(`${base}/#/access`);
  await page.getByRole("link", { name: /Soul/ }).click();
  await page.getByText("Friendly and warm.").waitFor();
  check(true, "the soul page shows who Lyra is");
  await shot("light-20-soul");
  await page.goto(`${base}/#/`);

  // ---- routines ----
  await page.getByRole("link", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "Routine" }).click();
  await page.getByRole("button", { name: /Morning brief/ }).click();
  await page.getByText("Morning brief added").waitFor();
  await page.locator(".scheduled .item", { hasText: "Morning brief" }).waitFor();
  check((await page.getByRole("switch", { name: "Morning brief on" }).isChecked()) === true, "adds the morning brief, switched on");
  await shot("light-17-scheduled");
  await page.getByRole("link", { name: /Morning brief/ }).click();
  await page.getByRole("button", { name: "Run now" }).click();
  await page.locator(".log-list", { hasText: "Posted" }).waitFor();
  check(true, "Run now posts the routine");
  await shot("light-18-routine");
  await page.goto(`${base}/#/`);
  await page.locator(".routine-tag", { hasText: "Morning brief" }).waitFor();
  check(true, "the routine's post shows in chat with its name");
  await shot("light-19-routine-post");

  // ---- while you were away: back after a couple of hours, the routine's post is summed up ----
  await page.evaluate(() => localStorage.setItem("lyra.leftAt", new Date(Date.now() - 2 * 3600_000).toISOString()));
  await page.reload();
  const away = page.getByRole("dialog", { name: "While you were away" });
  await away.waitFor();
  check((await away.locator(".away-item", { hasText: "Morning brief" }).count()) === 1, "coming back after a while shows what Lyra did meanwhile");
  await shot("light-33-away");
  await away.getByRole("button", { name: "Got it" }).click();
  await away.waitFor({ state: "detached" });
  await page.reload();
  await page.locator(".bubble").first().waitFor();
  await page.waitForTimeout(500);
  check((await page.getByRole("dialog", { name: "While you were away" }).count()) === 0, "a quick reload doesn't show it again");

  // ---- Today: tap Lyra's face in the main chat ----
  await page.getByRole("button", { name: "Today" }).click();
  const today = page.getByRole("region", { name: "Today" });
  await today.waitFor();
  await today.locator(".today-item", { hasText: "Morning brief" }).first().waitFor();
  check(true, "the Today view lists what Lyra did and what's coming");
  await shot("light-35-today");
  await today.getByRole("button", { name: "Back to the conversation" }).click();
  await today.waitFor({ state: "detached" });
  check(true, "Today flips back to the conversation");

  // ---- channels ----
  await page.goto(`${base}/#/`);
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  await shot("light-6-drawer-empty");
  await page.getByRole("button", { name: "New channel" }).click();
  await page.getByLabel("Name").fill("Rowan");
  await page.getByLabel("Purpose").fill("Rowan's 7th birthday party");
  await page.getByRole("button", { name: "Change icon" }).click();
  await page.getByRole("radio", { name: "Kids and growing things" }).click();
  await shot("light-7-new-channel");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("heading", { name: "Rowan" }).waitFor();
  check(true, "creates a channel and opens its chat");
  await shot("light-8-channel-empty");

  await page.getByPlaceholder("Message Rowan").fill("The bounce house is booked for 10:30");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("practice model").waitFor();
  check((await page.locator(".bubble").count()) === 1, "channel chat starts empty and holds its own messages");
  await shot("light-9-channel-chat");

  // ---- skills: teach one in chat, use it by name, see it on the Memory page ----
  await page.getByPlaceholder("Message Rowan").fill("save a skill called Party prep: 1. Confirm the headcount\n2. Order the cake\n3. Text the parents");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".skill-chip", { hasText: "Learned Party prep" }).waitFor();
  check(true, "Lyra learns a skill in chat, shown as a chip");
  await page.getByPlaceholder("Message Rowan").fill("use my party prep skill");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".skill-chip", { hasText: "Followed Party prep" }).waitFor();
  check(await page.getByText("Text the parents").last().isVisible(), "Lyra reads a skill's steps and follows them");
  await shot("light-40-skill-chat");
  await page.locator(".skill-chip", { hasText: "Followed Party prep" }).click();
  await page.locator(".item", { hasText: "Party prep" }).waitFor();
  check((await page.locator(".item", { hasText: "used once" }).count()) === 1, "the chip opens Memory, Skills, with the use counted");
  await page.locator(".item", { hasText: "Party prep" }).click();
  const skillSheet = page.getByRole("dialog", { name: "Party prep" });
  await skillSheet.getByLabel("Use it when").fill("a party is coming up");
  await skillSheet.getByRole("button", { name: "Save" }).click();
  await page.locator(".item", { hasText: "a party is coming up" }).waitFor();
  await shot("light-41-skills");
  check(true, "a skill can be edited on the Skills tab");
  await page.goto(`${base}/#/c/1`);

  // ---- docs: Lyra writes one, you open and edit it ----
  await page.goto(`${base}/#/`);
  await page.getByPlaceholder("Message Lyra").fill("make a doc called Packing list");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".doc-note", { hasText: "Packing list" }).click();
  await page.getByRole("heading", { name: "Packing list" }).waitFor();
  check(await page.getByText("Second thing").isVisible(), "Lyra writes a doc, shown as a card that opens it");
  await shot("light-38-doc");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator(".doc-screen textarea").fill("## Camping\n- Tent\n- Stove");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Stove").waitFor();
  check((await page.getByRole("button", { name: /Google Doc/ }).count()) === 0, "a doc can be edited (no Google button where Google can't sign in)");
  await page.getByRole("link", { name: "Back" }).click();
  await page.locator(".item", { hasText: "Packing list" }).waitFor();
  check(true, "Docs lists it");

  // ---- search every chat from the menu, and jump to the message ----
  await page.goto(`${base}/#/`);
  await page.getByRole("button", { name: "Channels" }).click();
  await page.getByRole("searchbox", { name: "Search all chats" }).fill("bounce house");
  await page.locator(".search-hit", { hasText: "bounce house" }).first().waitFor();
  check((await page.locator(".search-hit .search-where", { hasText: "Rowan" }).count()) >= 1, "search finds messages in any channel");
  await shot("light-36-search");
  await page.locator(".search-hit", { hasText: "bounce house" }).first().click();
  await page.locator(".row.focused", { hasText: "bounce house" }).waitFor();
  check(true, "tapping a result opens that chat at the message");

  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  check((await page.locator(".drawer-panel .star-row", { hasText: "Rowan" }).count()) === 1, "drawer lists the channel");
  await page.getByRole("button", { name: "New channel" }).click();
  // the phone keyboard opening shrinks the screen and redraws the app; the Name box must keep focus
  await page.waitForTimeout(300);
  // (in the browser, "the keyboard is up" is raised by the message box getting focus, so pretend that)
  await page.getByLabel("Name").evaluate((el) => {
    window.__nameBlurs = 0;
    el.addEventListener("blur", () => window.__nameBlurs++);
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const box = document.querySelector(".composer textarea");
      box?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      box?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await page.waitForTimeout(200);
  }
  check(
    (await page.evaluate(() => window.__nameBlurs)) === 0 && (await page.getByLabel("Name").evaluate((el) => el === document.activeElement)),
    "the New channel name box keeps focus while the keyboard opens (no flicker)",
  );
  await page.getByLabel("Name").fill("Home");
  await page.getByRole("button", { name: "Change icon" }).click();
  await page.getByRole("radio", { name: "Home" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`${base}/#/c/1`);
  await page.getByText("bounce house").waitFor();
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  await shot("light-10-drawer");
  await page.locator(".shell-scrim").click({ position: { x: 40, y: 400 } });
  await page.waitForSelector(".app:not(.drawer-open)");
  check(true, "tapping the chat closes the drawer");
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.getByRole("link", { name: /Everything/ }).click();
  await page.waitForTimeout(300);
  check((await page.locator(".bubble").count()) === 3, "main chat keeps its own history");

  await page.goto(`${base}/#/c/1/info`);
  await page.getByText("Lyra saves facts about Rowan here").waitFor();
  await shot("light-11-channel-info");
  check(true, "channel page shows its notebook");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${base}/#/c/1`);
  await page.getByText("bounce house").waitFor();
  await shot("dark-9-channel-chat");
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  await shot("dark-10-drawer");
  await page.emulateMedia({ colorScheme: "light" });

  page.once("dialog", (d) => d.accept());
  await page.goto(`${base}/#/c/1/info`);
  await page.getByRole("button", { name: "Delete channel" }).click();
  await page.getByText("Hi Sam, I'm Lyra.").or(page.locator(".bubble").first()).waitFor();
  await page.getByRole("button", { name: "Channels" }).click();
  check((await page.locator(".drawer-panel .star-row", { hasText: "Rowan" }).count()) === 0, "deleting a channel removes it");
  await page.keyboard.press("Escape");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${base}/#/`);
  await page.getByText("practice model").first().waitFor();
  await shot("dark-2-chat");

  await page.emulateMedia({ colorScheme: "light" });
  await page.getByPlaceholder("Message Lyra").fill("thanks!");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("img", { name: "Lyra reacted ❤️" }).waitFor();
  check((await page.locator(".bubble").count()) === 4, "Lyra can react to a message, with no text reply");
  await shot("light-21-reaction");

  await page.goto(`${base}/#/settings/you`);
  await page.locator(".swatch", { hasText: "Burnt orange" }).click();
  await page.getByText("Burnt orange it is").waitFor();
  check((await page.evaluate(() => document.documentElement.dataset.accent)) === "orange", "picking an accent color applies it");
  await shot("light-22-accent-settings");
  await page.reload();
  await page.getByRole("radio", { name: "Burnt orange" }).waitFor();
  check((await page.getByRole("radio", { name: "Burnt orange" }).isChecked()) === true, "the accent color is saved");
  // ---- talk like me ----
  const mirror = page.getByRole("switch", { name: /Talk like me/ });
  check(await mirror.isChecked(), "Talk like me is on by default");
  await page.getByText("Nothing learned yet").waitFor();
  await page.getByRole("button", { name: "Learn now" }).click();
  await page.getByText(/few more of your messages/).waitFor();
  check(true, "learning how you talk waits for enough of your messages");
  await page.getByText("How Lyra talks to you").scrollIntoViewIfNeeded();
  await shot("light-42-talk-like-me");
  await mirror.click();
  await page.getByText("Lyra will keep her own voice").waitFor();
  check(!(await mirror.isChecked()) && (await page.getByText("Nothing learned yet").count()) === 0, "Talk like me can be turned off");
  await mirror.click();
  await page.getByText("Lyra will talk more like you").waitFor();
  await page.goto(`${base}/#/`);
  await page.locator(".bubble").first().waitFor();
  check((await page.locator(".topbar .avatar").getAttribute("src")).includes("avatar-orange"), "the avatar's glow follows the accent color");
  await shot("light-23-accent-chat");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${base}/#/tasks`);
  await page.getByText("Scheduled").first().waitFor().catch(() => {});
  await shot("dark-23-accent-tasks");
  await page.emulateMedia({ colorScheme: "light" });

  // ---- phase 7: message actions ----
  await page.goto(`${base}/#/`);
  await page.locator(".bubble", { hasText: "When is it?" }).click({ button: "right" });
  await page.getByRole("dialog", { name: "Message actions" }).waitFor();
  await shot("light-24-message-actions");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await page.locator(".pin-tag").first().waitFor();
  check(true, "long-press pins a message");
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".drawer-sections").getByRole("link", { name: "Lyra" }).click();
  await page.locator(".pinned-item", { hasText: "When is it?" }).waitFor();
  check(true, "pinned messages show on the info page");
  await shot("light-25-pinned");
  await page.goto(`${base}/#/`);
  const before = await page.locator(".bubble").count();
  await page.locator(".bubble", { hasText: "thanks!" }).click({ button: "right" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByText("Deleted", { exact: true }).waitFor();
  check((await page.locator(".bubble").count()) === before - 1, "deleting a message removes it");

  // ---- phase 7: backup, then restore it over a changed chat ----
  await page.goto(`${base}/#/settings/sync`);
  await page.getByRole("button", { name: /Back up Lyra/ }).click();
  await page.getByLabel("Passphrase").fill("correct horse battery");
  await page.getByLabel("Type it again").fill("correct horse battery");
  await shot("light-26-backup");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up", exact: true }).click()]);
  const backupPath = join(shots, "test-backup.lyra");
  await download.saveAs(backupPath);
  check(download.suggestedFilename().endsWith(".lyra"), "backup makes an encrypted .lyra file");
  await page.goto(`${base}/#/`);
  await page.getByPlaceholder("Message Lyra").fill("This one is after the backup");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".bubble", { hasText: "after the backup" }).waitFor();
  await page.goto(`${base}/#/settings/sync`);
  page.on("dialog", (d) => d.accept());
  await page.getByLabel("Backup file").setInputFiles(backupPath);
  await page.getByLabel("Passphrase").fill("not the passphrase");
  await page.getByRole("button", { name: "Restore", exact: true }).click(); // first: the confirm
  await page.getByRole("alert").filter({ hasText: "doesn't open" }).waitFor();
  check(true, "a wrong passphrase is refused");
  await page.getByLabel("Passphrase").fill("correct horse battery");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.locator(".bubble", { hasText: "When is it?" }).waitFor();
  check((await page.locator(".bubble", { hasText: "after the backup" }).count()) === 0, "restore brings back the backed-up chat");

  // ---- the chat follows the latest message, through keyboard and layout changes ----
  await page.goto(`${base}/#/`);
  await page.locator(".bubble").first().waitFor();
  const gap = () => page.locator(".log").evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  for (const t of ["One more", "And another", "Still going", "Last one"]) {
    await page.getByPlaceholder("Message Lyra").fill(t);
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".bubble", { hasText: t }).waitFor();
    await page.getByText("practice model").last().waitFor();
  }
  await page.waitForTimeout(400);
  check((await gap()) < 4, "after sending, the chat is scrolled to the newest message");
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) }); // the keyboard opens
  await page.waitForTimeout(300);
  check((await gap()) < 4, "it stays on the newest message when the keyboard opens");
  await page.setViewportSize(size); // and closes
  await page.waitForTimeout(300);
  check((await gap()) < 4, "and when it closes again");
  await page.locator(".log").hover();
  await page.mouse.wheel(0, -600); // you scroll up to read
  await page.waitForTimeout(300);
  const readingAt = await gap();
  await page.setViewportSize({ width: size.width, height: size.height - 40 });
  await page.waitForTimeout(300);
  check(readingAt > 100 && (await gap()) > 100, "scrolling up yourself is left alone");
  await page.setViewportSize(size);

  // ---- phase 8: photos and files ----
  await page.goto(`${base}/#/`);
  await page.locator(".bubble").first().waitFor();
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = "#c4ef4b";
    g.fillRect(0, 0, 2400, 1200);
    g.fillStyle = "#131416";
    g.font = "160px sans-serif";
    g.fillText("Field trip Friday", 200, 640);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.getByLabel("Choose files").setInputFiles([
    { name: "flyer.png", mimeType: "image/png", buffer: Buffer.from(png) },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Bring a packed lunch") },
  ]);
  await page.locator(".draft.photo img").waitFor();
  check((await page.locator(".draft").count()) === 2, "a photo and a text file attach to the message box");
  await page.getByLabel("Choose files").setInputFiles([{ name: "song.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("x") }]);
  await page.getByText("Lyra can't read song.mp3").waitFor();
  check(true, "a file Lyra can't read is refused with a reason");
  await page.getByRole("button", { name: "Remove notes.txt" }).click();
  await page.locator(".draft", { hasText: "notes.txt" }).waitFor({ state: "detached" });
  check((await page.locator(".draft").count()) === 1, "an attachment can be removed before sending");
  await shot("light-29-attach");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".sent-photo").waitFor();
  await page.getByText("Got it: flyer.jpg").waitFor();
  check(true, "a photo sends on its own, and Lyra receives it");
  const sentSize = await page.locator(".sent-photo").evaluate((el) => el.naturalWidth);
  check(sentSize > 0 && sentSize <= 320, "the chat keeps a small thumbnail, not the full photo");
  await shot("light-30-photo-sent");
  await page.reload();
  await page.locator(".sent-photo").waitFor();
  check(true, "the photo is still shown after a restart");

  // ---- live voice, against a pretend GPT-Live living in this page ----
  // It answers the call over a real WebRTC connection and plays a scripted conversation,
  // so the microphone, connection, captions, delegation and saving all run for real.
  await ctx.grantPermissions(["microphone"]);
  await page.route("https://api.openai.com/v1/models", (r) => r.fulfill({ json: { data: [{ id: "gpt-6-astra", created: 2 }] } }));
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.__live = { got: [], body: null };
    window.fetch = async (url, init) => {
      if (String(url) !== "https://api.openai.com/v1/live/sessions") return realFetch(url, init);
      const body = JSON.parse(init.body);
      window.__live.body = body;
      window.__live.auth = init.headers.Authorization;
      const remote = new RTCPeerConnection();
      window.__live.remote = remote;
      remote.ondatachannel = (e) => {
        const ch = e.channel;
        const say = (ev, ms) => setTimeout(() => ch.readyState === "open" && ch.send(JSON.stringify(ev)), ms);
        ch.onmessage = (m) => window.__live.got.push(JSON.parse(m.data));
        ch.onopen = () => {
          say({ type: "session.started" }, 50);
          say({ type: "session.input_transcript.delta", delta: "How are you " }, 300);
          say({ type: "session.input_transcript.delta", delta: "today?" }, 400);
          say({ type: "session.output_transcript.delta", delta: "Doing well, thanks." }, 700);
          say({ type: "session.input_transcript.delta", delta: "What's on my list?" }, 1300);
          say({ type: "session.output_transcript.delta", delta: "One sec." }, 1500);
          say({ type: "session.delegation.created", delegation: { id: "dlg_1", target: "client", type: "delegation" } }, 1600);
          say({ type: "session.usage.updated", usage: { seconds: 75 } }, 1700);
        };
      };
      await remote.setRemoteDescription({ type: "offer", sdp: body.transport.sdp });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => remote.addTrack(t, stream));
      const answer = await remote.createAnswer();
      await remote.setLocalDescription(answer);
      // candidates travel inside the answer, as with the real service
      await new Promise((ok) => (remote.iceGatheringState === "complete" ? ok() : remote.addEventListener("icegatheringstatechange", () => remote.iceGatheringState === "complete" && ok())));
      return new Response(JSON.stringify({ session: { id: "live_test" }, transport: { type: "webrtc", sdp: remote.localDescription.sdp } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });
  await page.goto(`${base}/#/`);
  await page.reload();
  await page.locator(".bubble").first().waitFor();
  await page.getByRole("button", { name: "Talk with Lyra" }).click();
  await page.getByText("Add an OpenAI API key in Settings").waitFor();
  check((await page.locator(".voice").count()) === 0, "live voice asks for an OpenAI key first, and doesn't start a call without one");
  await page.goto(`${base}/#/settings/model`);
  await page.locator(".provider-head", { hasText: "OpenAI" }).click();
  await page.locator("#key-openai").fill("sk-live-smoke");
  await page.locator(".provider", { has: page.locator("#key-openai") }).getByRole("button", { name: "Save" }).click();
  await page.getByText("Key saved").waitFor();
  await page.getByRole("button", { name: /Practice/ }).click();
  await page.getByText("Lyra now uses Practice").waitFor();
  await page.getByLabel("Lyra's voice").selectOption("cedar");
  await page.getByText("Voice set to cedar").waitFor();
  await page.goto(`${base}/#/`);
  await page.locator(".bubble").first().waitFor();
  const before8 = await page.locator(".bubble").count();
  await page.getByRole("button", { name: "Talk with Lyra" }).click();
  await page.getByRole("dialog", { name: "Live voice with Lyra" }).waitFor();
  await page.getByText("Doing well, thanks.").waitFor();
  check(true, "a live call connects and shows what's being said");
  await shot("light-31-voice");
  // the delegated question went through Lyra's engine, and the answer went back for that delegation
  await page.waitForFunction(() => window.__live.got.some((e) => e.type === "session.instructions.append" && e.delegation_id === "dlg_1"));
  const live = await page.evaluate(() => ({ auth: window.__live.auth, model: window.__live.body.session.model, voice: window.__live.body.session.audio.output.voice, told: window.__live.body.session.instructions.includes("chief of staff"), back: window.__live.got.find((e) => e.delegation_id === "dlg_1").content }));
  check(live.model === "gpt-live-1" && live.voice === "cedar" && live.told && live.auth === "Bearer sk-live-smoke", "the call starts GPT-Live with Lyra's character and the chosen voice");
  check(live.back.includes("practice model"), "a request that needs Lyra's tools is done by the engine and handed back to be spoken");
  await page.getByRole("button", { name: "Mute" }).click();
  await page.getByText("Muted", { exact: true }).waitFor();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await page.getByRole("dialog", { name: "Live voice with Lyra" }).waitFor({ state: "detached" });
  await page.locator(".bubble", { hasText: "What's on my list?" }).waitFor();
  check((await page.locator(".bubble", { hasText: "How are you today?" }).count()) === 1 && (await page.locator(".bubble").count()) === before8 + 2, "the conversation is saved in the chat as text, once");
  await page.goto(`${base}/#/settings/usage`);
  await page.getByText("1 min with GPT-Live · about $0.06").waitFor();
  check(true, "the call's minutes and estimated cost show on the Usage page");

  // ---- proactive: reminders and suggested next steps ----
  await page.goto(`${base}/#/`);
  await page.locator(".bubble").first().waitFor();
  await page.getByPlaceholder("Message Lyra").fill("Remind me in 90 minutes to stretch");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Okay, I'll remind you.").waitFor();
  await page.locator(".status-pill", { hasText: /Reminder at/ }).waitFor({ timeout: 15_000 });
  check(true, "a reminder set in chat shows as what's next under Lyra's avatar");
  await page.getByPlaceholder("Message Lyra").fill("What's next?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Remind me Friday" }).waitFor();
  await shot("light-32-suggestions");
  await page.getByRole("button", { name: "Add it to my tasks" }).click();
  await page.locator(".bubble", { hasText: "Add it to my tasks" }).waitFor();
  await page.getByRole("button", { name: "Remind me Friday" }).waitFor({ state: "detached" });
  check(true, "suggested next steps are buttons that send as your message, then go away");
  await page.goto(`${base}/#/tasks`);
  await page.locator(".reminders .item", { hasText: "stretch" }).waitFor();
  await shot("light-33-scheduled-reminder");
  await page.getByRole("button", { name: /Cancel reminder: stretch/ }).click();
  await page.locator(".reminders .item", { hasText: "stretch" }).waitFor({ state: "detached" });
  check(true, "reminders are listed under Scheduled and can be cancelled");

  // ---- usage: tokens per model, with a graph ----
  await page.goto(`${base}/#/settings`);
  await page.getByRole("link", { name: /Usage.*tokens today/ }).click();
  await page.getByText("Tokens per day, by model").waitFor();
  check((await page.locator(".usage-num").first().textContent()) !== "0", "usage counts the tokens from today's chats");
  await page.locator(".usage-plot rect").last().hover();
  await page.locator(".usage-tip", { hasText: "Practice (estimate)" }).waitFor();
  check(true, "pointing at a bar shows that day's numbers per model");
  await page.getByRole("tab", { name: "Monthly" }).click();
  await page.getByText("Tokens per month, by model").waitFor();
  check((await page.locator(".usage-table tbody tr").count()) >= 1, "weekly and monthly views, with a table of the numbers");

  // ---- status under the avatar, with a pretend weather service ----
  await page.route("https://geocoding-api.open-meteo.com/**", (r) =>
    r.fulfill({ json: { results: [{ name: "Boston", admin1: "Massachusetts", country_code: "US", latitude: 42.36, longitude: -71.06 }] } }),
  );
  await page.route("https://api.open-meteo.com/**", (r) => r.fulfill({ json: { current: { temperature_2m: 58.4, weather_code: 2, is_day: 1 } } }));
  await page.goto(`${base}/#/settings/you`);
  await page.getByLabel("Your city").fill("Boston");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: /Boston, Massachusetts/ }).click();
  await page.getByText("Weather for Boston, Massachusetts").waitFor();
  check(true, "picking a city for the weather");
  await page.goto(`${base}/#/`);
  await page.locator(".status-pill", { hasText: "58° · Partly cloudy" }).waitFor({ timeout: 20_000 });
  check(true, "the weather shows under Lyra's avatar");
  const statuses = await page.locator(".status-text").allTextContents();
  check(statuses.every((t) => [...t].length <= 24), "the status always fits, never cut off");
  await shot("light-27-status");
  await page.goto(`${base}/#/c/2`);
  await page.locator(".avatar-stack.in-channel .status-pill").waitFor();
  await shot("light-28-status-channel");
  check(true, "channels show the status under the channel name");

  // ---- a research task, added by hand ----
  await page.goto(`${base}/#/tasks`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Compare compact strollers under $400");
  await page.getByRole("switch", { name: /Research it/ }).check();
  await shot("light-39-research");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.locator(".research-tag").waitFor();
  check(true, "a task can be a research task, marked as one");

  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!wide, "no sideways scrolling");
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);
  console.log(`\nAll good. Screenshots in ${shots}`);
} finally {
  await browser.close();
  server.kill();
}
