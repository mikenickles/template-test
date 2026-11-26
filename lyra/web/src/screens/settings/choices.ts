/** Settings' fixed lists: bubble styles, looks, accent colors, page titles, and the search index (FINDER: add every new setting here). */
import { type AppState } from "../../api";
import { Check } from "../../icons";
import { Usage } from "../Usage";
import { background } from "../../platform";
import { ask } from "../../ask";
import type { SettingsSection } from "../Settings";

export const BUBBLE_CHOICES: { id: AppState["bubbles"]; label: string; about: string }[] = [
  { id: "softer", label: "Soft grey", about: "Light grey, or dark grey in dark mode" },
  { id: "accent", label: "Accent", about: "A tint of your accent color" },
  { id: "neutral", label: "Outline", about: "White with a thin line" },
  { id: "classic", label: "Classic", about: "Solid black, or white in dark mode" },
];

/** The whole look, as a mood. Each card previews itself. */
export const THEME_CHOICES: { id: AppState["theme"]; label: string; about: string }[] = [
  { id: "paper", label: "Quiet", about: "Ink on white, one accent. The default." },
  { id: "linen", label: "Linen", about: "Warm off-white, like Tomo's shell." },
  { id: "sage", label: "Sage", about: "Pale green-grey, like the backpack." },
  { id: "night", label: "Night", about: "Always dark, even when your phone isn't." },
];

/** Every setting by name, with a few other words people might type, and where it lives. */
export const FINDER: { label: string; more: string; where: string; href: string; phone?: boolean }[] = [
  { label: "AI model and API keys", more: "claude openai gemini gpt key provider brain practice", where: "AI model", href: "#/settings/model" },
  { label: "Background model", more: "cheaper smaller haiku terra flash routing cost save money quick model", where: "AI model", href: "#/settings/model" },
  { label: "Web search", more: "internet browse look up online", where: "AI model", href: "#/settings/model" },
  { label: "Live voice", more: "talk call speak voice mode", where: "AI model", href: "#/settings/model" },
  { label: "Model for a routine", more: "haiku routine cheaper smaller per routine scheduled morning brief which model", where: "Tasks, Scheduled, the routine, Edit", href: "#/tasks?scheduled" },
  { label: "Usage", more: "tokens cost spend money how much", where: "Usage", href: "#/settings/usage" },
  { label: "Your name", more: "call me who", where: "You and appearance", href: "#/settings/you" },
  { label: "Look", more: "theme quiet linen sage night paper dark mode style warm cream green", where: "You and appearance", href: "#/settings/you" },
  { label: "Accent color", more: "colour orange burnt honey cocoa brown moss green pine denim blue plum graphite grey theme", where: "You and appearance", href: "#/settings/you" },
  { label: "Your messages", more: "bubble bubbles chat style", where: "You and appearance", href: "#/settings/you" },
  { label: "Text size", more: "font bigger smaller larger display zoom read", where: "You and appearance", href: "#/settings/you" },
  { label: "Avatar size", more: "lyra picture orb bigger smaller display", where: "You and appearance", href: "#/settings/you" },
  { label: "Talk like me", more: "mirror slang how lyra talks style tone", where: "You and appearance", href: "#/settings/you" },
  { label: "Weather", more: "city place forecast temperature", where: "You and appearance", href: "#/settings/you" },
  { label: "Make Tomo your assistant", more: "default digital assistant gesture power button home corner swipe gemini google hey", where: "You and appearance", href: "#/settings/you", phone: true },
  { label: "Shortcuts", more: "app icon long press quick tile widget talk voice memo reach faster", where: "You and appearance", href: "#/settings/you", phone: true },
  { label: "Sounds", more: "audio noise chime bell mute", where: "You and appearance", href: "#/settings/you" },
  { label: "Gentle motion", more: "animation video moving face still picture breathing avatar battery", where: "You and appearance", href: "#/settings/you" },
  { label: "Haptics", more: "vibrate vibration buzz tap feel", where: "You and appearance", href: "#/settings/you", phone: true },
  { label: "Notifications", more: "notify alerts push checkup test permission", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Heads-ups", more: "proactive off light active speak first", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Quiet hours", more: "night sleep do not disturb overnight", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Check-ins", more: "check in when it's quiet ask", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Mail watch", more: "email new mail important people", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Keep watch", more: "background battery closed tray always on check every interval", where: "Notifications and privacy", href: "#/settings/alerts" },
  { label: "Places and location", more: "geofence place reminders saved places home work gps", where: "Notifications and privacy", href: "#/settings/alerts", phone: true },
  { label: "Tell me when to leave", more: "leave now travel directions maps drive", where: "Notifications and privacy", href: "#/settings/alerts", phone: true },
  { label: "App lock", more: "fingerprint face pin biometric privacy security", where: "Notifications and privacy", href: "#/settings/alerts", phone: true },
  { label: "Sync between devices", more: "phone computer drive passphrase", where: "Sync and backup", href: "#/settings/sync" },
  { label: "Home base", more: "always on computer laptop push firebase ring my phone", where: "Sync and backup", href: "#/settings/sync" },
  { label: "Push notifications", more: "ring my phone firebase fcm closed instant notify", where: "Sync and backup, on your home base", href: "#/settings/sync" },
  { label: "Back up and restore", more: "backup export import move new phone file", where: "Sync and backup", href: "#/settings/sync" },
  { label: "Updates", more: "version new release install", where: "Updates", href: "#/settings/about" },
  { label: "Mail, Calendar and Files", more: "gmail google drive connect connections access disconnect", where: "The Tomo page", href: "#/access" },
  { label: "Spotify", more: "music now playing playlists playback", where: "The Tomo page", href: "#/access" },
  { label: "Phone notifications and contacts", more: "texts messages read notifications address book", where: "The Tomo page", href: "#/access", phone: true },
  { label: "What Tomo may do with your OK", more: "send email write emails calendar changes archive tidy inbox texts playlists", where: "The Tomo page", href: "#/access" },
  { label: "Memory", more: "what lyra knows notes people skills forget remember", where: "Memory", href: "#/memory" },
  { label: "Soul", more: "personality character voice who lyra is", where: "Soul", href: "#/soul" },
  { label: "Routines", more: "morning brief schedule scheduled daily", where: "Tasks", href: "#/tasks" },
  { label: "Activity", more: "log history what lyra did", where: "Activity", href: "#/activity" },
];

/** (0.66) colors taken from Tomo, and colors that sit well beside them */
export const ACCENT_CHOICES: { id: AppState["accent"]; label: string }[] = [
  { id: "orange", label: "Burnt orange" },
  { id: "honey", label: "Honey" },
  { id: "cocoa", label: "Cocoa" },
  { id: "moss", label: "Moss" },
  { id: "pine", label: "Pine" },
  { id: "denim", label: "Denim" },
  { id: "plum", label: "Plum" },
  { id: "graphite", label: "Graphite" },
];

export const TITLES: Record<SettingsSection, string> = {
  model: "AI model",
  usage: "Usage",
  you: "You and appearance",
  alerts: "Notifications and privacy",
  sync: "Sync and backup",
  about: "Updates",
};
