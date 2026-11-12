import DEFAULT from "./soul.md?raw";

/** Lyra's built-in soul. The user can replace it with their own from the app. */
export const DEFAULT_SOUL: string = DEFAULT;

/** The soul and voice guide together, with the user's name filled in. */
export function character(soul: string | undefined, voice: string, user: string): string {
  return `${(soul?.trim() || DEFAULT_SOUL).replaceAll("{user}", user)}\n\n${voice.replaceAll("{user}", user)}`;
}
