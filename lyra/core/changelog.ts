/**
 * What changed in each version of the app, in the user's words. The newest few go into Tomo's
 * prompt (before the cache split, so they only change with a release), so Tomo knows what it
 * can do now and can answer "what's new?". Every release adds an entry at the top; a test
 * checks the top entry matches versionName in android/app/build.gradle.
 */
export interface Release {
  version: string;
  date: string;
  notes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "0.65.1",
    date: "2026-11-24",
    notes: ["Tomo's face is zoomed out a little, so more of the robot shows: scarf, arms and backpack."],
  },
  {
    version: "0.65.0",
    date: "2026-11-24",
    notes: ["Tomo has a new look: a little white robot with orange headphones, a scarf and a backpack, in a circle. It idles, and types on a laptop while it's working on a reply. The app icon, splash screen, widget and Windows icon are the robot too."],
  },
  {
    version: "0.64.0",
    date: "2026-11-24",
    notes: [
      "Who does what: every job Tomo does (chat, tasks, dashboards, routines, follow-ups, heads-ups, mail watch, check-ins, life admin scans, chat summaries, tidy-ups, learning how you talk) can run on its own model, picked in Settings › AI model or by asking Tomo.",
      "Auto puts real work on the main model, light work on its partner (Sol → Terra) and watching on the smallest (Sol → Luna).",
    ],
  },
  {
    version: "0.63.4",
    date: "2026-11-23",
    notes: ["Tomo knows what changed in each update (this list), and says what's new once after an update if it comes up."],
  },
  {
    version: "0.63.3",
    date: "2026-11-23",
    notes: ["Tomo knows its own setup: the chat and background models, connections, approval switches, heads-ups, sync and this device's preferences."],
  },
  {
    version: "0.63.2",
    date: "2026-11-23",
    notes: ["Tomo knows its name means friend in Japanese (it used to be Lyra)."],
  },
  {
    version: "0.63.1",
    date: "2026-11-23",
    notes: ["When Google's sign-in lapses, Settings › Updates says nothing is lost and offers Sign in again."],
  },
  {
    version: "0.63.0",
    date: "2026-11-23",
    notes: [
      "Tapping Tomo's face opens one list of connections with each service's icon, and Connect right on the row.",
      "Connect Google in one go: mail, calendar and files with one sign-in.",
      "Money, read only: bank accounts through SimpleFIN Bridge (balances, transactions, spending added up exactly) and YNAB (what's left in each category).",
      "Channels keep Tomo's face at the top, with the channel's name under it.",
    ],
  },
  {
    version: "0.62.0",
    date: "2026-11-23",
    notes: [
      "How I got this: the steps Tomo took show while it works and fold under the reply.",
      "While typing, a chip shows what Tomo is about to do (a reminder and its time, a task, a calendar check); the time can be changed on it.",
      "Cards you approve get an ink stamp (Sent, Added, Trashed…).",
      "Empty pages have a small scene with Tomo and one next step.",
    ],
  },
  {
    version: "0.61.0",
    date: "2026-11-23",
    notes: ["The app is called Tomo now (it was Lyra). Push notifications from the home base can be set up in Settings › Backup and sync."],
  },
  {
    version: "0.60.0",
    date: "2026-11-22",
    notes: ["On Windows, Tomo can click, type and choose on pages in its own browser window; anything that sends, buys or deletes waits for a tap on a card. Reactions include 💀."],
  },
  {
    version: "0.59.0",
    date: "2026-11-22",
    notes: ["Tomo's face is a small animated orange gumdrop that glances, blinks and hops; new app icon."],
  },
  {
    version: "0.58.0",
    date: "2026-11-22",
    notes: ["The Quiet redesign: ink on white, one accent, a floating tab bar with Chat, Tasks and Artifacts."],
  },
];

/** The newest few releases, for Tomo's prompt. */
export function recentChanges(n = 6): string {
  return CHANGELOG.slice(0, n)
    .map((r) => `- ${r.version} (${r.date}): ${r.notes.join(" ")}`)
    .join("\n");
}
