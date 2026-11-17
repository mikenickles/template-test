// 0.55: the rest of Gmail, Calendar and Drive. Each change is a card made from what Google
// really has, done only on the user's tap, and most can be undone.
import { describe, expect, it } from "vitest";
import { checkEditEvent, checkFileChange, checkMailChange, fileUndo, type CalendarEvent } from "../core/actions.ts";
import { DRIVE_FULL, NeedsConsentError } from "../core/connectors/google.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const TZ = "America/Los_Angeles";

function google() {
  const granted = new Set<string>();
  return {
    available: true,
    asked: [] as string[][],
    async authorize(scopes: string[], interactive: boolean) {
      this.asked.push(scopes);
      if (interactive) scopes.forEach((s) => granted.add(s));
      if (!scopes.every((s) => granted.has(s))) throw new NeedsConsentError();
      return { accessToken: `tok:${scopes.join(",")}`, grantedScopes: [...granted, "openid"], email: "sam@example.com" };
    },
  };
}

const FOLDER = "application/vnd.google-apps.folder";
const GDOC = "application/vnd.google-apps.document";

/** Gmail, Calendar, Drive and Docs, enough to make and do the cards. */
function apis() {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const files: Record<string, Record<string, unknown>> = {
    folderTaxes01: { id: "folderTaxes01", name: "Taxes", mimeType: FOLDER, parents: ["rootFolder01"] },
    rootFolder01: { id: "rootFolder01", name: "My Drive", mimeType: FOLDER },
    docPlan00001: { id: "docPlan00001", name: "Trip plan", mimeType: GDOC, parents: ["rootFolder01"], webViewLink: "https://docs.google.com/document/d/docPlan00001/edit", capabilities: { canEdit: true, canTrash: true } },
    notesTxt0001: { id: "notesTxt0001", name: "notes.txt", mimeType: "text/plain", parents: ["rootFolder01"], capabilities: { canEdit: true, canTrash: true } },
    newFile00001: { id: "newFile00001", name: "Packing", mimeType: GDOC },
    sharedDoc001: { id: "sharedDoc001", name: "Team handbook", mimeType: GDOC, capabilities: { canEdit: false, canTrash: false } },
  };
  let notes = "milk\neggs\n";
  const event: Record<string, unknown> = {
    id: "mine123",
    summary: "Team sync",
    location: "Room 4",
    start: { dateTime: "2026-11-20T17:00:00Z" },
    end: { dateTime: "2026-11-20T17:30:00Z" },
    organizer: { email: "sam@example.com", self: true },
    attendees: [{ email: "sam@example.com", self: true, responseStatus: "accepted" }, { email: "dana@example.com", responseStatus: "accepted" }],
  };
  const fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const raw = init?.body ? String(init.body) : undefined;
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      /* an upload */
    }
    const u = String(url);
    calls.push({ method, url: u, body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/calendars/primary/events/mine123")) return json({ ...event, htmlLink: "https://calendar.google.com/event?eid=mine123" });
    if (u.endsWith("/users/me/labels") && method === "GET") return json({ labels: [{ id: "INBOX", name: "INBOX" }, { id: "Label_7", name: "Receipts" }] });
    if (u.endsWith("/users/me/labels") && method === "POST") return json({ id: "Label_9", name: (body as { name: string }).name });
    const th = u.match(/\/threads\/([0-9a-f]+)(\/\w+)?/);
    if (th && th[2]) return json({ id: th[1] });
    if (th) return json({ messages: [{ payload: { headers: [{ name: "Subject", value: `Order ${th[1]}` }, { name: "From", value: "Shop <a@shop.example>" }] } }] });
    if (u.startsWith("https://docs.googleapis.com/v1/documents/docPlan00001:batchUpdate")) return json({ replies: [{ replaceAllText: { occurrencesChanged: 2 } }] });
    if (u.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      if (u.includes("/notesTxt0001")) {
        notes = String(raw);
        return json({ id: "notesTxt0001" });
      }
      return json({ id: "newFile00001", webViewLink: "https://docs.google.com/document/d/newFile00001/edit" });
    }
    const f = u.match(/\/drive\/v3\/files\/([\w-]+)(\/export)?/);
    if (f) {
      const file = files[f[1]];
      if (!file) return json({ error: { message: "File not found" } }, 404);
      if (f[2]) return new Response("Day 1: Lisbon. Day 2: Lisbon to Porto.", { status: 200 });
      if (u.includes("alt=media")) return new Response(notes, { status: 200 });
      if (method === "PATCH") return json({ id: file.id, webViewLink: "https://drive.google.com/file/d/x/view" });
      return json(file);
    }
    if (u.startsWith("https://www.googleapis.com/drive/v3/files") && method === "POST") return json({ id: "newFolder001", webViewLink: "https://drive.google.com/drive/folders/newFolder001" });
    if (u.includes("/profile")) return json({ emailAddress: "sam@example.com" });
    return json({ error: { message: "unexpected" } }, 404);
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch, notes: () => notes };
}

async function setup(script: GenerateResult[]) {
  const g = google();
  const api = apis();
  const provider = new FakeProvider(script);
  const lyra = await Lyra.start(platform({ provider, google: g, fetch: api.fetch, timeZone: TZ }));
  for (const id of ["gmail", "calendar", "drive"] as const) await lyra.connectGoogle(id);
  return { lyra, g, api, provider };
}

const changes = (api: ReturnType<typeof apis>) => api.calls.filter((c) => c.method !== "GET");

describe("Gmail: trash, labels, read, star", () => {
  it("reads what was asked", () => {
    expect(checkMailChange({ thread_ids: ["aa11bb22"], change: "delete" })).toMatchObject({ op: "trash" });
    expect(checkMailChange({ thread_ids: ["aa11bb22"], change: "Mark read" })).toMatchObject({ op: "read" });
    expect(() => checkMailChange({ thread_ids: ["aa11bb22"], change: "add_label" })).toThrow(/Which label/);
    expect(() => checkMailChange({ thread_ids: ["aa11bb22"], change: "forward" })).toThrow(/change must be/);
  });

  it("trashes only after the tap, and Undo restores", async () => {
    const { lyra, api, provider } = await setup([call("propose_mail_change", { thread_ids: ["aa11bb22"], change: "trash" }), say("Ready.")]);
    await lyra.allowActions("archive", true);
    const { message } = await lyra.chat("Delete that order email", noop);
    expect(provider.requests[0].tools.map((t) => t.name)).toContain("propose_mail_change");
    const a = lyra.action(message.meta.actions![0])!;
    expect(a).toMatchObject({ kind: "mail", status: "proposed", payload: { op: "trash", threads: [{ subject: "Order aa11bb22", from: "Shop" }] } });
    expect(changes(api)).toEqual([]);
    await lyra.decideAction(a.id, "do");
    expect(changes(api).map((c) => c.url)).toEqual(["https://gmail.googleapis.com/gmail/v1/users/me/threads/aa11bb22/trash"]);
    await lyra.undoAction(a.id);
    expect(changes(api).at(-1)!.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/threads/aa11bb22/untrash");
  });

  it("makes a new label when tapped, and keeps its id so Undo can take it off", async () => {
    const { lyra, api } = await setup([call("propose_mail_change", { thread_ids: ["aa11bb22", "cc33dd44"], change: "add_label", label: "Taxes 2026" }), say("Ready.")]);
    await lyra.allowActions("archive", true);
    const { message } = await lyra.chat("Label those Taxes 2026", noop);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a.payload).toMatchObject({ op: "label", label: { name: "Taxes 2026" } });
    expect((a.payload as { label: { id?: string } }).label.id).toBeUndefined();
    const done = await lyra.decideAction(a.id, "do");
    expect(done.payload).toMatchObject({ label: { id: "Label_9" } });
    expect(changes(api).map((c) => c.body)).toEqual([expect.objectContaining({ name: "Taxes 2026" }), { addLabelIds: ["Label_9"] }, { addLabelIds: ["Label_9"] }]);
    await lyra.undoAction(a.id);
    expect(changes(api).at(-1)!.body).toEqual({ removeLabelIds: ["Label_9"] });
  });

  it("uses an existing label, and won't take off one that isn't there", async () => {
    const { lyra } = await setup([call("propose_mail_change", { thread_ids: ["aa11bb22"], change: "add_label", label: "receipts" }), call("propose_mail_change", { thread_ids: ["aa11bb22"], change: "remove_label", label: "Nope" }, "c2"), say("Ready.")]);
    await lyra.allowActions("archive", true);
    const { message } = await lyra.chat("File it under receipts", noop);
    expect(message.meta.actions).toHaveLength(1);
    expect(lyra.action(message.meta.actions![0])!.payload).toMatchObject({ label: { id: "Label_7", name: "Receipts" } });
  });
});

describe("Calendar: an event's details", () => {
  const e: CalendarEvent = {
    id: "mine123",
    summary: "Team sync",
    location: "Room 4",
    organizer: { email: "sam@example.com", self: true },
    attendees: [{ email: "sam@example.com", self: true }, { email: "dana@example.com" }],
  };

  it("keeps only what changes, and what it was", () => {
    expect(checkEditEvent({ title: "Team sync", location: "Room 9", add_guests: ["lee@example.com"] }, e)).toEqual({
      changes: { location: "Room 9", addGuests: ["lee@example.com"] },
      before: { title: "Team sync", location: "Room 4", description: "", attendees: e.attendees },
      guests: 2,
    });
    expect(() => checkEditEvent({ title: "Team sync" }, e)).toThrow(/Nothing would change/);
    expect(() => checkEditEvent({ remove_guests: ["lee@example.com"] }, e)).toThrow(/isn't on that event/);
    expect(() => checkEditEvent({ remove_guests: ["sam@example.com"] }, e)).toThrow(/propose_rsvp/);
    expect(() => checkEditEvent({ title: "Mine now" }, { ...e, organizer: { email: "lee@example.com" } })).toThrow(/isn't the organizer/);
  });

  it("changes it on the tap, telling guests, and Undo puts it back", async () => {
    const { lyra, api } = await setup([call("propose_edit_event", { event_id: "mine123", location: "Cafe Blue", remove_guests: ["dana@example.com"] }), say("Ready.")]);
    await lyra.allowActions("event", true);
    const { message } = await lyra.chat("Move team sync to Cafe Blue and take Dana off", noop);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a).toMatchObject({ kind: "edit_event", payload: { title: "Team sync", changes: { location: "Cafe Blue", removeGuests: ["dana@example.com"] } } });
    expect(changes(api)).toEqual([]);
    await lyra.decideAction(a.id, "do");
    const patch = changes(api)[0];
    expect(patch.url).toContain("/events/mine123?sendUpdates=all");
    expect(patch.body).toEqual({ location: "Cafe Blue", attendees: [{ email: "sam@example.com", self: true, responseStatus: "accepted" }] });
    await lyra.undoAction(a.id);
    expect(changes(api)[1].body).toMatchObject({ location: "Room 4", attendees: [{ email: "sam@example.com" }, { email: "dana@example.com" }] });
  });
});

describe("Drive: files and folders", () => {
  it("reads what was asked", () => {
    expect(checkFileChange({ change: "create", kind: "folder", name: "Receipts" })).toMatchObject({ op: "create", name: "Receipts", newKind: { kind: "folder" } });
    expect(() => checkFileChange({ change: "create", kind: "doc", name: "Plan" })).toThrow(/its text/);
    expect(() => checkFileChange({ change: "replace", file_id: "docPlan00001", text: "x" })).toThrow(/exact words/);
    expect(() => checkFileChange({ change: "delete_forever", file_id: "docPlan00001" })).toThrow(/change must be/);
    expect(fileUndo({ op: "rename", fileId: "a", name: "Old", newName: "New", kind: "Google Doc" })).toMatchObject({ op: "rename", name: "New", newName: "Old" });
    expect(fileUndo({ op: "append", fileId: "a", name: "Old", kind: "Google Doc", text: "x" })).toBeNull();
  });

  it("asks Google for all of Drive only when turned on, and offers the tool only then", async () => {
    const { lyra, g, provider } = await setup([say("Hi."), say("Hi again.")]);
    await lyra.chat("hi", noop);
    expect(provider.requests[0].tools.map((t) => t.name)).not.toContain("propose_file_change");
    expect(lyra.state().actions.file).toBe(false);
    await lyra.allowActions("drive", true);
    expect(g.asked.at(-1)).toEqual([DRIVE_FULL]);
    await lyra.chat("hi", noop);
    expect(provider.requests[1].tools.map((t) => t.name)).toContain("propose_file_change");
    expect(provider.requests[1].system).toMatch(/propose_file_change/);
  });

  it("moves a file to a folder, with where it was kept for Undo", async () => {
    const { lyra, api } = await setup([call("propose_file_change", { change: "move", file_id: "docPlan00001", folder_id: "folderTaxes01" }), say("Ready.")]);
    await lyra.allowActions("drive", true);
    const { message } = await lyra.chat("Put the trip plan in Taxes", noop);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a).toMatchObject({ kind: "file", payload: { op: "move", name: "Trip plan", kind: "Google Doc", folder: { id: "folderTaxes01", name: "Taxes" }, from: [{ id: "rootFolder01", name: "My Drive" }] } });
    expect(changes(api)).toEqual([]);
    await lyra.decideAction(a.id, "do");
    expect(changes(api)[0].url).toContain("/files/docPlan00001?addParents=folderTaxes01&removeParents=rootFolder01");
    await lyra.undoAction(a.id);
    expect(changes(api)[1].url).toContain("/files/docPlan00001?addParents=rootFolder01&removeParents=folderTaxes01");
  });

  it("replaces exact words in a Google Doc, counting them first", async () => {
    const { lyra, api } = await setup([
      call("propose_file_change", { change: "replace", file_id: "docPlan00001", find: "Lisbon", text: "Madrid" }),
      call("propose_file_change", { change: "replace", file_id: "docPlan00001", find: "Rome", text: "Paris" }, "c2"),
      say("Ready."),
    ]);
    await lyra.allowActions("drive", true);
    const { message } = await lyra.chat("Change Lisbon to Madrid in my trip plan", noop);
    expect(message.meta.actions).toHaveLength(1);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a.payload).toMatchObject({ op: "replace", find: "Lisbon", text: "Madrid", count: 2 });
    const done = await lyra.decideAction(a.id, "do");
    expect(done.result).toMatchObject({ did: "file_replaced" });
    expect(changes(api)[0]).toMatchObject({
      url: "https://docs.googleapis.com/v1/documents/docPlan00001:batchUpdate",
      body: { requests: [{ replaceAllText: { containsText: { text: "Lisbon", matchCase: true }, replaceText: "Madrid" } }] },
    });
    expect(lyra.state().actions.file).toBe(true);
  });

  it("adds to the end of a text file", async () => {
    const { lyra, api } = await setup([call("propose_file_change", { change: "append", file_id: "notesTxt0001", text: "bread" }), say("Ready.")]);
    await lyra.allowActions("drive", true);
    const { message } = await lyra.chat("Add bread to notes.txt", noop);
    await lyra.decideAction(message.meta.actions![0], "do");
    expect(api.notes()).toBe("milk\neggs\nbread\n");
  });

  it("makes a new Google Doc in a folder, and Undo trashes it", async () => {
    const { lyra, api } = await setup([call("propose_file_change", { change: "create", kind: "doc", name: "Packing", folder_id: "folderTaxes01", text: "# Packing\n- Tent" }), say("Ready.")]);
    await lyra.allowActions("drive", true);
    const { message } = await lyra.chat("Make a packing doc in Taxes", noop);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a.payload).toMatchObject({ op: "create", kind: "Google Doc", name: "Packing", folder: { name: "Taxes" } });
    const done = await lyra.decideAction(a.id, "do");
    expect(done).toMatchObject({ payload: { fileId: "newFile00001" }, result: { did: "file_created", link: "https://docs.google.com/document/d/newFile00001/edit" } });
    expect(String(changes(api)[0].body)).toContain('"parents":["folderTaxes01"]');
    await lyra.undoAction(a.id);
    expect(changes(api)[1]).toMatchObject({ method: "PATCH", body: { trashed: true } });
    expect(changes(api)[1].url).toContain("/files/newFile00001?");
  });

  it("won't change a file shared read-only, or one that's already in the trash", async () => {
    const { lyra } = await setup([call("propose_file_change", { change: "rename", file_id: "sharedDoc001", name: "Mine" }), call("propose_file_change", { change: "restore", file_id: "docPlan00001" }, "c2"), say("Can't.")]);
    await lyra.allowActions("drive", true);
    const { message } = await lyra.chat("Rename the handbook and restore the plan", noop);
    expect(message.meta.actions ?? []).toEqual([]);
  });
});
