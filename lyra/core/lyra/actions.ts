/** Approval cards: what may be proposed, deciding a card, undo. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { isTextual } from "../connectors/drive/server.ts";
import { googleGet } from "../connectors/google-http.ts";
import { host, needsOk, type BrowserPage } from "../connectors/browser/server.ts";
import { grantIsAllowed, TokenSource } from "../connectors/google.ts";
import * as A from "../actions.ts";
import * as S from "../skills.ts";
import { getSetting, setSetting } from "../db.ts";
import * as T from "../tasks.ts";
import * as R from "../routines.ts";
import { type AppState, ACTION_ACCESS, type GoogleAction, NEEDS } from "./shared.ts";
import { part } from "./part.ts";

export const actions = part({
  actionToken(kind: GoogleAction): TokenSource {
    return (this.actionTokens[kind] ??= new TokenSource(this.p.google, [ACTION_ACCESS[kind].scope]));
  },

  /** A card for a step on a web page: the button as it is on the page right now, and what Lyra typed there. */
  async proposeBrowserStep(input: Record<string, unknown>, tainted: boolean, channelId: number | null): Promise<{ id: number; summary: string }> {
    const b = this.p.browser;
    if (!b?.act || !this.actionsAllowed().browser) throw new Error("Tomo can't use the browser here: it works on the computer with Tomo's extension, once the Browser tile is on.");
    const ref = Number(input.ref);
    const op = input.op === "submit" ? "submit" : "click";
    const page = this.browserSession.seen(await b.read());
    const c = page.controls?.find((x) => x.ref === ref);
    if (!c) throw new Error(`There's no [${ref}] on the page now. Read the page again (browser__read_page) and use a number from it.`);
    if (c.secret) throw new Error("That's a password or card field: the user does that part themselves.");
    if (op === "submit" ? c.kind !== "field" : c.kind !== "button" && c.kind !== "link") throw new Error(op === "submit" ? `[${ref}] isn't a field in a form.` : `[${ref}] isn't a button or link.`);
    if (!needsOk(c, op)) throw new Error(`[${ref}] doesn't need the user's OK: use ${op === "submit" ? "browser__type_text with enter" : "browser__click"} for it.`);
    const draft: A.BrowserDraft = { site: host(page.url), url: page.url, title: page.title.slice(0, 120), op, ref, label: (c.label || "(button with no words)").slice(0, 120), typed: this.browserSession.typedOn(page.url).slice(-8) };
    const row = A.createAction(this.db, "browser", draft, tainted, channelId);
    return { id: row.id, summary: A.describeAction(row) };
  },

  /** The user said yes: press it, if the page is still the one on the card. */
  async doBrowserStep(d: A.BrowserDraft): Promise<{ did: string; title: string; url: string; at: string }> {
    const b = this.p.browser;
    if (!b?.act || getSetting(this.db, "browser") !== "on") throw new Error("Do this on the computer, with Tomo's browser link on.");
    const now: BrowserPage = this.browserSession.seen(await b.read());
    const same = (u: string) => u.replace(/#.*$/, "");
    if (same(now.url) !== same(d.url)) throw new Error(`Tomo's browser window has moved on from that page (now ${host(now.url)}). Ask Tomo to go back to it.`);
    // the same button: its number, or else the only one with the same words
    const byRef = now.controls?.find((x) => x.ref === d.ref && (x.label || "(button with no words)").slice(0, 120) === d.label);
    const byLabel = now.controls?.filter((x) => (x.label || "(button with no words)").slice(0, 120) === d.label && (d.op === "submit" ? x.kind === "field" : x.kind === "button" || x.kind === "link")) ?? [];
    const c = byRef ?? (byLabel.length === 1 ? byLabel[0] : undefined);
    if (!c) throw new Error(`"${d.label}" isn't on the page anymore. Ask Tomo to look again.`);
    const after = this.browserSession.seen(await b.act({ op: d.op, ref: c.ref, label: c.label }));
    return { did: d.op === "submit" ? "sent" : "pressed", title: after.title.slice(0, 120), url: after.url, at: new Date().toISOString() };
  },

  actionsAllowed(): { email: boolean; event: boolean; move: boolean; rsvp: boolean; remove: boolean; archive: boolean; mail: boolean; edit_event: boolean; file: boolean; text: boolean; playlist: boolean; browser: boolean } {
    const on = (k: GoogleAction) => !!this.link(ACTION_ACCESS[k].link) && getSetting(this.db, ACTION_ACCESS[k].setting) === "on";
    const event = on("event");
    return {
      email: on("email"),
      event,
      move: event,
      rsvp: event,
      remove: event,
      edit_event: event,
      archive: on("archive"),
      mail: on("archive"),
      file: on("drive"),
      // only opens the messaging app with the text ready: on by default on a phone
      text: !!this.p.sms && getSetting(this.db, "actions.text") !== "off",
      playlist: this.spotifyLinked && getSetting(this.db, "spotify.playlists") === "on",
      // (0.60) a step on a web page: wherever Lyra's browser link is on
      browser: !!this.p.browser && getSetting(this.db, "browser") === "on",
    };
  },

  /** Turn on (asks Google for that one permission) or off. Texts need no permission: they open in Messages. */
  async allowActions(kind: GoogleAction | "text", on: boolean): Promise<AppState> {
    if (kind === "text") {
      setSetting(this.db, "actions.text", on ? "on" : "off");
      await this.db.flush();
      return this.state();
    }
    const a = ACTION_ACCESS[kind];
    if (on) {
      if (!this.link(a.link)) throw new Error(`Connect ${a.link === "gmail" ? "Mail" : a.link === "drive" ? "Files" : "Calendar"} first.`);
      if (!this.p.google.available) throw new Error("Google sign-in isn't available here.");
      const r = await this.p.google.authorize([a.scope], true);
      if (!grantIsAllowed(r.grantedScopes, a.scope)) throw new Error("Google granted more than Tomo asked for, so Tomo didn't keep it.");
      await this.actionToken(kind).invalidate();
    }
    setSetting(this.db, a.setting, on ? "on" : "off");
    await this.db.flush();
    return this.state();
  },

  action(id: number): A.ActionRow | undefined {
    return A.getAction(this.db, id);
  },

  /**
   * The user's tap on a card: send / save as a draft / add to the calendar, or not now.
   * `edited` is the card's fields if the user changed them; they're checked again.
   */
  async decideAction(id: number, choice: "send" | "draft" | "add" | "do" | "decline", edited?: Record<string, unknown>): Promise<A.ActionRow> {
    const a = A.getAction(this.db, id);
    if (!a) throw new Error("That's no longer here.");
    if (!A.claimAction(this.db, id)) throw new Error(a.status === "done" ? "That's already done." : a.status === "declined" ? "You said not now to that one." : "That's already being done.");
    // saved as "being done" before anything is sent: if the app dies mid-send, the card says to check, and can't send twice
    await this.db.flush();
    if (choice === "decline") {
      A.finishAction(this.db, id, { status: "declined" });
    } else {
      try {
        if (a.kind === "playlist") {
          if (!this.actionsAllowed().playlist) throw new Error("Tomo isn't allowed to change your Spotify playlists on this device. Turn it on in Connections, then try again.");
          // once the playlist exists it's remembered on the card, so a retry adds to it instead of making a second one
          const result = await A.doPlaylist(this.spotify, a.payload as A.PlaylistDraft, (playlistId) => {
            this.db.run("UPDATE actions SET payload = ? WHERE id = ?", [JSON.stringify({ ...(a.payload as A.PlaylistDraft), playlistId, made: true }), id]);
            void this.db.flush();
          });
          A.finishAction(this.db, id, { status: "done", result });
          await this.db.flush();
          this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
          return A.getAction(this.db, id)!;
        }
        if (a.kind === "browser") {
          const result = await this.doBrowserStep(a.payload as A.BrowserDraft);
          A.finishAction(this.db, id, { status: "done", result });
          await this.db.flush();
          this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
          return A.getAction(this.db, id)!;
        }
        if (a.kind === "text") {
          // opens Messages with the text ready; the user sends it there (or doesn't)
          if (!this.p.sms) throw new Error("Texts open in the phone's messaging app. Do this on your phone.");
          const t = (edited ? A.checkText({ ...a.payload, ...edited }) : a.payload) as A.TextDraft;
          await this.p.sms.compose(t.number, t.body);
          A.finishAction(this.db, id, { status: "done", payload: t, result: { did: "opened", at: new Date().toISOString() } });
          await this.db.flush();
          this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
          return A.getAction(this.db, id)!;
        }
        const payload = edited && (a.kind === "email" || a.kind === "event") ? (a.kind === "email" ? A.checkEmail(edited) : A.checkEvent(edited, this.p.timeZone)) : a.payload;
        const need = ACTION_ACCESS[NEEDS[a.kind]];
        if (!this.actionsAllowed()[a.kind]) throw new Error(`Tomo isn't allowed to ${need.what} on ${this.p.google.available ? "this device" : "here"}. Turn it on in Connections, then try again.`);
        const deps: A.ActionDeps = {
          fetch: this.fetch,
          compose: this.actionToken("email"),
          mailRead: this.tokenFor("gmail"),
          events: this.actionToken("event"),
          modify: this.actionToken("archive"),
          drive: this.actionToken("drive"),
          timeZone: this.p.timeZone,
        };
        if (a.kind === "mail" || a.kind === "file") {
          const r = a.kind === "mail" ? await A.doMail(deps, payload as A.MailDraft) : await A.doFile(deps, payload as A.FileDraft);
          A.finishAction(this.db, id, { status: "done", payload: r.payload, result: r.result });
          await this.db.flush();
          this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
          return A.getAction(this.db, id)!;
        }
        const result =
          a.kind === "email"
            ? await A.doEmail(deps, payload as A.EmailDraft, choice === "draft" ? "draft" : "send")
            : a.kind === "move"
              ? await A.doMove(deps, payload as A.MoveDraft)
              : a.kind === "rsvp"
                ? await A.doRsvp(deps, payload as A.RsvpDraft)
                : a.kind === "remove"
                  ? await A.doRemove(deps, payload as A.RemoveDraft)
                : a.kind === "archive"
                  ? await A.doArchive(deps, payload as A.ArchiveDraft)
                  : a.kind === "edit_event"
                    ? await A.doEditEvent(deps, payload as A.EditEventDraft)
                    : await A.doEvent(deps, payload as A.EventDraft);
        A.finishAction(this.db, id, { status: "done", payload, result });
      } catch (e) {
        A.finishAction(this.db, id, { status: "proposed", error: (e as Error).message.slice(0, 300) });
      }
    }
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
    return A.getAction(this.db, id)!;
  },

  // ---------- 0.55: the rest of Gmail, Calendar and Drive, each a card first ----------

  /** Mail threads to archive, trash, label, star or mark: subjects and senders straight from Gmail. */
  async proposeMail(input: Record<string, unknown>, tainted: boolean, channelId: number | null): Promise<{ id: number; summary: string }> {
    const { op, ids, label } = A.checkMailChange(input);
    const g = googleGet("https://gmail.googleapis.com/gmail/v1/users/me", "Gmail", this.tokenFor("gmail"), this.fetch);
    let lab: A.MailDraft["label"];
    if (op === "label" || op === "unlabel") {
      const r = await g.json<{ labels?: { id: string; name: string }[] }>("/labels", {});
      const found = (r.labels ?? []).find((l) => l.name.toLowerCase() === label.toLowerCase());
      if (!found && op === "unlabel") throw new Error(`There's no label called "${label}".`);
      lab = found ? { id: found.id, name: found.name } : { name: label };
    }
    const threads: A.MailDraft["threads"] = [];
    for (const id of ids) {
      const t = await g.json<{ messages?: { payload?: { headers?: { name: string; value: string }[] } }[] }>(`/threads/${id}`, { format: "metadata", metadataHeaders: ["Subject", "From"] }).catch(() => null);
      const h = t?.messages?.[0]?.payload?.headers ?? [];
      const v = (n: string) => h.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      if (t?.messages?.length) threads.push({ id, subject: v("Subject").slice(0, 120) || "(no subject)", from: v("From").replace(/\s*<[^>]+>/, "").slice(0, 60) });
    }
    if (!threads.length) throw new Error("Gmail didn't find those threads.");
    const row = A.createAction(this.db, "mail", { op, threads, ...(lab ? { label: lab } : {}) }, tainted, channelId);
    return { id: row.id, summary: A.describeAction(row) };
  },

  /** A Drive change, with the file's real name, kind and place read from Drive for the card. */
  async proposeFile(input: Record<string, unknown>, tainted: boolean, channelId: number | null): Promise<{ id: number; summary: string }> {
    const c = A.checkFileChange(input);
    const g = googleGet("https://www.googleapis.com/drive/v3", "Google Drive", this.tokenFor("drive"), this.fetch);
    type F = { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean; webViewLink?: string; capabilities?: { canEdit?: boolean; canTrash?: boolean } };
    const meta = (id: string) => g.json<F>(`/files/${id}`, { fields: "id,name,mimeType,parents,trashed,webViewLink,capabilities(canEdit,canTrash)", supportsAllDrives: true });
    const folder = async (id: string) => {
      const f = await meta(id);
      if (f.mimeType !== A.FOLDER) throw new Error(`"${f.name}" isn't a folder.`);
      if (f.trashed) throw new Error(`The folder "${f.name}" is in the trash.`);
      return { id: f.id, name: f.name };
    };
    const kindOf = (mime: string) =>
      mime === A.GDOC ? "Google Doc" : mime === A.FOLDER ? "folder" : mime.endsWith(".spreadsheet") ? "Google Sheet" : mime.endsWith(".presentation") ? "Google Slides" : mime === "application/pdf" ? "PDF" : isTextual(mime) ? "text file" : mime.split("/")[1] || "file";
    let draft: A.FileDraft;
    if (c.op === "create") {
      draft = { op: "create", name: c.name!, kind: c.newKind!.kind, ...(c.folderId ? { folder: await folder(c.folderId) } : {}), ...(c.text !== undefined ? { text: c.text } : {}) };
    } else {
      const f = await meta(c.fileId!);
      const base = { fileId: f.id, name: f.name, kind: kindOf(f.mimeType), ...(f.webViewLink?.startsWith("https://") ? { link: f.webViewLink } : {}) };
      if (c.op === "restore" && !f.trashed) throw new Error(`"${f.name}" isn't in the trash.`);
      if (c.op !== "restore" && f.trashed) throw new Error(`"${f.name}" is in the trash. Restore it first.`);
      if (c.op === "trash" && f.capabilities?.canTrash === false) throw new Error(`The user can't trash "${f.name}": someone else owns it. They can remove it from their own Drive view instead.`);
      if (c.op !== "trash" && c.op !== "restore" && f.capabilities?.canEdit === false) throw new Error(`"${f.name}" is shared with the user read-only, so it can't be changed.`);
      if (c.op === "rename") {
        if (c.newName === f.name) throw new Error(`It's already called "${f.name}".`);
        draft = { ...base, op: "rename", newName: c.newName };
      } else if (c.op === "move") {
        const to = await folder(c.folderId!);
        if (to.id === f.id) throw new Error("A folder can't go inside itself.");
        if (f.parents?.includes(to.id)) throw new Error(`"${f.name}" is already in ${to.name}.`);
        const from = await Promise.all((f.parents ?? []).map(async (p) => ({ id: p, name: await meta(p).then((x) => x.name, () => "its folder") })));
        draft = { ...base, op: "move", folder: to, from };
      } else if (c.op === "append" || c.op === "replace") {
        if (!(f.mimeType === A.GDOC || isTextual(f.mimeType))) throw new Error(`Tomo can change the text of Google Docs and plain text files, not a ${base.kind}.`);
        if (c.op === "replace") {
          const now = f.mimeType === A.GDOC ? await g.text(`/files/${f.id}/export`, { mimeType: "text/plain" }) : await g.text(`/files/${f.id}`, { alt: "media", supportsAllDrives: true });
          const count = now.replace(/\r\n/g, "\n").split(c.find!).length - 1;
          if (!count) throw new Error(`Those words aren't in "${f.name}". Read it with read_file and give the exact words as they are written.`);
          draft = { ...base, op: "replace", find: c.find, text: c.text ?? "", count };
        } else draft = { ...base, op: "append", text: c.text };
      } else draft = { ...base, op: c.op };
    }
    const row = A.createAction(this.db, "file", draft, tainted, channelId);
    return { id: row.id, summary: A.describeAction(row) };
  },

  /** Put back a done change, on the user's tap: mail, an event's details, a Drive file. */
  async undoAction(id: number): Promise<A.ActionRow> {
    const a = A.getAction(this.db, id);
    if (!a || a.status !== "done" || a.result?.undone || !A.undoable(a)) throw new Error("There's nothing to undo there.");
    const deps: A.ActionDeps = {
      fetch: this.fetch,
      compose: this.actionToken("email"),
      mailRead: this.tokenFor("gmail"),
      events: this.actionToken("event"),
      modify: this.actionToken("archive"),
      drive: this.actionToken("drive"),
      timeZone: this.p.timeZone,
    };
    const need = NEEDS[a.kind as keyof typeof NEEDS];
    if (need && getSetting(this.db, ACTION_ACCESS[need].setting) !== "on") throw new Error(`Tomo isn't allowed to ${ACTION_ACCESS[need].what} on this device anymore. Turn it on in Connections to undo it.`);
    if (a.kind === "mail" || a.kind === "archive") {
      const m: A.MailDraft = a.kind === "archive" ? { op: "archive", threads: (a.payload as A.ArchiveDraft).threads } : (a.payload as A.MailDraft);
      await A.doMail(deps, { ...m, op: A.MAIL_OPS[m.op].undo });
    } else if (a.kind === "edit_event") await A.doEditEvent(deps, a.payload as A.EditEventDraft, true);
    else await A.doFile(deps, A.fileUndo(a.payload as A.FileDraft)!);
    A.finishAction(this.db, id, { status: "done", result: { ...a.result!, undone: new Date().toISOString() } });
    await this.db.flush();
    this.listeners.forEach((l) => l({ type: "message", channelId: a.channel_id }));
    return A.getAction(this.db, id)!;
  },
});
