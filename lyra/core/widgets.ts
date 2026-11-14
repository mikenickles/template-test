/**
 * Widgets in a reply (0.48): one small thing under Lyra's text that's easier to tap than to
 * read. Three kinds:
 *   choices    two to four options as cards; tapping one sends its label as the user's message
 *   checklist  a list the user ticks off (packing, groceries, steps); ticks are kept on the message
 *   place      somewhere to go or call: Directions (Maps) and Call buttons
 * The user's tap is what acts, so a widget is allowed after outside content was read, but then a
 * choice's label (which becomes their message) is kept short and plain, like suggested replies.
 */
import { directionsLink } from "./places.ts";

export interface ChoicesWidget {
  kind: "choices";
  title: string;
  options: { label: string; detail: string }[];
  /** which one the user tapped */
  picked?: number;
}
export interface ChecklistWidget {
  kind: "checklist";
  title: string;
  items: { text: string; done?: boolean }[];
}
export interface PlaceWidget {
  kind: "place";
  name: string;
  address: string;
  phone: string;
  note: string;
  /** a Google Maps directions link, built here from the address (never taken from the model) */
  maps: string;
}
export type Widget = ChoicesWidget | ChecklistWidget | PlaceWidget;

const one = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const PHONE = /^\+?[0-9][0-9 ().-]{3,22}[0-9]$/;
const LINKY = /@|:\/\/|www\.|\.(com|net|org|io)\b/i;

export function checkWidget(input: Record<string, unknown>, tainted: boolean): Widget {
  const kind = String(input.kind ?? "");
  if (kind === "choices") {
    const options = (Array.isArray(input.options) ? input.options : [])
      .map((o): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : { label: o }))
      .map((o) => ({ label: one(o.label, tainted ? 48 : 60), detail: one(o.detail, 140) }))
      // the label becomes the user's own message when tapped: no address or link after outside content
      .filter((o) => o.label && !(tainted && LINKY.test(o.label)))
      .slice(0, 4);
    if (options.length < 2) throw new Error("Give two to four options, each with a short label (and a detail line if it helps).");
    return { kind: "choices", title: one(input.title, 60), options };
  }
  if (kind === "checklist") {
    const items = (Array.isArray(input.items) ? input.items : [])
      .map((i) => ({ text: one(i && typeof i === "object" ? (i as Record<string, unknown>).text : i, 120) }))
      .filter((i) => i.text)
      .slice(0, 30);
    if (!items.length) throw new Error("Give the checklist its items.");
    return { kind: "checklist", title: one(input.title, 60) || "Checklist", items };
  }
  if (kind === "place") {
    const name = one(input.name, 80);
    if (!name) throw new Error("Give the place's name.");
    const address = one(input.address, 160);
    const phone = one(input.phone, 30);
    return { kind: "place", name, address, phone: PHONE.test(phone) ? phone : "", note: one(input.note, 140), maps: directionsLink(address ? `${name}, ${address}` : name) };
  }
  throw new Error('kind must be "choices", "checklist" or "place".');
}

/** What the model is told the user will see. */
export function describeWidget(w: Widget): string {
  if (w.kind === "choices") return `Shown as ${w.options.length} cards to tap (${w.options.map((o) => o.label).join(" / ")}). Say which you'd pick and why in a sentence; don't list them again.`;
  if (w.kind === "checklist") return `Shown as a checklist of ${w.items.length} they can tick off. Don't repeat the items in your text.`;
  return `Shown as a card for ${w.name} with ${[w.maps && "Directions", w.phone && "Call"].filter(Boolean).join(" and ")} button${w.phone ? "s" : ""}. Don't repeat the address or number in your text.`;
}

export const WIDGET_TOOL = {
  name: "show",
  description:
    "Put one small widget under your reply when tapping beats reading. choices: the user is picking between two to four things (plumbers, restaurants, time slots, gift ideas); each is a card with a label and one detail line, and tapping one sends its label as their message. checklist: a list they'll tick off as they go (packing, groceries, steps to get ready). place: one place to go or call, with Directions and Call buttons. One widget per reply, and only for an errand: never in small talk. Your text still leads with the point.",
  schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["choices", "checklist", "place"] },
      title: { type: "string", description: "choices, checklist: a few words, like 'Plumbers' or 'Camping trip'." },
      options: {
        type: "array",
        maxItems: 4,
        description: "choices: two to four.",
        items: { type: "object", properties: { label: { type: "string", description: "What they'd say to pick it: 'Ortiz Plumbing'." }, detail: { type: "string", description: "One line: price, time, why." } }, required: ["label"] },
      },
      items: { type: "array", maxItems: 30, items: { type: "string" }, description: "checklist: one short line each." },
      name: { type: "string", description: "place: its name." },
      address: { type: "string", description: "place: the street address, if you have it." },
      phone: { type: "string", description: "place: the phone number, if you have it." },
      note: { type: "string", description: "place: one line, like the hours or the booking time." },
    },
    required: ["kind"],
  },
};
