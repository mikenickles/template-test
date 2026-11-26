/** Memory, channels and their notebooks, and the soul. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { CHANNEL_ICONS } from "../chat.ts";
import * as S from "../skills.ts";
import { findChannel, getChannel, listChannels, type Channel, type ChannelSummary } from "../db.ts";
import { channelNotebookSpec, cleanItem, Notebook } from "../memory.ts";
import { DEFAULT_SOUL } from "../soul.ts";
import * as T from "../tasks.ts";
import { type MemoryView, type ChannelView, type ChannelInput } from "./shared.ts";
import { part } from "./part.ts";

export const memory = part({
  // ---------- memory ----------

  view(book: Notebook): MemoryView {
    return { content: book.read(), sections: book.view(), history: book.history() };
  },

  memoryView(): MemoryView {
    return this.view(this.memory);
  },

  async saveMemory(content: string): Promise<MemoryView> {
    if (content.length > 200_000) throw new Error("That memory file is too big.");
    await this.memory.replace(content);
    return this.memoryView();
  },

  /**
   * One line of memory, from the Memory page: change it (old → next), forget it (next null), or
   * add one (old null). The page shows what changed, and Recent changes can undo it.
   */
  async editMemoryNote(section: string, old: string | null, next: string | null): Promise<MemoryView> {
    const text = next?.replace(/\s+/g, " ").trim() ?? "";
    if (old === null && !text) throw new Error("Write the note first.");
    if (text.length > 300) throw new Error("Keep a note to a sentence or two.");
    if (old !== null && old.trim() !== text) {
      const r = await this.memory.forget(section, old);
      if ("error" in r) throw new Error(r.error);
    }
    if (text && old?.trim() !== text) await this.memory.remember(section, text);
    return this.memoryView();
  },

  async restoreMemory(id: number): Promise<MemoryView> {
    await this.memory.restore(id);
    return this.memoryView();
  },

  async bookFor(scope: string | undefined): Promise<Notebook> {
    if (!scope || scope === "main") return this.memory;
    const id = Number(scope.replace(/^channel:/, ""));
    if (!getChannel(this.db, id)) throw new Error("That channel no longer exists.");
    return this.notebook(id);
  },

  // ---------- channels ----------

  channels(): ChannelSummary[] {
    return listChannels(this.db);
  },

  notebook(id: number): Promise<Notebook> {
    let p = this.notebooks.get(id);
    if (!p) {
      const c = getChannel(this.db, id);
      if (!c) return Promise.reject(new Error("That channel no longer exists."));
      p = Notebook.open(this.db, this.p.texts, channelNotebookSpec(c.id, c.name, c.about));
      p.catch(() => this.notebooks.delete(id));
      this.notebooks.set(id, p);
    }
    return p;
  },

  clean(input: ChannelInput, current?: Channel): { name: string; about: string; icon: string } {
    const name = cleanItem(input.name ?? current?.name ?? "").slice(0, 32);
    if (!name) throw new Error("Give the channel a name.");
    if (name.toLowerCase() === "main" || name.toLowerCase() === "everything") throw new Error(`"${name}" is taken by the main chat.`);
    const clash = findChannel(this.db, name);
    if (clash && clash.id !== current?.id) throw new Error(`There's already a ${clash.name} channel.`);
    const about = cleanItem(input.about ?? current?.about ?? "").slice(0, 280);
    const icon = (CHANNEL_ICONS as readonly string[]).includes(input.icon ?? "") ? input.icon! : (current?.icon ?? "star");
    return { name, about, icon };
  },

  async createChannel(input: ChannelInput): Promise<Channel> {
    const c = this.clean(input);
    const row = this.db.run<Channel>("INSERT INTO channels (name, about, icon) VALUES (?, ?, ?) RETURNING *", [c.name, c.about, c.icon])!;
    await this.notebook(row.id);
    await this.db.flush();
    return row;
  },

  async updateChannel(id: number, input: Partial<ChannelInput>): Promise<Channel> {
    const current = getChannel(this.db, id);
    if (!current) throw new Error("That channel no longer exists.");
    const c = this.clean({ name: input.name ?? current.name, about: input.about, icon: input.icon }, current);
    const row = this.db.run<Channel>("UPDATE channels SET name = ?, about = ?, icon = ? WHERE id = ? RETURNING *", [c.name, c.about, c.icon, id])!;
    await this.db.flush();
    return row;
  },

  /** Deletes the channel, its chat and its notebook. Main memory is untouched. */
  async deleteChannel(id: number): Promise<void> {
    if (!getChannel(this.db, id)) return;
    const book = await this.notebook(id);
    await book.destroy();
    this.notebooks.delete(id);
    this.db.run("DELETE FROM messages WHERE channel_id = ?", [id]);
    this.db.run("DELETE FROM channels WHERE id = ?", [id]);
    await this.db.flush();
  },

  async channelView(id: number): Promise<ChannelView> {
    const channel = getChannel(this.db, id);
    if (!channel) throw new Error("That channel no longer exists.");
    return { channel, notebook: this.view(await this.notebook(id)) };
  },

  async saveChannelNotebook(id: number, content: string): Promise<ChannelView> {
    if (content.length > 200_000) throw new Error("That notebook is too big.");
    await (await this.notebook(id)).replace(content);
    return this.channelView(id);
  },

  async restoreChannelNotebook(id: number, snapshotId: number): Promise<ChannelView> {
    await (await this.notebook(id)).restore(snapshotId);
    return this.channelView(id);
  },

  // ---------- soul ----------

  /** Who Lyra is: the built-in soul, or the user's edited one. */
  soul(): { content: string; custom: boolean } {
    return { content: this.customSoul ?? DEFAULT_SOUL, custom: !!this.customSoul };
  },

  async saveSoul(content: string): Promise<{ content: string; custom: boolean }> {
    const text = content.trim();
    if (!text) throw new Error("The soul can't be empty. Use Reset to go back to the original.");
    if (text.length > 20_000) throw new Error("That's too long. Keep the soul under 20,000 characters.");
    this.customSoul = text === DEFAULT_SOUL.trim() ? undefined : text;
    if (this.customSoul) await this.p.texts.write("soul.md", `${text}\n`);
    else await this.clearSoulFile();
    return this.soul();
  },

  async resetSoul(): Promise<{ content: string; custom: boolean }> {
    this.customSoul = undefined;
    await this.clearSoulFile();
    return this.soul();
  },

  async clearSoulFile(): Promise<void> {
    if (this.p.texts.remove) await this.p.texts.remove("soul.md");
    else await this.p.texts.write("soul.md", "");
  },
});
