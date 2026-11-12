/**
 * Lyra updates itself from your Drive's "Lyra Updates" folder (core/updates.ts).
 * It checks once a day and when you ask; it never installs without you: the phone
 * shows Android's install screen, the computer waits for "Restart to update".
 */
import type { Lyra } from "../../core/lyra";
import { compareVersions, newest, type UpdateFile } from "../../core/updates";
import { installer, isDesktop, isNative, notifier } from "./platform";

export type UpdateState =
  | { kind: "idle" | "checking" | "current" }
  | { kind: "available"; file: UpdateFile }
  | { kind: "downloading"; file: UpdateFile }
  | { kind: "ready"; version: string } // computer: restart to use it
  | { kind: "needs-full"; version: string } // computer: this one needs the full Windows app
  | { kind: "permission" } // phone: allow "install unknown apps" first
  | { kind: "error"; message: string };

let state: UpdateState = { kind: "idle" };
const subs = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  subs.forEach((f) => f());
};
export const updateState = () => state;
export function onUpdateState(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export const canUpdate = isNative || isDesktop;
const DAY = 24 * 3600_000;
const store = (k: string, v?: string) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    // per-device convenience only
  }
  return null;
};

/** Look in Drive for something newer than what's running. */
export async function checkForUpdate(lyra: Lyra, opts: { quiet?: boolean } = {}): Promise<UpdateState> {
  if (!canUpdate) return state;
  if (state.kind === "downloading" || state.kind === "ready") return state;
  set({ kind: "checking" });
  try {
    const current = await installer.version();
    const files = await lyra.updates().list();
    store("lyra.updates.checkedAt", String(Date.now()));
    const found = isNative ? newest(files, "apk", current) : newest(files, "pack", current) ?? newest(files, "win", current);
    if (!found) return set({ kind: "current" }), state;
    set({ kind: "available", file: found });
    // say so once per version, wherever you are
    if (store("lyra.updates.told") !== found.version) {
      store("lyra.updates.told", found.version);
      void notifier.now(`Lyra ${found.version} is ready`, "Open Settings to update.", "#/settings/about").catch(() => {});
    }
    return state;
  } catch (e) {
    set(opts.quiet ? { kind: "idle" } : { kind: "error", message: (e as Error).message });
    return state;
  }
}

/** Download and install what checkForUpdate found. */
export async function applyUpdate(lyra: Lyra): Promise<UpdateState> {
  if (state.kind === "ready") {
    await installer.relaunch();
    return state;
  }
  // back from allowing installs: find the file again
  if (state.kind === "permission") await checkForUpdate(lyra);
  const current: UpdateState = state;
  if (current.kind !== "available") return current;
  const file = current.file;
  set({ kind: "downloading", file });
  try {
    const bytes = await lyra.updates().fetchUpdate(file);
    if (isNative) {
      const r = await installer.installApk(file.name, bytes);
      set(r === "needs-permission" ? { kind: "permission" } : { kind: "available", file });
    } else if (file.kind === "win") {
      set({ kind: "needs-full", version: file.version });
    } else {
      const r = await installer.installPack(bytes);
      set(r.needsFullInstall ? { kind: "needs-full", version: r.version } : { kind: "ready", version: r.version });
    }
  } catch (e) {
    set({ kind: "error", message: (e as Error).message });
  }
  return state;
}

/** Check a little after start, then once a day while open. */
export function watchForUpdates(lyra: Lyra): void {
  if (!canUpdate) return;
  void installer.started();
  const due = () => Date.now() - Number(store("lyra.updates.checkedAt") ?? 0) > DAY;
  const maybe = () => {
    if (due() && document.visibilityState === "visible") void checkForUpdate(lyra, { quiet: true });
  };
  setTimeout(maybe, 15_000);
  setInterval(maybe, 3600_000);
  document.addEventListener("visibilitychange", maybe);
}

export const isNewer = (a: string, b: string) => compareVersions(a, b) > 0;
