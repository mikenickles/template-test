// Display size (this device only): how big the chat text is, and how big Lyra's avatar sits
// at the top of the chat. Kept in localStorage and put on <html> as data-text / data-avatar,
// which set --chat-text and --orb-sm in styles.css.
export const TEXT_SIZES = [
  { id: "small", label: "Small" },
  { id: "regular", label: "Regular" },
  { id: "large", label: "Large" },
  { id: "larger", label: "Largest" },
] as const;
export const AVATAR_SIZES = [
  { id: "small", label: "Small" },
  { id: "regular", label: "Regular" },
  { id: "large", label: "Large" },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["id"];
export type AvatarSize = (typeof AVATAR_SIZES)[number]["id"];

const TEXT = "lyra.textSize";
const AVATAR = "lyra.avatarSize";

function read<T extends string>(key: string, all: readonly { id: T }[]): T {
  try {
    const v = localStorage.getItem(key);
    if (all.some((s) => s.id === v)) return v as T;
  } catch {
    /* private window: regular */
  }
  return "regular" as T;
}

export const textSize = (): TextSize => read(TEXT, TEXT_SIZES);
export const avatarSize = (): AvatarSize => read(AVATAR, AVATAR_SIZES);

/** Put the saved sizes on the page. Called before first paint and after a change. */
export function applySizes(): void {
  document.documentElement.dataset.text = textSize();
  document.documentElement.dataset.avatar = avatarSize();
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stays for this visit only */
  }
  document.documentElement.dataset[key === TEXT ? "text" : "avatar"] = value;
}

export const setTextSize = (s: TextSize) => save(TEXT, s);
export const setAvatarSize = (s: AvatarSize) => save(AVATAR, s);
