/** Skills, docs, dashboards and people. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { DRIVE_FILE, grantIsAllowed, TokenSource } from "../connectors/google.ts";
import * as A from "../actions.ts";
import * as P from "../people.ts";
import * as D from "../docs.ts";
import * as S from "../skills.ts";
import * as LA from "../lifeadmin.ts";
import * as DB_ from "../dashboard.ts";
import { neutralize, wrapUntrusted } from "../untrusted.ts";
import { localDay, metered } from "../usage.ts";
import * as T from "../tasks.ts";
import { part } from "./part.ts";

export const artifacts = part({
  // ---------- skills (Phase 17) ----------

  skills(): S.Skill[] {
    return S.listSkills(this.db);
  },

  async saveSkill(id: number | null, input: { name: string; use_when: string; steps: string }): Promise<S.Skill> {
    const r = S.saveSkill(this.db, { id, ...input });
    await this.db.flush();
    return r.skill;
  },

  async deleteSkill(id: number): Promise<void> {
    S.deleteSkill(this.db, id);
    await this.db.flush();
  },

  // ---------- docs (Phase 13) ----------

  docs(): D.Doc[] {
    return D.listDocs(this.db);
  },

  doc(id: number): D.Doc | undefined {
    return D.getDoc(this.db, id);
  },

  /** Edited by hand in the app. */
  async saveDoc(id: number | null, patch: { title: string; body: string }): Promise<D.Doc> {
    const d = id === null ? D.createDoc(this.db, patch) : D.updateDoc(this.db, id, patch);
    await this.db.flush();
    return d;
  },

  async deleteDoc(id: number): Promise<void> {
    D.deleteDoc(this.db, id);
    await this.db.flush();
  },

  /** Rebuild a dashboard with fresh data, the way it says it's made. Read-only tools; reading outside content marks it. */
  async refreshDashboard(id: number): Promise<D.Doc> {
    const d = D.getDoc(this.db, id);
    if (!d || d.kind !== "dashboard") throw new Error("That dashboard is no longer here.");
    if (!d.instructions.trim()) throw new Error("This dashboard doesn't say how to refresh it. Ask Tomo in chat to update it.");
    if (this.refreshing.has(id)) throw new Error("Already refreshing it.");
    this.refreshing.add(id);
    try {
      const provider = metered(await this.modelForJob("dashboard"), "chat", this.db, this.p.timeZone, `Dashboard: ${d.title}`);
      const la = this.gmailOn
        ? [{ name: "life_admin", description: "Bills, subscriptions, packages, trips and returns found in the user's email.", schema: { type: "object", properties: {} } }]
        : [];
      const today = new Date().toLocaleDateString("en-US", { timeZone: this.p.timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const r = await DB_.rebuildDashboard({
        provider,
        tools: [...la, ...(await this.connectors.tools())],
        call: async (name, input) => {
          if (name === "life_admin" && la.length) {
            const items = LA.listItems(this.db);
            const total = LA.monthlyTotal(items);
            const list = LA.describeForModel(items, LA.localDay(new Date(), this.p.timeZone));
            return { content: wrapUntrusted("life admin, from the user's email", `${list}${total ? `\n\nSubscriptions come to about ${total} a month.` : ""}`), isError: false };
          }
          if (this.connectors.owns(name)) return this.connectors.call(name, input);
          return { content: `Unknown tool ${name}.`, isError: true };
        },
        webSearch: this.webSearch,
        userName: this.userName,
        today,
        instructions: d.instructions,
        // what it shows now may itself have come from mail or the web: data, not instructions
        current: d.tainted ? wrapUntrusted(`dashboard #${d.id}`, DB_.describeDashboard(DB_.checkDashboard(JSON.parse(d.body)))) : DB_.describeDashboard(DB_.checkDashboard(JSON.parse(d.body))),
        title: d.tainted ? neutralize(d.title) : d.title,
      });
      if (!r) throw new Error("Couldn't refresh it this time. Try again, or ask Tomo in chat.");
      const after = D.updateDoc(this.db, id, { title: r.title, body: JSON.stringify(r.dashboard), tainted: r.outside, refreshed: true });
      await this.db.flush();
      this.listeners.forEach((l) => l({ type: "doc", docId: id }));
      return after;
    } finally {
      this.refreshing.delete(id);
    }
  },

  /** Save (or update) the doc in Google Docs. The first time, Google asks for access to the docs Lyra creates. */
  async saveDocToGoogle(id: number): Promise<D.Doc> {
    const d = D.getDoc(this.db, id);
    if (!d) throw new Error("That doc is no longer here.");
    if (d.kind === "dashboard") throw new Error("Dashboards stay in Tomo. Only docs go to Google Docs.");
    if (!this.p.google.available) throw new Error("Google sign-in isn't available here.");
    this.docsToken ??= new TokenSource(this.p.google, [DRIVE_FILE]);
    const attempt = async (doc: D.Doc) => {
      try {
        return await D.saveToGoogleDocs(doc, this.docsToken!, this.fetch);
      } catch (e) {
        if ((e as Error).message !== "NEEDS_CONSENT") throw e;
        const r = await this.p.google.authorize([DRIVE_FILE], true);
        if (!grantIsAllowed(r.grantedScopes, DRIVE_FILE)) throw new Error("Google granted more than Tomo asked for, so Tomo didn't keep it.");
        await this.docsToken!.invalidate();
        return D.saveToGoogleDocs(doc, this.docsToken!, this.fetch);
      }
    };
    let r: { id: string; link: string };
    try {
      r = await attempt(d);
    } catch (e) {
      // deleted in Google: make a new one
      if ((e as Error).message !== "GONE") throw e;
      r = await attempt({ ...d, gdoc_id: null });
    }
    this.db.run("UPDATE docs SET gdoc_id = ?, gdoc_link = ? WHERE id = ?", [r.id, r.link, id]);
    await this.db.flush();
    return D.getDoc(this.db, id)!;
  },

  // ---------- people (Phase 10) ----------

  people(): P.Person[] {
    return P.listPeople(this.db);
  },

  person(id: number): P.Person | undefined {
    return P.getPerson(this.db, id);
  },

  async savePerson(id: number | null, patch: Partial<Pick<P.Person, "name" | "aliases" | "emails" | "phones" | "relation" | "notes" | "birthday">>): Promise<P.Person> {
    const p = id === null ? P.rememberPerson(this.db, { name: patch.name ?? "", relation: patch.relation }).person : P.getPerson(this.db, id);
    if (!p) throw new Error("That person is no longer here.");
    const saved = P.updatePerson(this.db, p.id, patch);
    await this.db.flush();
    return saved;
  },

  async deletePerson(id: number): Promise<void> {
    P.deletePerson(this.db, id);
    await this.db.flush();
  },
});
