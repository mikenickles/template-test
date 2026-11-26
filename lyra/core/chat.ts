
import { splitQuote } from "./quote.ts";
import { attachmentParts, attachmentReminder, checkAttachments, type Attachment } from "./attachments.ts";
import { checkTriage, type Triage } from "./triage.ts";
import { addMessage, listMessages, updateMessageMeta, type MemoryNote, type MessageMeta, type StoredMessage, type TaskNote } from "./db.ts";
import { buildSystemPrompt, type ChannelDigest } from "./prompt.ts";
import { wrapUntrusted } from "./untrusted.ts";
import { checkScan, SCAN_TOOL, type Scan } from "./scan.ts";
import { checkWidget, describeWidget, WIDGET_TOOL, type Widget } from "./widgets.ts";
import { uniqueSources, type Msg, type Part, type Source } from "./providers/types.ts";
import { addStep, describeTasks, listTasks } from "./tasks.ts";
import { type TurnEmitter, type TurnInbox, REACTIONS, type TurnContext, who } from "./chat/context.ts";
import { skillTools, lifeAdminTools, useSkill, triageTools, docTools, peopleTools, actionTools, PROPOSALS, memoryTools } from "./chat/tools.ts";
import { plainOptions, ON_DEMAND, moreTools, QUICK_DONE, doneLine, pastTense, stepLine, LOOKUPS, sameSaid } from "./chat/steps.ts";
import { runTool, ANSWER_FIRST } from "./chat/run-tool.ts";

export * from "./chat/context.ts";
export * from "./chat/tools.ts";
export * from "./chat/steps.ts";
export * from "./chat/run-tool.ts";

export const MAX_STEPS = 8;
const HISTORY = 40;

/** Recent chat as model messages: text only, alternating roles, starting with the user. */
/** How a reaction-only reply reads in the history (never shown to the user, and never to be written out). */
const REACTED = (emoji: string) => `[reacted ${emoji} to their message, no words]`;
const REACTED_LINE = /^\[reacted .{1,8} to their message, no words\]$/u;

export function historyFor(messages: StoredMessage[]): Msg[] {
  const out: Msg[] = [];
  let reaction: string | undefined; // on the user's latest message
  for (const m of messages) {
    let text = [m.content.trim(), m.meta.attachments?.length ? attachmentReminder(m.meta.attachments) : ""].filter(Boolean).join("\n\n");
    if (m.role === "user") reaction = m.meta.reaction;
    // Lyra answered with only a reaction: that's still Lyra's turn. Without it, the user's next
    // message would be glued onto the one Lyra reacted to, and both would be answered again.
    else if (!text && !m.meta.error && reaction) text = REACTED(reaction);
    if (m.meta.error || !text) continue;
    const last = out[out.length - 1];
    if (last?.role === m.role) {
      const t = last.parts[0];
      if (t.type === "text") t.text += `\n\n${text}`;
    } else out.push({ role: m.role, parts: [{ type: "text", text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** What the main chat knows about each channel without opening it. */
async function digests(ctx: TurnContext): Promise<ChannelDigest[]> {
  const out: ChannelDigest[] = [];
  for (const c of ctx.workspace.channels()) {
    const recent = listMessages(ctx.db, c.id, 4)
      .filter((m) => !m.meta.error && m.content.trim())
      .map((m) => `${m.role === "user" ? who(ctx) : "Tomo"}: ${clip(m.content.replace(/\s+/g, " "), 160)}`);
    out.push({ name: c.name, about: c.about, notebook: clip((await ctx.workspace.notebook(c.id)).read(), 1200), recent, lastAt: c.last_at });
  }
  return out;
}

/**
 * One turn of a chat (the main one or a channel): save the user's message,
 * let the model answer (calling tools as needed), stream text as it
 * arrives, save the reply.
 */
export async function runTurn(
  ctx: TurnContext,
  userText: string,
  emit: TurnEmitter,
  signal?: AbortSignal,
  attachments: Attachment[] = [],
  inbox?: TurnInbox,
): Promise<StoredMessage> {
  const channelId = ctx.channel?.id ?? null;
  const attached = checkAttachments(attachments);
  const userMessage = addMessage(ctx.db, "user", userText, attached.length ? { attachments: attached } : {}, channelId);
  let reacted = false;
  const upTo = ctx.earlier?.upTo ?? 0;
  const messages = historyFor(listMessages(ctx.db, channelId, HISTORY).filter((m) => m.id > upTo));
  if (attached.length) {
    // this turn the model gets the files themselves, in place of the "attached earlier" note
    const mine = messages[messages.length - 1];
    const first = mine.parts[0];
    const note = attachmentReminder(attached);
    if (first.type === "text") first.text = first.text.endsWith(note) ? first.text.slice(0, -note.length).trimEnd() : first.text;
    mine.parts.push(...attachmentParts(attachments, attached));
  }
  const notes: MemoryNote[] = [];
  const taskNotes: TaskNote[] = [];
  const actionIds: number[] = [];
  const peopleNotes: { id: number; name: string; created: boolean }[] = [];
  const docNotes: NonNullable<MessageMeta["docs"]> = [];
  // The user's own words: this message, plus the two before it when this one is only a short
  // go-ahead ("yes", "do it"). What they asked for is theirs to ask, even in a turn that goes on to
  // read other people's content.
  const ownWords = () => {
    const mine = listMessages(ctx.db, channelId, 12)
      .filter((m) => m.role === "user")
      // (without a quote they were answering: quoted text is Lyra's, or someone else's, never their ask)
      .map((m) => splitQuote(m.content).text.trim());
    return mine.slice(mine[mine.length - 1]?.length >= 20 ? -1 : -3);
  };
  /** Their latest message that says something (not just "yes, go ahead"). */
  const ownAsk = () => [...ownWords()].reverse().find((t) => t.length >= 20)?.slice(0, 400);
  /** Did the user ask for this doc or dashboard to change? By a word of its title, or by its kind ("the dashboard") when it's the only one. */
  const askedToChange = (kind: "doc" | "dashboard", title: string) => {
    const own = ownWords().join("\n").toLowerCase();
    const named = title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .some((w) => w.length >= 4 && !/^(dashboards?|documents?|docs)$/.test(w) && own.includes(w));
    return named || (own.includes(kind) && ctx.workspace.docs!.count(kind) === 1);
  };
  let triage: Triage | undefined;
  let scan: Scan | undefined;
  let widget: Widget | undefined;
  const skillNotes: { id: number; name: string; kind: "used" | "saved" }[] = [];
  const toolsUsed: { name: string; ok: boolean }[] = [];
  // (0.62) what Tomo looked at, in plain words, shown as "How I got this" under the reply
  const steps: string[] = [];
  const addStep = (line: string | null) => {
    if (!line || steps.includes(line) || steps.length >= 12) return;
    steps.push(line);
    emit.step?.(line);
  };
  // Once outside content has been read, notebook changes need the user's tap.
  // asked: did the user's own words ask for this kind of thing? Then it's theirs to ask, even after
  // outside content was read; what they didn't ask for waits for their OK.
  const state: TurnState = { tainted: false, asked: (re) => re.test(ownWords().join("\n")) };
  // What Lyra writes, one piece per step. A reply is put together from the pieces at the end:
  // a short line said before looking something up ("I'll check your mail") is narration and gives
  // way to the answer, and an answer written twice (after a tool was refused) is kept once.
  const said: { text: string; narration: boolean }[] = [];
  let reply = ""; // what the user is seeing as it streams
  const say = (d: string) => {
    if (!d) return;
    if (!said.length) said.push({ text: "", narration: false });
    said[said.length - 1].text += d;
    reply += d;
    emit.text(d);
  };
  /** A line of Lyra's own (an error, "Done."), as its own piece. */
  const own = (text: string) => {
    said.push({ text: "", narration: false });
    if (reply.trim()) {
      reply += "\n\n";
      emit.text("\n\n");
    }
    say(text);
  };
  /** The pieces worth keeping, in order. */
  const kept = (moreComing = false) =>
    said
      .filter((s, i) => {
        if (!s.text.trim()) return false;
        const later = said.slice(i + 1).filter((l) => l.text.trim());
        if (s.narration && s.text.trim().length <= 240 && (moreComing || later.length)) return false;
        return !later.some((l) => sameSaid(s.text, l.text));
      })
      // (the note that stands for an earlier reaction-only reply is for the model's eyes; never echo it)
      .map((s) =>
        s.text
          .split("\n")
          .filter((l) => !REACTED_LINE.test(l.trim()))
          .join("\n")
          .trim(),
      )
      .filter(Boolean)
      .join("\n\n");

  const sources: Source[] = [];
  let suggestions: string[] = [];
  const meta = () => ({
    memory: notes,
    ...(suggestions.length ? { suggestions } : {}),
    ...(taskNotes.length ? { tasks: taskNotes } : {}),
    ...(actionIds.length ? { actions: actionIds } : {}),
    ...(peopleNotes.length ? { people: peopleNotes } : {}),
    ...(docNotes.length ? { docs: docNotes } : {}),
    ...(triage ? { triage } : {}),
    ...(scan ? { scan } : {}),
    ...(widget ? { widget } : {}),
    ...(skillNotes.length ? { skills: skillNotes } : {}),
    ...(sources.length ? { sources: uniqueSources(sources).slice(0, 8) } : {}),
    ...(steps.length ? { steps } : {}),
    tools: toolsUsed,
    provider: ctx.provider.id,
    model: ctx.provider.model,
  });

  try {
    const channels = ctx.workspace.channels();
    const gmailOn = ctx.connectors.status().some((c) => c.id === "gmail" && c.state === "connected");
    const allTools = [...memoryTools(channels, ctx.channel), ...actionTools(ctx.workspace.actions?.allowed(), !!ctx.workspace.music), ...peopleTools(ctx.workspace), ...docTools(ctx.workspace), ...triageTools(gmailOn), SCAN_TOOL, WIDGET_TOOL, ...skillTools(ctx.workspace, true), ...lifeAdminTools(ctx.workspace), ...(await ctx.connectors.tools())];
    // (0.53.1) Tools for rarer jobs (routines, dashboards, docs, scans, triage…) aren't sent in full with
    // every message: they're named in more_tools and loaded for the rest of the reply when needed. The
    // set sent is the same from one message to the next, so it stays in the provider's cache.
    const extras = allTools.filter((t) => ON_DEMAND.has(t.name));
    const tools = allTools.filter((t) => !ON_DEMAND.has(t.name));
    if (extras.length) tools.push(moreTools(extras));
    const system = buildSystemPrompt({
      userName: ctx.userName,
      soul: ctx.soul,
      memory: ctx.workspace.main.read(),
      connectors: ctx.connectors.status(),
      timeZone: ctx.timeZone,
      channel: ctx.channel ? { ...ctx.channel, notebook: (await ctx.workspace.notebook(ctx.channel.id)).read() } : undefined,
      channels: ctx.channel ? channels.map((c) => ({ name: c.name, about: c.about })) : await digests(ctx),
      tasks: describeTasks(listTasks(ctx.db, { status: "open", channelId: ctx.channel ? ctx.channel.id : undefined, limit: 40 }), !ctx.channel),
      reminders: ctx.workspace.reminders?.list(),
      actions: ctx.workspace.actions ? { allowed: ctx.workspace.actions.allowed(), recent: ctx.workspace.actions.recent() } : undefined,
      people: ctx.workspace.people ? { directory: ctx.workspace.people.directory(), contacts: !!ctx.workspace.contacts } : undefined,
      docs: ctx.workspace.docs?.recent(),
      skills: ctx.workspace.skills?.index(),
      talk: ctx.workspace.talk?.(),
      earlier: ctx.earlier?.text,
      preview: ctx.preview,
      setup: ctx.setup,
      lifeAdmin: !!ctx.workspace.lifeAdmin?.connected(),
      model: ctx.provider.id === "fake" ? undefined : ctx.provider.model,
      music: ctx.connectors.status().some((c) => c.id === "spotify" && c.state === "connected")
        ? { playback: !!ctx.workspace.music, playlists: !!ctx.workspace.actions?.allowed().playlist }
        : undefined,
      webSearch: !!ctx.webSearch,
    });

    // Messages sent back to back while Lyra works join the conversation before the next step.
    const who = ctx.userName === "you" ? "The user" : ctx.userName;
    const takeNew = (): boolean => {
      const added = inbox?.take() ?? [];
      if (!added.length) return false;
      const last = messages[messages.length - 1];
      if (last?.role === "user") last.parts.push({ type: "text", text: `${who} added, while you were working:\n${added.join("\n")}` });
      else messages.push({ role: "user", parts: [{ type: "text", text: added.join("\n") }] });
      return true;
    };
    let restarts = 0;
    // a message that arrives during the last step earns a little more room, so it isn't dropped
    let extra = 0;
    let paused = false;
    // (0.53) every call this turn so far was a quick action: its reply needs no second model call
    let allQuick = true;

    for (let step = 0; step < MAX_STEPS + extra; step++) {
      // Stop was tapped between steps (say, while a tool was running)
      if (signal?.aborted) throw new Error("Stopped");
      // (not right after a pause: the model's turn has to be resumed as it stands)
      if (!paused) takeNew();
      paused = false;
      let started = false;
      // A message arriving while Lyra is still thinking (nothing written yet) restarts this
      // step with it included, so it's part of the same thought.
      const stepAbort = new AbortController();
      const passOn = () => stepAbort.abort();
      signal?.addEventListener("abort", passOn);
      let restarted = false;
      inbox?.listen(() => {
        if (!started && restarts < 5) {
          restarted = true;
          stepAbort.abort();
        }
      });
      let result: Awaited<ReturnType<typeof ctx.provider.generate>>;
      try {
        result = await ctx.provider.generate(
          { system, messages, tools, signal: stepAbort.signal, webSearch: !!ctx.webSearch, onStatus: (l) => {
            emit.status(l);
            addStep(pastTense(l));
          } },
          (d) => {
            if (!started) {
              // a new piece: anything before it that was only narration leaves the screen now
              const before = kept(true);
              if (before !== reply.trim()) {
                reply = before;
                emit.reset?.(before);
              }
              said.push({ text: "", narration: false });
              if (reply.trim()) {
                reply += "\n\n";
                emit.text("\n\n");
              }
            }
            started = true;
            say(d);
          },
        );
      } catch (e) {
        if (restarted && !signal?.aborted && !started) {
          restarts++;
          step--;
          continue;
        }
        throw e;
      } finally {
        inbox?.listen(undefined);
        signal?.removeEventListener("abort", passOn);
      }
      messages.push({ role: "assistant", parts: result.parts });
      // Web results are other people's words, just like email.
      if (result.searched) state.tainted = true;
      if (result.sources) sources.push(...result.sources);
      const calls = result.parts.filter((p): p is Extract<Part, { type: "tool_call" }> => p.type === "tool_call");
      // text written in the same step as a lookup came before its results: narration, not the answer
      if (started && calls.some((c) => ctx.connectors.owns(c.name) || LOOKUPS.has(c.name))) said[said.length - 1].narration = true;
      if (!calls.length) {
        if (result.stop === "pause") {
          paused = true; // a long search: let the model carry on
          continue;
        }
        // they sent more while Lyra was answering: carry on and answer that too
        if (takeNew()) {
          if (step === MAX_STEPS + extra - 1 && extra < 2) extra++;
          continue;
        }
        break;
      }

      const results: Part[] = [];
      for (const call of calls) {
        addStep(stepLine(call.name, call.input, ctx));
        if (call.name === "more_tools") {
          const asked = (Array.isArray(call.input.names) ? call.input.names : [call.input.names]).map((n) => String(n ?? "").trim());
          const added = extras.filter((t) => asked.includes(t.name) && !tools.some((x) => x.name === t.name));
          tools.push(...added);
          const have = asked.filter((n) => tools.some((t) => t.name === n));
          const unknown = asked.filter((n) => n && !have.includes(n));
          results.push({
            type: "tool_result",
            id: call.id,
            name: call.name,
            content: have.length ? `Ready: ${have.join(", ")}. Call ${have.length > 1 ? "them" : "it"} now.${unknown.length ? ` Not available: ${unknown.join(", ")}.` : ""}` : `None of those are available. You can load: ${extras.map((t) => t.name).join(", ")}.`,
            isError: !have.length,
          });
          continue;
        }
        if (call.name === "react") {
          const emoji = String(call.input.emoji ?? "");
          const ok = (REACTIONS as readonly string[]).includes(emoji);
          if (ok) {
            reacted = true;
            userMessage.meta = { ...userMessage.meta, reaction: emoji };
            updateMessageMeta(ctx.db, userMessage.id, userMessage.meta);
            emit.reaction?.(emoji);
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({
            type: "tool_result",
            id: call.id,
            name: call.name,
            content: ok ? "Reacted. Add text only if there's more to say." : `Pick one of: ${REACTIONS.join(" ")}`,
            isError: !ok,
          });
          continue;
        }
        if (call.name === "show") {
          // a widget the user acts on with their own taps: fine after outside content, with plain labels
          let content: string;
          let ok = false;
          try {
            if (widget) throw new Error("One widget per reply. Put the rest in your text.");
            widget = checkWidget(call.input, state.tainted);
            content = `${describeWidget(widget)}${kept(true) ? "" : " You have NOT written the reply yet: write it now, starting with the answer."}`;
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "show_scan") {
          // a card the user acts on with their own taps: fine after reading the photo
          let content: string;
          let ok = false;
          try {
            scan = checkScan(call.input);
            content = `Shown as a card with ${scan.items.length} item${scan.items.length === 1 ? "" : "s"} and buttons. Say the gist in a sentence; don't list them again.`;
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "suggest_replies") {
          // A button the user taps becomes their own message. They see exactly what it says before they
          // tap, so after outside content was read it's still offered, but kept short and plain: no
          // address or link for an email or web page to smuggle in.
          const clean = plainOptions(call.input.options, state.tainted);
          const ok = clean.length > 0;
          if (ok) suggestions = clean;
          toolsUsed.push({ name: call.name, ok });
          results.push({
            type: "tool_result",
            id: call.id,
            name: call.name,
            // Seen with a real model: buttons offered before the answer was written, then "Shown under
            // your reply" read as "the reply is sent", and what followed was only an afterthought.
            content: ok
              ? kept(true)
                ? "Shown as buttons under your reply."
                : "Ready: they'll show as buttons under your reply. You have NOT written that reply yet. Write it now, in full, starting with the answer to what they asked."
              : state.tainted ? "Not shown: after reading outside content, options must be short and can't carry an address or link." : "Give one to three short options.",
            isError: !ok,
          });
          continue;
        }
        if (call.name === "life_admin" || call.name === "update_life_admin") {
          let content: string;
          let ok = false;
          try {
            const la = ctx.workspace.lifeAdmin!;
            if (call.name === "life_admin") {
              let scanned = "";
              if (call.input.scan === true) {
                emit.status("Going through your mail");
                scanned = `Went through recent mail (${await la.scan()}).\n\n`;
              }
              const total = la.total();
              // everything on the list came from email: other people's words
              state.tainted = true;
              content = `${scanned}${wrapUntrusted("life admin, from the user's email", `${la.list()}${total ? `\n\nSubscriptions come to about ${total} a month.` : ""}`)}`;
            } else {
              const status = String(call.input.status) as "done" | "dismissed" | "open";
              if (!["done", "dismissed", "open"].includes(status)) throw new Error("status is done, dismissed or open.");
              content = `Marked ${status}: ${la.mark(Number(call.input.id), status, state.tainted ? userText : undefined)}.`;
            }
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "use_skill" || call.name === "save_skill") {
          let content: string;
          let ok = false;
          try {
            const sk = ctx.workspace.skills!;
            if (call.name === "use_skill") {
              const r = useSkill(ctx.workspace, String(call.input.name ?? ""));
              const s = r.skill;
              if (!s) throw new Error(r.content);
              if (!skillNotes.some((n) => n.id === s.id)) skillNotes.push({ id: s.id, name: s.name, kind: "used" });
              emit.status(`Using ${s.name}`);
              content = r.content;
            } else {
              // like tasks and memory: outside content can't teach Lyra a skill
              if (state.tainted) throw new Error(`Not saved: outside content was read this turn. Save it once the user says yes.${ANSWER_FIRST}`);
              const r = sk.save(call.input);
              skillNotes.push({ id: r.id, name: r.name, kind: "saved" });
              emit.status(r.created ? `Learned ${r.name}` : `Updated ${r.name}`);
              content = `${r.created ? "Saved" : "Updated"} the skill "${r.name}". Tell the user in a sentence; they can see and edit it in Memory, Skills.`;
            }
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "show_triage") {
          // only a display of what was read: allowed after reading mail (that's the point)
          let content: string;
          let ok = false;
          try {
            triage = checkTriage(call.input);
            ok = true;
            emit.status("Sorted your inbox");
            content = `Shown as a card: ${triage.needs.length} need the user, ${triage.later.length} can wait, ${triage.fyi.length} newsletters. Now say the gist in a sentence or two; don't list them again.`;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "make_dashboard" || call.name === "update_dashboard") {
          let content: string;
          let ok = false;
          try {
            const docs = ctx.workspace.docs!;
            const id = call.name === "update_dashboard" ? Number(call.input.id) : undefined;
            // after reading mail or the web, a dashboard the user already had is only replaced when they asked for that
            // themselves (one made just now, or already built from outside content, can always be)
            if (id !== undefined && state.tainted && !docNotes.some((n) => n.id === id && n.created)) {
              const had = docs.read(id);
              if (!had.tainted && !askedToChange("dashboard", had.title))
                throw new Error("Not replaced: outside content was read this turn, and the user didn't ask to change this dashboard. Make a new one instead, or ask them first.");
            }
            const r = docs.dashboard({ id, title: call.input.title, dashboard: call.input, refresh: call.input.refresh, ask: ownAsk() }, ctx.channel?.id ?? null, state.tainted);
            const i = docNotes.findIndex((n) => n.id === r.id);
            if (i === -1) docNotes.push({ id: r.id, title: r.title, created: r.created, kind: "dashboard" });
            else docNotes[i] = { ...docNotes[i], title: r.title };
            emit.status(r.created ? `Made ${r.title}` : `Updated ${r.title}`);
            content = `${r.created ? "Made" : "Updated"} dashboard #${r.id}: ${r.title}. It shows as a card under your reply; say what it shows in a sentence.`;
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "write_doc" || call.name === "update_doc" || call.name === "read_doc") {
          let content: string;
          let ok = false;
          try {
            const docs = ctx.workspace.docs!;
            if (call.name === "read_doc") {
              const r = docs.read(Number(call.input.id));
              // a doc written from mail or the web holds other people's words
              if (r.tainted) state.tainted = true;
              content = r.text;
            } else {
              // after reading mail or the web, Lyra can add to a doc but not replace one the user already had
              if (call.name === "update_doc" && state.tainted && call.input.body !== undefined) {
                const id = Number(call.input.id);
                const had = docs.read(id);
                const mine = docNotes.some((n) => n.id === id && n.created) || had.tainted || askedToChange("doc", had.title);
                if (!mine) throw new Error("Not replaced: outside content was read this turn, and the user didn't ask to change this doc. You can append to it, or ask them before replacing its text.");
              }
              const r =
                call.name === "write_doc"
                  ? docs.write({ title: call.input.title, body: call.input.body }, ctx.channel?.id ?? null, state.tainted)
                  : docs.update(Number(call.input.id), { title: call.input.title, body: call.input.body, append: call.input.append }, state.tainted);
              const i = docNotes.findIndex((n) => n.id === r.id);
              if (i === -1) docNotes.push({ ...r, created: call.name === "write_doc" });
              else docNotes[i] = { ...docNotes[i], title: r.title };
              emit.status(call.name === "write_doc" ? `Wrote ${r.title}` : `Updated ${r.title}`);
              content = `${call.name === "write_doc" ? "Saved" : "Updated"} doc #${r.id}: ${r.title}. It shows as a card under your reply, so just say what it is in a sentence; don't paste it.`;
            }
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "remember_person" || call.name === "look_up_person" || call.name === "find_contact") {
          let content: string;
          let ok = false;
          try {
            const ws = ctx.workspace;
            if (call.name === "remember_person") {
              // like the notebook: after reading outside content, a card only changes with the user's word
              if (state.tainted) throw new Error(`Not saved: outside content was read this turn. Save it once the user says yes.${ANSWER_FIRST}`);
              const r = ws.people!.remember(call.input);
              const i = peopleNotes.findIndex((n) => n.id === r.id);
              if (i === -1) peopleNotes.push(r);
              else peopleNotes[i] = { ...r, created: peopleNotes[i].created || r.created };
              emit.status(r.created ? `Added ${r.name}` : `Noted about ${r.name}`);
              content = r.created ? `Added a card for ${r.name}.` : `Updated ${r.name}'s card.`;
            } else if (call.name === "look_up_person") {
              content = ws.people!.lookUp(String(call.input.name ?? "")) ?? "No card for that name. Ask the user who they mean, or look in their contacts if you can.";
            } else {
              if (!ws.contacts) throw new Error("Contacts aren't turned on.");
              content = await ws.contacts.find(String(call.input.name ?? ""));
            }
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "set_job_model") {
          let content: string;
          let ok = false;
          try {
            if (!ctx.workspace.models) throw new Error("Models can't be changed here.");
            // a setting change: only on the user's own word, never because something read this turn asked for it
            if (state.tainted && !/\b(model|luna|terra|sol|haiku|sonnet|opus|flash|pro|gemini|claude|gpt)\b/i.test([ownWords()].flat().join(" "))) throw new Error(`Not changed: outside content was read this turn. ${ANSWER_FIRST}`);
            content = await ctx.workspace.models.set(String(call.input.job ?? ""), String(call.input.model ?? ""));
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (call.name === "control_music") {
          let content: string;
          let ok = false;
          try {
            if (!ctx.workspace.music) throw new Error("Playback control isn't turned on.");
            // playing music is harmless and easy to undo, so it's allowed after a search too
            content = await ctx.workspace.music.control(String(call.input.action ?? ""), call.input.uri ? String(call.input.uri) : undefined);
            ok = true;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        if (PROPOSALS[call.name]) {
          // Only a proposal: the card shows exactly what happens, and nothing does until the user taps.
          // Allowed after reading mail (replying needs that), but the card warns the user to check it.
          let content: string;
          let ok = false;
          try {
            if (actionIds.length >= 3) throw new Error("That's three for one reply. Let the user deal with these first.");
            const a = ctx.workspace.actions;
            if (!a) throw new Error("Not available.");
            const { kind, label } = PROPOSALS[call.name];
            const r = await a.propose(kind, call.input, state.tainted, ctx.channel?.id ?? null);
            actionIds.push(r.id);
            ok = true;
            emit.status(`${label} ready for your OK`);
            content = `Ready for the user's OK as a card under your reply (#${r.id}: ${r.summary}). It is NOT sent or added yet: say it's ready for them to check, never that it's done.`;
          } catch (e) {
            content = (e as Error).message;
          }
          toolsUsed.push({ name: call.name, ok });
          results.push({ type: "tool_result", id: call.id, name: call.name, content, isError: !ok });
          continue;
        }
        const r = await runTool(ctx, call.name, call.input, state, notes, emit, taskNotes);
        if (ctx.connectors.owns(call.name) && !r.isError) state.tainted = true;
        toolsUsed.push({ name: call.name, ok: !r.isError });
        results.push({ type: "tool_result", id: call.id, name: call.name, content: r.content, isError: r.isError });
      }
      messages.push({ role: "user", parts: results });
      // Wrote the reply and reacted or offered buttons in one go: that's the whole answer, no need to
      // ask the model again (it would only add a line about the buttons).
      if (started && calls.every((c) => c.name === "react" || c.name === "suggest_replies" || (c.name === "show" && widget)) && !takeNew()) break;
      // (0.53) A quick action that worked (a reminder set, a task added, a note kept, a card made)
      // in a turn that did nothing else: the reply is what was written alongside it, or a line written
      // here from what was set. Asking the model again would only say "Done" for a whole request.
      allQuick &&= calls.every((c) => QUICK_DONE.has(c.name) || c.name in PROPOSALS || c.name === "react" || c.name === "suggest_replies" || (c.name === "show" && !!widget));
      if (
        allQuick &&
        !state.tainted &&
        calls.some((c) => QUICK_DONE.has(c.name) || c.name in PROPOSALS) &&
        results.every((r) => r.type !== "tool_result" || !r.isError) &&
        !takeNew()
      ) {
        if (!started) {
          const line = doneLine(calls, results, ctx.timeZone);
          if (line) own(line);
        }
        break;
      }
      if (step === MAX_STEPS + extra - 1 && extra < 2 && takeNew()) extra++;
      else if (step === MAX_STEPS + extra - 1) own(`I stopped there so this doesn't run on. Want me to keep going?`);
    }
    inbox?.close();
    // A reaction alone is a complete reply, like a tapback on a text.
    if (!kept() && !(reacted && !notes.length && !taskNotes.length)) own(notes.length ? "Got it." : "Done.");
    return addMessage(ctx.db, "assistant", kept(), meta(), channelId);
  } catch (e) {
    inbox?.close();
    const aborted = signal?.aborted;
    const why = aborted ? "Stopped." : `I couldn't finish that. ${friendlyError(e)}`;
    if (!aborted) console.error("[lyra] turn failed:", e);
    own(why);
    return addMessage(ctx.db, "assistant", kept(), { ...meta(), error: true }, channelId);
  }
}

export interface TurnState {
  /** outside content (mail, calendar, files, the web) has been read this turn */
  tainted: boolean;
  /** the user's own message asks for this (see ownWords in runTurn) */
  asked(re: RegExp): boolean;
}

function friendlyError(e: unknown): string {
  const err = e as { status?: number; message?: string };
  if (err.status === 401 || err.status === 403) return "The API key was refused. Check it in Settings.";
  if (err.status === 404) return "That model name wasn't found. Pick another in Settings.";
  if (err.status === 429) return "The model is rate limited right now. Try again in a minute.";
  if (err.status && err.status >= 500) return "The model service is having trouble. Try again shortly.";
  return err.message ? err.message.slice(0, 200) : "Something went wrong.";
}
