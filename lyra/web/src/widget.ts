// Keeps the phone's home-screen widget current: Lyra's avatar (in your accent color),
// a status that always fits, and the latest thing Lyra posted on its own today.
import { registerPlugin } from "@capacitor/core";
import type { Lyra } from "../../core/lyra";
import { avatarFor } from "./LyraMark";
import { isNative } from "./platform";
import { widgetWords } from "./statusText";

const Widget = registerPlugin<{ update(o: { status: string; detail: string; avatar?: string }): Promise<void> }>("LyraWidget");

/** What the widget says right now. */
function words(lyra: Lyra, now = new Date()) {
  return widgetWords(
    {
      working: lyra.tasks({ status: "working", limit: 3 }),
      ready: lyra.taskCounts().ready,
      upcoming: [...lyra.routines(), ...lyra.reminders().map((r) => ({ name: r.kind === "remind" ? "Reminder" : "Check back", enabled: 1, next_run_at: r.due_at }))],
      latest: lyra.away(new Date(now.getTime() - 24 * 3600_000).toISOString()).items.at(-1),
    },
    now,
  );
}

/** The accent's avatar as a small round PNG. */
async function avatarPng(accent: string): Promise<string | undefined> {
  const img = new Image();
  img.src = avatarFor(accent);
  await img.decode();
  const size = 160;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return undefined;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/png");
}

export function watchWidget(lyra: Lyra): void {
  if (!isNative) return;
  let last = "";
  let sentAccent = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const push = async () => {
    try {
      const w = words(lyra);
      const accent = lyra.state().accent;
      const key = JSON.stringify(w) + accent;
      if (key === last) return;
      const avatar = accent !== sentAccent ? await avatarPng(accent).catch(() => undefined) : undefined;
      await Widget.update({ ...w, ...(avatar ? { avatar } : {}) });
      last = key;
      if (avatar) sentAccent = accent;
    } catch {
      // the widget is a nicety: never an error
    }
  };
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void push(), 2000);
  };
  void push();
  lyra.onChange(soon);
  setInterval(() => void push(), 5 * 60_000); // "at 4 PM" becomes "tomorrow", things fall out of the last day
}
