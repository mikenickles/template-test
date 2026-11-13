// Small taps under your finger on the phone: a send, a tab switch, a swipe that catches,
// a task ticked off. Nothing on a computer. Off with Settings → You → Haptics (this phone only).
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./platform";

const KEY = "lyra.haptics";

export function hapticsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHaptics(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private window: stays on */
  }
}

const go = (fn: () => Promise<void>) => {
  if (!isNative || !hapticsOn()) return;
  fn().catch(() => {});
};

export const haptic = {
  /** the lightest tick: switching a tab or option */
  select: () => go(() => Haptics.selectionChanged()),
  /** a light tap: sending, opening something */
  tap: () => go(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** a firmer tap: a long-press, a swipe that's far enough to act */
  press: () => go(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** something got done: a task ticked, a reminder set */
  done: () => go(() => Haptics.notification({ type: NotificationType.Success })),
};
