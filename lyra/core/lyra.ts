/**
 * Lyra's engine. Everything the app does goes through here: it owns the
 * database, memory, model choice, API keys and connectors. It runs inside
 * the Android app; tests and the browser preview run the same code.
 */
import { BankCache, createBankServer, createYnabServer } from "./connectors/money/server.ts";
import { jobIdFor, parsePick } from "./jobs.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTurn, type TurnEmitter, type TurnInbox, type Workspace } from "./chat.ts";
import { createGmailServer } from "./connectors/gmail/server.ts";
import { createCalendarServer } from "./connectors/calendar/server.ts";
import { createDriveServer } from "./connectors/drive/server.ts";
import { googleGet } from "./connectors/google-http.ts";
import { BrowserSession, createBrowserServer } from "./connectors/browser/server.ts";
import { createPhoneServer } from "./connectors/phone/server.ts";
import { TokenSource } from "./connectors/google.ts";
import * as A from "./actions.ts";
import * as P from "./people.ts";
import * as D from "./docs.ts";
import * as S from "./skills.ts";
import * as ST from "./style.ts";
import * as LA from "./lifeadmin.ts";
import * as DB_ from "./dashboard.ts";
import * as PU from "./push.ts";
import * as PL from "./places.ts";
import { SpotifyAuth } from "./connectors/spotify/auth.ts";
import { createSpotifyServer } from "./connectors/spotify/server.ts";
import { wrapUntrusted } from "./untrusted.ts";
import { type Today } from "./today.ts";
import { Connectors } from "./connectors/registry.ts";
import { DB, getChannel, getSetting, addMessage, setSetting, updateMessageMeta, type Channel, type StoredMessage } from "./db.ts";
import { UpdateSource } from "./updates.ts";
import { cancelReminder, createReminder, describeDue, describeReminders, localToDate, pendingReminders, type Reminder } from "./reminders.ts";
import type { Attachment } from "./attachments.ts";
import { localDay, metered, newTally } from "./usage.ts";
import { mainNotebookSpec, Notebook } from "./memory.ts";
import { createProvider, type Keys } from "./providers/index.ts";
import * as T from "./tasks.ts";
import { Workers } from "./workers.ts";
import * as R from "./routines.ts";
import { type LyraEvent, type Platform, type Agenda, SECRET_KEYS, type GoogleId, ACTION_ACCESS, type GoogleAction, NEEDS, GOOGLE, userMessageBefore } from "./lyra/shared.ts";
import { install } from "./lyra/part.ts";
import { models } from "./lyra/models.ts";
import { settings } from "./lyra/settings.ts";
import { actions } from "./lyra/actions.ts";
import { messages } from "./lyra/messages.ts";
import { push } from "./lyra/push.ts";
import { places } from "./lyra/places.ts";
import { live } from "./lyra/live.ts";
import { memory } from "./lyra/memory.ts";
import { tasks } from "./lyra/tasks.ts";
import { routines } from "./lyra/routines.ts";
import { proactive } from "./lyra/proactive.ts";
import { learning } from "./lyra/learning.ts";
import { google } from "./lyra/google.ts";
import { spotify } from "./lyra/spotify.ts";
import { money } from "./lyra/money.ts";
import { device } from "./lyra/device.ts";
import { artifacts } from "./lyra/artifacts.ts";
import { lifeadmin } from "./lyra/lifeadmin.ts";
import { backup } from "./lyra/backup.ts";

export * from "./lyra/shared.ts";

export class Lyra {
  keys: Keys = {};
  running: AbortController | undefined;
  /** The reply being written: its chat, messages sent meanwhile, and when it's done. */
  turn: { channelId: number | null; items: string[]; open: boolean; wake?: () => void; done: Promise<StoredMessage> } | undefined;
  connectors: Connectors;
  /** Spotify sign-in and API (Phase 14). Tokens stay on this device. */
  readonly spotify: SpotifyAuth;
  tokenSources = new Map<GoogleId, TokenSource>();
  customSoul: string | undefined;
  notebooks = new Map<number, Promise<Notebook>>();
  workspace: Workspace;
  readonly workers: Workers;
  listeners = new Set<(e: LyraEvent) => void>();
  readonly routinesRunner: R.Routines;

  private constructor(
    // shared with the parts in core/lyra/ (not private for that reason; treat them as internal)
    readonly p: Platform,
    readonly db: DB,
    public memory: Notebook,
  ) {
    const lyra = this;
    this.workspace = {
      main: memory,
      lifeAdmin: {
        connected: () => this.gmailOn,
        list: () => LA.describeForModel(LA.listItems(this.db), LA.localDay(new Date(), this.p.timeZone)),
        total: () => LA.monthlyTotal(LA.listItems(this.db)),
        scan: async () => {
          const r = await this.scanLifeAdmin();
          return `${r.added} new, ${r.updated} updated`;
        },
        mark: (id, status, userText) => {
          const it = this.db.get<LA.AdminItem>("SELECT * FROM admin_items WHERE id = ?", [id]);
          if (!it) throw new Error("There's no item with that number.");
          // after reading mail, only an item the user named in their own message can be changed
          const said = (userText ?? "").toLowerCase();
          const names = it.who.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !/^(the|and|inc|llc|ltd|company|corp)$/.test(w));
          if (userText !== undefined && !(names.length ? names.some((w) => said.includes(w)) : said.includes(it.who.toLowerCase()))) throw new Error(`Not changed: outside content was read this turn, and the user didn't mention ${it.who}. Ask them first.`);
          LA.setStatus(this.db, id, status);
          void this.db.flush();
          this.listeners.forEach((l) => l({ type: "admin" }));
          return LA.describeItem({ ...it, status }, LA.localDay(new Date(), this.p.timeZone));
        },
      },
      talk: () => ST.styleSection(this.userName === "you" ? "the user" : this.userName, ST.readStyle(this.db)?.notes, ST.mirrorOn(this.db)),
      skills: {
        index: () => S.describeSkills(S.listSkills(this.db)),
        use: (name) => {
          const s = S.findSkill(this.db, name);
          if (!s) return null;
          S.markUsed(this.db, s.id);
          return { id: s.id, name: s.name, steps: s.steps };
        },
        save: (input) => {
          const r = S.saveSkill(this.db, { name: input.name, use_when: input.use_when, steps: input.steps });
          return { id: r.skill.id, name: r.skill.name, created: r.created };
        },
      },
      docs: {
        recent: () => D.describeDocs(D.listDocs(this.db, 12)),
        write: (input, channelId, tainted) => {
          const d = D.createDoc(this.db, { ...input, channelId, tainted });
          this.listeners.forEach((l) => l({ type: "doc", docId: d.id }));
          return { id: d.id, title: d.title };
        },
        update: (id, patch, tainted) => {
          if (D.getDoc(this.db, id)?.kind === "dashboard") throw new Error("That's a dashboard: change it with update_dashboard.");
          const d = D.updateDoc(this.db, id, { ...patch, tainted });
          this.listeners.forEach((l) => l({ type: "doc", docId: d.id }));
          return { id: d.id, title: d.title };
        },
        dashboard: (input, channelId, tainted) => {
          const dash = DB_.checkDashboard(input.dashboard);
          // How to rebuild it later (Refresh runs this again, with tools). From a clean turn, Lyra's own
          // words; after outside content was read, only what the user themselves asked for.
          const one = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 400) : "");
          const own = one(input.ask) ? `${this.userName === "you" ? "The user" : this.userName} asked: "${one(input.ask)}"` : "";
          const recipe = tainted ? own : one(input.refresh) || own;
          if (input.id !== undefined) {
            const had = D.getDoc(this.db, input.id);
            if (!had || had.kind !== "dashboard") throw new Error(`There's no dashboard #${input.id}.`);
            // a later ask adds to how it's made; it doesn't erase it
            const instructions = !had.instructions.trim() ? recipe : tainted ? (own && !had.instructions.includes(one(input.ask)) ? `${had.instructions}\nThen ${own}`.slice(0, 1000) : undefined) : one(input.refresh) || undefined;
            const d = D.updateDoc(this.db, input.id, { title: input.title, body: JSON.stringify(dash), tainted, instructions: instructions || undefined, refreshed: true });
            this.listeners.forEach((l) => l({ type: "doc", docId: d.id }));
            return { id: d.id, title: d.title, created: false };
          }
          const d = D.createDoc(this.db, { title: input.title, body: JSON.stringify(dash), channelId, tainted, kind: "dashboard", instructions: recipe });
          this.listeners.forEach((l) => l({ type: "doc", docId: d.id }));
          return { id: d.id, title: d.title, created: true };
        },
        count: (kind) => this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM docs WHERE kind = ?", [kind])!.n,
        read: (id) => {
          const d = D.getDoc(this.db, id);
          if (!d) throw new Error(`There's no doc #${id}.`);
          const text =
            d.kind === "dashboard"
              ? `# ${d.title} (dashboard)\n\n${DB_.describeDashboard(JSON.parse(d.body))}${d.instructions ? `\n\nHow it's refreshed: ${d.instructions}` : ""}`
              : `# ${d.title}\n\n${d.body}`;
          return { text: d.tainted ? wrapUntrusted(`doc #${d.id}`, text) : text, title: d.title, tainted: d.tainted };
        },
      },
      people: {
        directory: () => P.describePeople(P.listPeople(this.db)),
        remember: (input) => {
          const r = P.rememberPerson(this.db, input as unknown as P.PersonInput);
          return { id: r.person.id, name: r.person.name, created: r.created };
        },
        lookUp: (name) => {
          const p = P.findPerson(this.db, name);
          return p ? P.describePerson(p) : null;
        },
      },
      // (0.64) who does what: Tomo can read and change the model for a job when asked
      models: {
        table: async () => (await lyra.jobModels()).map((j) => `${j.id}: ${j.label} → ${j.model}`).join("\n"),
        set: async (job: string, model: string) => {
          await lyra.setJobModel(job.trim().toLowerCase(), model);
          const row = (await lyra.jobModels()).find((j) => j.id === job.trim().toLowerCase());
          return row ? `${row.label} now runs on ${row.model}${row.pick === "auto" ? " (automatic)" : ""}.` : "Changed.";
        },
      },
      // Spotify playback, only while connected with the playback switch on
      get music() {
        return lyra.spotifyLinked && getSetting(lyra.db, "spotify.playback") === "on" ? { control: (action: string, uri?: string) => lyra.controlMusic(action, uri) } : undefined;
      },
      // only while the user has it turned on, on a phone that can
      get contacts() {
        return lyra.contactsOn
          ? {
              find: async (name: string) => {
                const hits = await lyra.p.contacts!.find(String(name).slice(0, 80));
                if (!hits.length) return "No contact by that name.";
                // the user's own address book; names can still be anything, so it's data, not instructions
                return wrapUntrusted(
                  "contacts",
                  hits
                    .slice(0, 5)
                    .map((h) => `- ${h.name}${h.emails.length ? ` · ${h.emails.join(", ")}` : ""}${h.phones.length ? ` · ${h.phones.join(", ")}` : ""}`)
                    .join("\n"),
                );
              },
            }
          : undefined;
      },
      channels: () => this.channels(),
      notebook: (id) => this.notebook(id),
      createChannel: (input) => this.createChannel(input),
      startTask: (id, note) => void this.workers.start(id, "lyra", note),
      actions: {
        allowed: () => this.actionsAllowed(),
        propose: async (kind, input, tainted, channelId) => {
          if (kind === "playlist") {
            if (!this.actionsAllowed().playlist) throw new Error("You can't change Spotify playlists yet: the user can turn it on in Connections.");
            const p = A.checkPlaylist(input);
            // the card shows the songs' real names, straight from Spotify
            const tracks: A.PlaylistDraft["tracks"] = [];
            for (let i = 0; i < p.uris.length; i += 50) {
              const ids = p.uris.slice(i, i + 50).map((u) => u.split(":")[2]);
              const r = await this.spotify.get<{ tracks: ({ uri: string; name: string; artists?: { name: string }[] } | null)[] }>(`/tracks?ids=${ids.join(",")}`);
              for (const t of r.tracks) if (t) tracks.push({ uri: t.uri, name: t.name, artist: (t.artists ?? []).map((a) => a.name).join(", ") });
            }
            if (!tracks.length) throw new Error("Spotify didn't find those songs.");
            const name = p.playlistId ? (await this.spotify.get<{ name: string }>(`/playlists/${p.playlistId}?fields=name`)).name : p.name;
            const row = A.createAction(this.db, "playlist", { name, description: p.description, ...(p.playlistId ? { playlistId: p.playlistId } : {}), tracks }, tainted, channelId);
            return { id: row.id, summary: A.describeAction(row) };
          }
          if (kind === "browser") return this.proposeBrowserStep(input, tainted, channelId);
          if (kind === "text") {
            if (!this.actionsAllowed().text) throw new Error("Texting isn't available here: it works on the phone, and the user can turn it on in Connections.");
            const row = A.createAction(this.db, "text", A.checkText(input), tainted, channelId);
            return { id: row.id, summary: A.describeAction(row) };
          }
          if (!this.actionsAllowed()[kind]) throw new Error(`You can't ${ACTION_ACCESS[NEEDS[kind]].what} yet: the user can turn it on in Connections.`);
          if (kind === "remove") {
            // the card shows the event as it really is on the calendar: what it's called, when, and who else is on it
            const e = await A.getEvent({ fetch: this.fetch }, this.tokenFor("calendar"), A.checkEventId(input.event_id));
            const row = A.createAction(this.db, "remove", A.checkRemove(e, this.p.timeZone), tainted, channelId);
            return { id: row.id, summary: A.describeAction(row, this.p.timeZone) };
          }
          if (kind === "move" || kind === "rsvp") {
            // the card shows the event as it really is on the calendar, not as the model described it
            const e = await A.getEvent({ fetch: this.fetch }, this.tokenFor("calendar"), A.checkEventId(input.event_id));
            const when = A.eventWhen(e, this.p.timeZone);
            let payload: A.MoveDraft | A.RsvpDraft;
            if (kind === "move") {
              const others = (e.attendees ?? []).filter((a) => !a.self).length;
              if (e.organizer && !e.organizer.self && others) throw new Error(`The user isn't the organizer of "${e.summary ?? "that event"}", so it can't be moved for everyone. Offer to email the organizer asking for a new time instead.`);
              payload = { eventId: e.id, title: e.summary?.trim() || "(no title)", was: when, ...A.checkMove(input, e, this.p.timeZone), guests: others };
            } else {
              const r = A.checkRsvp(input);
              if (!(e.attendees ?? []).some((a) => a.self)) throw new Error("The user isn't a guest on that event, so there's nothing to answer.");
              payload = { eventId: e.id, title: e.summary?.trim() || "(no title)", when, organizer: e.organizer?.displayName || e.organizer?.email || "", response: r.response, note: r.note };
            }
            const row = A.createAction(this.db, kind, payload, tainted, channelId);
            return { id: row.id, summary: A.describeAction(row, this.p.timeZone) };
          }
          if (kind === "mail") return this.proposeMail(input, tainted, channelId);
          if (kind === "edit_event") {
            // the card shows the event as it really is, and keeps what it was for Undo
            const e = await A.getEvent({ fetch: this.fetch }, this.tokenFor("calendar"), A.checkEventId(input.event_id));
            const row = A.createAction(this.db, "edit_event", { eventId: e.id, title: e.summary?.trim() || "(no title)", when: A.eventWhen(e, this.p.timeZone), ...A.checkEditEvent(input, e) }, tainted, channelId);
            return { id: row.id, summary: A.describeAction(row, this.p.timeZone) };
          }
          if (kind === "file") return this.proposeFile(input, tainted, channelId);
          if (kind === "archive") {
            // subject and sender straight from Gmail, so the card lists exactly what will move
            const g = googleGet("https://gmail.googleapis.com/gmail/v1/users/me", "Gmail", this.tokenFor("gmail"), this.fetch);
            const threads: A.ArchiveDraft["threads"] = [];
            for (const id of A.checkArchive(input)) {
              const t = await g.json<{ messages?: { payload?: { headers?: { name: string; value: string }[] } }[] }>(`/threads/${id}`, { format: "metadata", metadataHeaders: ["Subject", "From"] }).catch(() => null);
              const h = t?.messages?.[0]?.payload?.headers ?? [];
              const v = (n: string) => h.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
              if (t?.messages?.length) threads.push({ id, subject: v("Subject").slice(0, 120) || "(no subject)", from: v("From").replace(/\s*<[^>]+>/, "").slice(0, 60) });
            }
            if (!threads.length) throw new Error("Gmail didn't find those threads.");
            const row = A.createAction(this.db, "archive", { threads }, tainted, channelId);
            return { id: row.id, summary: A.describeAction(row) };
          }
          const payload = kind === "email" ? A.checkEmail(input) : A.checkEvent(input, this.p.timeZone);
          const row = A.createAction(this.db, kind, payload, tainted, channelId);
          return { id: row.id, summary: A.describeAction(row, this.p.timeZone) };
        },
        recent: () =>
          A.recentActions(this.db)
            .map((a) => `- #${a.id} ${A.describeAction(a, this.p.timeZone)}: ${a.status === "done" ? (a.result?.did ?? "done") : a.status === "declined" ? "the user said not now" : a.error ? `not done yet (last try failed: ${a.error})` : "waiting for the user's tap"}`)
            .join("\n"),
      },
      reminders: {
        list: () => [describeReminders(pendingReminders(this.db), this.p.timeZone), PL.describePlaceReminders(PL.pendingPlaceReminders(this.db))].filter(Boolean).join("\n"),
        atPlace: async (text, place, on, channelId) => {
          const r = await this.remindAtPlace(text, place, on, channelId);
          return { id: r.id, place: r.place };
        },
        cancelPlace: (id) => {
          const r = PL.cancelPlaceReminder(this.db, id);
          this.listeners.forEach((l) => l({ type: "reminder" }));
          return `Cancelled: ${r.text} (${r.place}).`;
        },
        create: (kind, text, at, channelId) => {
          const when = localToDate(at, this.p.timeZone);
          if (!when) throw new Error("That time doesn't look right. Use YYYY-MM-DD HH:MM in the user's local time.");
          const r = createReminder(this.db, { kind, text, at: when, channelId });
          this.listeners.forEach((l) => l({ type: "reminder" }));
          return { id: r.id, when: describeDue(when, this.p.timeZone) };
        },
        cancel: (id) => {
          const r = cancelReminder(this.db, id);
          this.listeners.forEach((l) => l({ type: "reminder" }));
          return `Cancelled: ${r.text}`;
        },
      },
      routines: {
        list: () => this.routines(),
        create: (input) => this.createRoutine(input),
        update: (id, input) => this.updateRoutine(id, input),
      },
    };
    for (const g of GOOGLE) this.tokenSources.set(g.id, new TokenSource(p.google, [g.scope]));
    const servers: Record<GoogleId, () => McpServer> = {
      gmail: () => createGmailServer(this.tokenFor("gmail"), this.fetch),
      calendar: () => createCalendarServer(this.tokenFor("calendar"), this.fetch, p.timeZone),
      drive: () => createDriveServer(this.tokenFor("drive"), this.fetch),
    };
    this.spotify = new SpotifyAuth(p.secrets, (...a) => this.fetch(...a));
    this.bankCache = new BankCache(async () => (await p.secrets.get("bank.access")) ?? null, this.http);
    this.connectors = new Connectors([
      ...GOOGLE.map((g) => ({
        id: g.id,
        label: g.label,
        access: g.access,
        allow: g.allow,
        labels: g.labels,
        available: () => p.google.available,
        connected: () => !!this.link(g.id),
        account: () => this.link(g.id)?.email,
        server: servers[g.id],
      })),
      {
        id: "spotify",
        label: "Spotify",
        access: "Can see what you play",
        allow: ["now_playing", "recently_played", "top_items", "search", "my_playlists", "playlist_tracks"],
        labels: {
          now_playing: "Checking what's playing",
          recently_played: "Checking what you played",
          top_items: "Looking at your favorites",
          search: "Searching Spotify",
          my_playlists: "Looking at your playlists",
          playlist_tracks: "Reading the playlist",
        },
        available: () => !!p.oauth,
        connected: () => this.spotifyLinked,
        account: () => this.spotifyLink?.name,
        server: () => createSpotifyServer(this.spotify),
      },
      {
        id: "browser",
        label: "Browser",
        access: "Can open pages in its own window of your browser, follow links, type and search there; asks first before anything that sends, buys or changes something",
        allow: ["open_page", "read_page", "click", "type_text", "choose_option", "go_back"],
        labels: { open_page: "Opening the page", read_page: "Reading the page", click: "Clicking on the page", type_text: "Typing on the page", choose_option: "Picking an option", go_back: "Going back" },
        available: () => !!p.browser,
        connected: () => getSetting(this.db, "browser") === "on",
        account: () => undefined,
        server: () => createBrowserServer(p.browser!, this.browserSession),
      },
      {
        id: "bank",
        label: "Bank accounts",
        access: "Can see your bank and card balances and transactions, read only (it can never move money)",
        allow: ["accounts", "transactions", "spending"],
        labels: { accounts: "Checking your accounts", transactions: "Looking through your transactions", spending: "Adding up your spending" },
        available: () => true,
        connected: () => this.money.bank,
        account: () => undefined,
        server: () => createBankServer(this.bankCache, p.timeZone),
      },
      {
        id: "ynab",
        label: "YNAB",
        access: "Can see your YNAB budget and its transactions, read only",
        allow: ["budget", "budget_transactions"],
        labels: { budget: "Checking your budget", budget_transactions: "Looking through your budget" },
        available: () => true,
        connected: () => this.money.ynab,
        account: () => undefined,
        server: () => createYnabServer(async () => (await p.secrets.get("ynab.token")) ?? null, this.http),
      },
      {
        id: "phone",
        label: "Phone",
        access: "Can read your phone's notifications",
        allow: ["recent_notifications"],
        labels: { recent_notifications: "Checking your notifications" },
        available: () => !!p.notices,
        connected: () => getSetting(this.db, "notices") === "on",
        account: () => undefined,
        server: () =>
          createPhoneServer(
            {
              recent: async (since) => {
                if (!(await p.notices!.access())) throw new Error("Notification access is off in Android settings. Tell the user they can turn it back on from the Tomo page.");
                return p.notices!.recent(since);
              },
            },
            p.timeZone,
          ),
      },
    ]);
    this.workers = new Workers({
      db,
      workspace: this.workspace,
      connectors: this.connectors,
      provider: async (job?: string) => metered(await this.modelForJob("task"), "worker", db, p.timeZone, job),
      userName: () => this.userName,
      soul: () => this.customSoul,
      timeZone: p.timeZone,
      onEvent: (e) => this.listeners.forEach((l) => l(e)),
      webSearch: () => this.webSearch,
      flush: () => db.flush(),
    });
    this.routinesRunner = new R.Routines({
      db,
      workspace: this.workspace,
      connectors: this.connectors,
      provider: async (source = "routine", tier = "main", job?: string, pick?: string) => {
        // (0.67) a routine's own model, while its provider's key is still saved
        const own = pick && !this.p.provider ? parsePick(pick) : null;
        if (own && this.keys[own.provider as "anthropic" | "openai" | "gemini"]) return metered(await createProvider(this.keys, own), source, db, p.timeZone, job);
        const id = jobIdFor(source, tier, job);
        return metered(id ? await this.modelForJob(id) : await this.modelFor(tier), source, db, p.timeZone, job);
      },
      // (0.64) a news-only look runs on its own model when that differs from the one that writes
      splitModels: async (source?: string, job?: string) => {
        if (this.p.quickProvider) return true;
        if (this.p.provider) return false;
        const id = jobIdFor(source ?? "routine", "quick", job) ?? "routine_news";
        const look = await this.jobChoice(id);
        const main = this.choice();
        return look.model !== main.model || look.provider !== main.provider;
      },
      userName: () => this.userName,
      soul: () => this.customSoul,
      timeZone: p.timeZone,
      webSearch: () => this.webSearch,
      onEvent: (e) => this.listeners.forEach((l) => l(e)),
      flush: () => db.flush(),
    });
  }

  static async start(p: Platform, opts: { resumeWorkers?: boolean } = {}): Promise<Lyra> {
    // notebook and soul edits count as changes too (sync's own state file doesn't)
    const texts = p.texts;
    let lyraRef: Lyra | undefined;
    p = {
      ...p,
      texts: {
        ...texts,
        read: (n) => texts.read(n),
        write: async (n, t) => {
          await texts.write(n, t);
          if (/\.md$/.test(n)) lyraRef?.dataChanged();
        },
        ...(texts.remove ? { remove: (n: string) => texts.remove!(n) } : {}),
      },
    };
    const db = await DB.open(p.SQL, p.blobs);
    const userName = getSetting(db, "userName") ?? "you";
    const memory = await Notebook.open(db, p.texts, mainNotebookSpec(userName));
    const lyra = new Lyra(p, db, memory);
    lyraRef = lyra;
    db.onWrite = () => lyra.dataChanged();
    lyra.customSoul = (await p.texts.read("soul.md"))?.trim() || undefined;
    // (0.61) the app is called Tomo now: a soul the user edited still names the old name once
    if (lyra.customSoul && /\bLyra\b/.test(lyra.customSoul) && !getSetting(db, "soulRenamed")) {
      lyra.customSoul = lyra.customSoul.replace(/\bLyra\b/g, "Tomo");
      await p.texts.write("soul.md", lyra.customSoul + "\n");
      setSetting(db, "soulRenamed", "1");
    }
    // (0.63.2) the old name story (Lyra's constellation) in an edited soul gives way to Tomo's
    if (lyra.customSoul?.includes("named after a small, bright constellation")) {
      lyra.customSoul = lyra.customSoul.replace(/You're named after a small, bright constellation: easy to find, steady, there every night\./, "Your name, Tomo, comes from the Japanese word for friend (友, tomo): someone steady who's on your side. Your face is a little white robot with a dark screen face, two white eyes, orange headphones and antenna, an orange scarf and a green backpack; you type on a laptop while you work. If {user} asks about your name or where it came from, that's the answer; you were called Lyra before.");
      await p.texts.write("soul.md", lyra.customSoul + "\n");
    }
    for (const k of SECRET_KEYS) lyra.keys[k] = (await p.secrets.get(`key.${k}`)) ?? undefined;
    lyra.money = { bank: !!(await p.secrets.get("bank.access")), ynab: !!(await p.secrets.get("ynab.token")) };
    lyra.keys.openaiBaseUrl = getSetting(db, "openaiBaseUrl") || undefined;
    // (0.56) the Windows app listens for Lyra's browser extension only while it's turned on
    if (p.browser && getSetting(db, "browser") === "on") await p.browser.listen(true).catch(() => {});
    // Workers cut off when the app was closed carry on where they stopped (not after
    // loading another device's data: those runs belong to that device).
    if (opts.resumeWorkers !== false) lyra.workers.resumeInterrupted();
    // an email or event cut off mid-send: back to the user, who can check Gmail/Calendar first
    db.run("UPDATE actions SET status = 'proposed', error = ? WHERE status = 'working'", ["Tomo was closed while doing this. Check it didn't go through before trying again."]);
    // a follow-up that came due as the app closed: say so, rather than let it vanish
    if (opts.resumeWorkers !== false) {
      const lost = db.all<{ id: number; text: string; channel_id: number | null }>(
        "SELECT id, text, channel_id FROM reminders WHERE kind = 'follow_up' AND status = 'done' AND message_id IS NULL AND done_at > ?",
        [new Date(Date.now() - 3 * 86_400_000).toISOString()],
      );
      for (const r of lost) {
        const channelId = r.channel_id && getChannel(db, r.channel_id) ? r.channel_id : null;
        const m = addMessage(db, "assistant", `I was going to check on this, but Tomo closed before I could: ${r.text}\n\nWant me to look now?`, { reminder: { id: r.id, kind: "follow_up" } }, channelId);
        db.run("UPDATE reminders SET message_id = ? WHERE id = ?", [m.id, r.id]);
      }
    }
    return lyra;
  }

  get fetch(): typeof fetch {
    return this.p.fetch ?? ((...a) => fetch(...a));
  }

/** Updates from your Drive's "Lyra Updates" folder, through the read-only Files connection. */
  updates(): UpdateSource {
    if (!this.link("drive")) throw new Error("Connect Files (Google Drive) on the Tomo page to get updates.");
    return new UpdateSource(this.tokenFor("drive"), this.fetch);
  }

  get webSearch(): boolean {
    return getSetting(this.db, "webSearch") !== "off";
  }

  get userName(): string {
    return getSetting(this.db, "userName") || "you";
  }

  // ---------- settings ----------

  // ---------- (0.53) running summaries of long chats ----------

  summarizing = new Set<string>();

  // ---- (0.64) who does what: a model per job ----
  tinyCache?: { main: string; model: string };

  quickCache: { main: string; model: string } | null = null;

  // ---------- actions: emails and events, done only on the user's tap ----------

  actionTokens: Partial<Record<GoogleAction, TokenSource>> = {};

  /** (0.60) What Lyra saw and typed in its browser window, shared by the browser tools and the step cards. */
  readonly browserSession = new BrowserSession();

  // ---------- push: the home base rings your phone ----------

  pushSender?: PU.PushSender;

  agendaCache?: { at: number; day: string; value: Agenda };

  async chat(
    text: string,
    emit: TurnEmitter,
    channelId: number | null = null,
    attachments: Attachment[] = [],
    opts: { preview?: string } = {},
  ): Promise<{ message: StoredMessage; user: StoredMessage; queued?: boolean }> {
    const clean = text.trim();
    if (!clean && !attachments.length) throw new Error("Say something first.");
    if (clean.length > 20_000) throw new Error("That message is too long.");
    const channel = channelId === null ? null : getChannel(this.db, channelId);
    if (channel === undefined) throw new Error("That channel no longer exists.");
    // Back to back: while Lyra is answering in this chat, a new message joins that reply.
    const t = this.turn;
    if (t && t.open && !this.running?.signal.aborted && t.channelId === channelId && !attachments.length) {
      const user = addMessage(this.db, "user", clean, {}, channelId);
      t.items.push(clean);
      t.wake?.();
      void this.db.flush();
      return { message: await t.done, user, queued: true };
    }
    // Otherwise wait for the current reply to finish (a moment ago it stopped taking more).
    while (this.running) {
      if (!this.turn) throw new Error("Tomo is still answering the last message.");
      if (this.turn.channelId !== channelId) throw new Error("Tomo is still answering in another chat.");
      await this.turn.done.catch(() => {});
    }
    this.running = new AbortController();
    let finish!: (m: StoredMessage) => void;
    let fail!: (e: unknown) => void;
    const done = new Promise<StoredMessage>((res, rej) => ((finish = res), (fail = rej)));
    done.catch(() => {});
    // not open for more until this message is saved (runTurn does that first thing)
    const turn: NonNullable<Lyra["turn"]> = { channelId, items: [], open: false, done };
    this.turn = turn;
    const inbox: TurnInbox = {
      take: () => turn.items.splice(0),
      listen: (fn) => (turn.wake = fn),
      close: () => (turn.open = false),
    };
    try {
      // the reply's own count: every call this turn makes, shown with the reply
      const tally = newTally();
      const provider = metered(this.p.provider ?? (await createProvider(this.keys, this.choice())), "chat", this.db, this.p.timeZone, channel ? `Chat: ${channel.name}` : "Chat", tally);
      turn.open = true;
      const message = await runTurn(
        {
          db: this.db,
          workspace: this.workspace,
          channel,
          connectors: this.connectors,
          provider,
          userName: this.userName,
          soul: this.customSoul,
          timeZone: this.p.timeZone,
          webSearch: this.webSearch,
          earlier: this.chatSummary(channelId) ?? undefined,
          preview: opts.preview?.slice(0, 400),
          setup: await this.setupSummary().catch(() => undefined),
        },
        clean,
        emit,
        this.running.signal,
        attachments,
        inbox,
      );
      if (tally.calls) {
        message.meta = { ...message.meta, usage: { input: tally.input, output: tally.output, calls: tally.calls, model: tally.model, cached: tally.cached } };
        updateMessageMeta(this.db, message.id, message.meta);
      }
      finish(message);
      // a chat screen that was closed and reopened mid-reply hears that it's done
      this.listeners.forEach((l) => l({ type: "message", channelId }));
      // the cards in this reply know where they are, for "jump to it" from Today
      for (const id of message.meta.actions ?? []) this.db.run("UPDATE actions SET message_id = ? WHERE id = ?", [message.id, id]);
      // (0.53) a long chat: fold its older messages into the running summary, in the background
      void this.summarizeChat(channelId).catch((e) => console.error("[lyra] chat summary failed", e));
      return { message, user: userMessageBefore(this.db, channelId, message.id) };
    } catch (e) {
      fail(e);
      throw e;
    } finally {
      turn.open = false;
      if (this.turn === turn) this.turn = undefined;
      this.running = undefined;
      void this.db.flush();
    }
  }

  /** The chat a reply is being written in right now (undefined when none is). */
  replyingIn(): number | null | undefined {
    return this.turn?.channelId;
  }

  stop(): void {
    this.running?.abort();
  }

  /** A reply is being written or a worker is running: not a moment to swap the data out. */
  get busy(): boolean {
    return !!this.running || this.workers.busyCount > 0;
  }

  /** Busy, or doing something of its own (a routine, a heads-up, a mail scan): not a moment to reload the app. */
  get working(): boolean {
    return this.busy || this.routinesRunner.active || this.scanning;
  }

  // ---------- workers ----------

  /** Subscribe to background activity (task changes, worker reports). Returns an unsubscribe function. */
  onChange(fn: (e: LyraEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  checkingTriggers = false;

  // ---------- mail watch ----------

  mailWatching = false;

  // ---------- talking like the user ----------

  learningStyle = false;

  // ---------- the weekly memory tidy-up (Phase 10) ----------

  tidying = false;

  // ---- (0.63) money, read only: bank accounts through SimpleFIN, and YNAB ----
  /** which money connections this device holds (their secrets never sync) */
  money = { bank: false, ynab: false };
  readonly bankCache: BankCache;

  /** (0.63.3) things only the app knows about this device (Keep watch, sync, display), for "Your setup" */
  deviceFacts?: () => Promise<string[]>;

  docsToken: TokenSource | undefined;

  refreshing = new Set<number>();

  // ---------- life admin (Phase 18) ----------

  scanning = false;

  /** Save everything now (the app calls this when it goes to the background). */
  flush(): Promise<void> {
    return this.db.flush();
  }

  // ---------- backup ----------

  changeListeners = new Set<() => void>();
  /** Called whenever Lyra's data changes (sync watches this). */
  onDataChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }
  dataChanged(): void {
    this.changeListeners.forEach((f) => f());
  }
}

// ---- the methods kept in core/lyra/*.ts, put onto the class ----
type Parts = typeof models &
  typeof settings &
  typeof actions &
  typeof messages &
  typeof push &
  typeof places &
  typeof live &
  typeof memory &
  typeof tasks &
  typeof routines &
  typeof proactive &
  typeof learning &
  typeof google &
  typeof spotify &
  typeof money &
  typeof device &
  typeof artifacts &
  typeof lifeadmin &
  typeof backup;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Lyra extends Parts {}
install(Lyra.prototype, [models, settings, actions, messages, push, places, live, memory, tasks, routines, proactive, learning, google, spotify, money, device, artifacts, lifeadmin, backup]);
