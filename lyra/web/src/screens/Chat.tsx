import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, onChange, sendChat, type Channel, type MemoryNote, type Message, type TaskNote } from "../api";
import { ArrowDown, ArrowUp, ArrowUpRight, ChannelIcon, Chart, Chevron, Close, File as FileIcon, Minus, Wave, More, Pin, Plus, Spark, Stop, TasksIcon } from "../icons";
import { noteOf, onIncoming, prepare, prepareShared, strip, takeIncoming, type Draft } from "../attach";
import { MAX_ATTACHMENTS } from "../../../core/attachments";
import { copyText, isNative, liveVoice } from "../platform";
import { VoiceOverlay } from "../VoiceOverlay";
import { ActionCards } from "../ActionCard";
import { TriageCard } from "../TriageCard";
import { TodayView } from "../Today";
import { markSeen } from "../seen";
import { Star } from "../icons";
import { setChatStatus } from "../StatusLine";
import { STATUS_LABEL } from "./Tasks";
import { StarChart, Thinking } from "../LyraMark";
import { headline, Markdown } from "../markdown";
import { clock, dayLabel, parse } from "../when";

interface Pending {
  reply: string;
  status: string;
  notes: MemoryNote[];
}

const STARTERS = ["What's new in my inbox?", "What do you know about me so far?", "Remember that I prefer short replies"];
const CHANNEL_STARTERS = ["What's still open here?", "Sum up where this stands", "What have we decided so far?"];

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

interface ChatProps {
  /** an OpenAI key is saved (live voice needs one) */
  hasOpenAI: boolean;
  userName: string;
  toast: (msg: string) => void;
  channel: Channel | null;
  onTasksChanged?: () => void;
  /** a message to scroll to and highlight (from search or the Today view) */
  focus?: number;
}

/** Coming back to the main chat after this long opens the Today view. */
const TODAY_AFTER = 30 * 60_000;

/** Skip re-rendering the whole conversation unless something it shows changed (e.g. while the menu slides). */
export const Chat = memo(ChatView, (a, b) => {
  const same = (x: Channel | null, y: Channel | null) =>
    x === y || (!!x && !!y && x.id === y.id && x.name === y.name && x.icon === y.icon && x.about === y.about);
  return a.focus === b.focus && a.hasOpenAI === b.hasOpenAI && a.userName === b.userName && a.toast === b.toast && a.onTasksChanged === b.onTasksChanged && same(a.channel, b.channel);
});

function ChatView({ userName, toast, channel, onTasksChanged, hasOpenAI, focus }: ChatProps) {
  const channelId = channel?.id ?? null;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  // The composer floats over the chat: keep the log's bottom padding (and fade) matched to its height.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const set = () => chatRef.current?.style.setProperty("--composer-h", `${el.offsetHeight}px`);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  // ---- the Today view (main chat only) ----
  const [showToday, setShowToday] = useState(false);
  const todayDecided = useRef(false);
  useEffect(() => {
    if (channel || todayDecided.current || !messages) return;
    todayDecided.current = true;
    const last = messages.at(-1);
    if (last && !focus && Date.now() - parse(last.created_at).getTime() > TODAY_AFTER) setShowToday(true);
  }, [messages, channel, focus]);
  useEffect(() => {
    if (channel) return;
    const toggle = () => setShowToday((v) => !v);
    addEventListener("lyra:today", toggle);
    return () => removeEventListener("lyra:today", toggle);
  }, []);

  // a button tapped on a notification: send that step here, once (and only if it was just now)
  const sendRef = useRef<(t: string) => Promise<void>>(async () => {});
  useEffect(() => {
    const take = () => {
      try {
        const o = JSON.parse(sessionStorage.getItem("lyra.say") || "null") as { hash: string; say: string; at: number } | null;
        const here = channelId === null ? "#/" : `#/c/${channelId}`;
        if (!o || o.hash.split("?")[0] !== here || Date.now() - o.at > 60_000) return;
        sessionStorage.removeItem("lyra.say");
        setShowToday(false);
        void sendRef.current(o.say);
      } catch {
        sessionStorage.removeItem("lyra.say");
      }
    };
    // after the chat's messages have loaded
    const t = setTimeout(take, 600);
    addEventListener("lyra:say", take);
    return () => {
      clearTimeout(t);
      removeEventListener("lyra:say", take);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);
  useEffect(() => {
  }, [channel]);
  useEffect(() => {
    if (showToday) logRef.current?.scrollTo({ top: 0 });
    else {
      stick.current = true;
      requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
    }
  }, [showToday]);

  // what's on screen counts as seen (for the "new" marks in the menu)
  useEffect(() => {
    const last = messages?.at(-1);
    if (last && last.id > 0 && document.visibilityState === "visible") markSeen(channelId, last.id);
  }, [messages, channelId]);

  useEffect(() => {
    api
      .messages(channelId)
      .then((r) => {
        setMessages(r.messages);
        setHasMore(r.messages.length >= 60);
      })
      .catch(() => {
        setMessages([]);
        toast("Couldn't load the chat. Is Lyra running?");
      });
  }, [toast, channelId]);

  // A worker finished or asked something in this chat: show it.
  const pendingRef = useRef(false);
  pendingRef.current = !!pending;
  // something was posted here while a reply was streaming: picked up when the reply is done
  const missed = useRef(false);
  // Lyra was already mid-reply when this screen opened (you left the chat and came back)
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    void api.replyingIn().then((c) => c === channelId && setResumed(true), () => {});
  }, [channelId]);
  const reload = useCallback(
    () =>
      api.messages(channelId).then((r) => {
        setResumed(false);
        // keep any earlier pages already loaded above the newest ones
        setMessages((prev) => {
          const first = r.messages[0]?.id ?? 0;
          return [...(prev ?? []).filter((x) => x.id > 0 && x.id < first), ...r.messages];
        });
      }),
    [channelId],
  );
  useEffect(
    () =>
      onChange((e) => {
        if (e.type !== "message" || e.channelId !== channelId) return;
        if (pendingRef.current) missed.current = true;
        else void reload();
      }),
    [channelId, reload],
  );

  // Lets the orb in the top bar pulse while Lyra is working.
  useEffect(() => {
    if (pending) document.body.dataset.busy = "1";
    else delete document.body.dataset.busy;
    return () => {
      delete document.body.dataset.busy;
    };
  }, [pending]);

  const toBottom = useCallback((smooth = false) => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    // the welcome screen reads from the top; a conversation sticks to the latest message
    if (stick.current && (messages?.length || pending)) toBottom();
  }, [messages, pending, toBottom]);

  // Only your own scrolling (finger, wheel, keys) lets go of the latest message. Scrolls
  // caused by the layout (the keyboard, the tab bar, the message box shrinking after
  // sending) don't count: those keep following the conversation.
  const touchedAt = useRef(0);
  const touched = () => (touchedAt.current = Date.now());
  const onScroll = () => {
    const el = logRef.current!;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const mine = Date.now() - touchedAt.current < 1200;
    if (near || mine) stick.current = near;
    else if (stick.current) toBottom();
    setAtBottom(near || stick.current);
  };

  // follow the latest message whenever the chat's size changes: the reply growing as it
  // streams in, the keyboard opening or closing, the message box growing or shrinking
  useEffect(() => {
    const log = logRef.current;
    const inner = log?.firstElementChild;
    if (!log) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => stick.current && toBottom());
    };
    const watch = new ResizeObserver(follow);
    watch.observe(log);
    if (inner) watch.observe(inner);
    if (composerRef.current) watch.observe(composerRef.current);
    addEventListener("resize", follow);
    window.visualViewport?.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      removeEventListener("resize", follow);
      window.visualViewport?.removeEventListener("resize", follow);
    };
  }, [toBottom, messages === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const grow = () => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const loadEarlier = async () => {
    if (!messages?.length) return;
    const el = logRef.current!;
    const before = el.scrollHeight;
    const r = await api.messages(channelId, messages[0].id);
    setHasMore(r.messages.length >= 60);
    stick.current = false;
    setMessages((m) => [...r.messages, ...(m ?? [])]);
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - before));
  };

  // jump to one message (from search or the Today view), loading earlier pages if needed
  const focusTries = useRef(0);
  useEffect(() => {
    focusTries.current = 0;
  }, [focus]);
  const focused = useRef<number | null>(null);
  useEffect(() => {
    // jump once per message: later changes to the chat (a new message, a reaction) mustn't yank the view back
    if (!focus || !messages || focused.current === focus) return;
    const el = logRef.current?.querySelector<HTMLElement>(`[data-mid="${focus}"]`);
    if (el) {
      focused.current = focus;
      stick.current = false;
      setShowToday(false);
      requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
      return;
    }
    if (hasMore && focusTries.current++ < 10) void loadEarlier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, messages, hasMore]);

  // ---- photos and files waiting to be sent with the next message ----
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const filePick = useRef<HTMLInputElement>(null);
  const photoPick = useRef<HTMLInputElement>(null);
  const cameraPick = useRef<HTMLInputElement>(null);

  const addDrafts = useCallback(
    async (make: (() => Promise<Draft>)[]) => {
      for (const m of make) {
        try {
          const d = await m();
          let full = false;
          setDrafts((cur) => {
            full = cur.length >= MAX_ATTACHMENTS;
            return full ? cur : [...cur, d];
          });
          if (full) {
            toast(`Attach up to ${MAX_ATTACHMENTS} things at a time.`);
            break;
          }
        } catch (e) {
          toast((e as Error).message);
        }
      }
    },
    [toast],
  );
  const addFiles = useCallback((files: Iterable<File>) => addDrafts([...files].map((f) => () => prepare(f, f.name || "pasted.png"))), [addDrafts]);

  // shared to Lyra from another app: it lands in the message box, ready to send or edit
  useEffect(() => {
    const collect = () => {
      const inc = takeIncoming();
      if (!inc) return;
      if (inc.text) {
        setInput((cur) => (cur.trim() ? `${cur.trim()}\n${inc.text}` : inc.text!));
        requestAnimationFrame(() => {
          const el = boxRef.current;
          if (el) {
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }
        });
      }
      void addDrafts(inc.files.map((f) => () => prepareShared(f)));
      if (inc.skipped) toast(`${inc.skipped} shared ${inc.skipped === 1 ? "item" : "items"} couldn't be attached (too big, or more than ${MAX_ATTACHMENTS}).`);
    };
    collect();
    return onIncoming(collect);
  }, [addDrafts, toast]);

  // live voice: a spoken conversation with Lyra (GPT-Live)
  const [talking, setTalking] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  useEffect(() => {
    void liveVoice.available().then(setCanTalk, () => {});
  }, []);
  const talk = async () => {
    if (!hasOpenAI) return toast("Live voice uses OpenAI's GPT-Live. Add an OpenAI API key in Settings, AI model.");
    setTalking(true);
  };
  const endTalk = useCallback(() => {
    setTalking(false);
    // what was said is in the chat now
    void api.messages(channelId).then((r) => setMessages(r.messages), () => {});
    stick.current = true;
  }, [channelId]);

  const send = async (raw: string) => {
    const text = raw.trim();
    const files = drafts;
    if (!text && !files.length) return;
    // A reply's being written: this joins it, like texting back to back.
    if (pending) {
      if (files.length) return toast("Photos and files go once Lyra has finished this reply.");
      if (!text) return;
      setShowToday(false);
      setInput("");
      requestAnimationFrame(grow);
      stick.current = true;
      const extra: Message = { id: -Date.now(), role: "user", content: text, created_at: new Date().toISOString(), meta: {}, channel_id: channelId };
      setMessages((m) => [...(m ?? []), extra]);
      try {
        await sendChat(
          text,
          {
            text: () => {},
            status: () => {},
            memory: () => {},
            done: (msg, user) =>
              setMessages((m) => {
                const list = (m ?? []).map((x) => (x.id === extra.id && user ? user : x));
                return list.some((x) => x.id === msg.id) ? list : [...list, msg];
              }),
          },
          channelId,
        );
      } catch (e) {
        setMessages((m) => (m ?? []).filter((x) => x.id !== extra.id));
        setInput(text);
        toast((e as Error).message);
      }
      return;
    }
    setShowToday(false);
    setInput("");
    setDrafts([]);
    requestAnimationFrame(grow);
    stick.current = true;
    const temp: Message = {
      id: -Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      meta: files.length ? { attachments: files.map(noteOf) } : {},
      channel_id: channelId,
    };
    setMessages((m) => [...(m ?? []), temp]);
    setPending({ reply: "", status: "", notes: [] });
    try {
      await sendChat(text, {
        text: (d) => setPending((p) => p && { ...p, reply: p.reply + d, status: "" }),
        reset: (t) => setPending((p) => p && { ...p, reply: t }),
        status: (label) => setPending((p) => p && { ...p, status: label }),
        memory: (note) => setPending((p) => p && { ...p, notes: [...p.notes, note] }),
        reaction: (emoji) => setMessages((m) => (m ?? []).map((x) => (x.id === temp.id ? { ...x, meta: { ...x.meta, reaction: emoji } } : x))),
        done: (msg, user) => {
          setMessages((m) => {
            const list = (m ?? []).map((x) => (x.id === temp.id && user ? user : x));
            return list.some((x) => x.id === msg.id) ? list : [...list, msg];
          });
          if (msg.meta.tasks?.length) onTasksChanged?.();
        },
      }, channelId, files.map(strip));
    } catch (e) {
      setMessages((m) => (m ?? []).filter((x) => x.id !== temp.id));
      setInput(text);
      setDrafts(files);
      toast((e as Error).message);
    } finally {
      setPending(null);
      if (missed.current) {
        missed.current = false;
        void reload();
      }
    }
  };
  sendRef.current = send;

  // what Lyra is doing, for the status under its avatar
  useEffect(() => {
    setChatStatus(pending ? pending.status || (pending.reply ? "Writing" : "Thinking") : null);
  }, [pending]);
  useEffect(() => () => setChatStatus(null), []);

  // long-press a message: copy, pin or delete it
  const [acting, setActing] = useState<Message | null>(null);
  const press = useRef<{ t: number; x: number; y: number } | null>(null);
  const holdProps = (m: Message) =>
    m.id < 0
      ? {}
      : {
          onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            setActing(m);
          },
          onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === "mouse") return;
            const t = window.setTimeout(() => {
              press.current = null;
              navigator.vibrate?.(12);
              setActing(m);
            }, 450);
            press.current = { t, x: e.clientX, y: e.clientY };
          },
          onPointerMove: (e: React.PointerEvent) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
              clearTimeout(p.t);
              press.current = null;
            }
          },
          onPointerUp: () => {
            if (press.current) clearTimeout(press.current.t);
            press.current = null;
          },
          onPointerCancel: () => {
            if (press.current) clearTimeout(press.current.t);
            press.current = null;
          },
        };

  const act = async (m: Message, what: "copy" | "pin" | "delete") => {
    setActing(null);
    try {
      if (what === "copy") {
        await copyText(m.content);
        toast("Copied");
      } else if (what === "pin") {
        const next = await api.pinMessage(m.id, !m.meta.pinned);
        setMessages((list) => (list ?? []).map((x) => (x.id === m.id ? next : x)));
        toast(next.meta.pinned ? "Pinned. Find it on the chat's info page." : "Unpinned");
      } else {
        await api.deleteMessage(m.id);
        setMessages((list) => (list ?? []).filter((x) => x.id !== m.id));
        toast("Deleted");
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const answerNote = async (msg: Message, index: number, action: "undo" | "accept" | "dismiss") => {
    try {
      const { message } = await api.note(msg.id, index, action);
      setMessages((m) => (m ?? []).map((x) => (x.id === message.id ? message : x)));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (!messages) return <div className="center-load">Loading…</div>;

  const empty = messages.length === 0 && !pending;
  // suggestions only show under Lyra's latest reply, while it's the last thing said
  const lastId = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.id : -1;
  let lastDay = "";

  return (
    <div className={`chat${channel ? " in-channel" : ""}`} ref={chatRef}>
      <div
        className="log"
        ref={logRef}
        onScroll={onScroll}
        onTouchStart={touched}
        onTouchMove={touched}
        onWheel={touched}
        onPointerDown={touched}
        onKeyDown={touched}
        aria-live="polite"
      >
        <div className="log-inner">
          {showToday && !channel && !empty && <TodayView onSend={(t) => void send(t)} onShowChat={() => setShowToday(false)} hasChat={messages.length > 0} />}

          {hasMore && !showToday && (
            <button className="chip small" onClick={loadEarlier}>
              Show earlier messages
            </button>
          )}

          {empty && channel && (
            <div className="hello">
              <span className="channel-badge">
                <ChannelIcon name={channel.icon} size={30} />
              </span>
              <p className="eyebrow">Channel</p>
              <h1>{channel.name}</h1>
              <p>{channel.about || "A chat for one ongoing subject, with its own notebook."}</p>
              <div className="chips">
                {CHANNEL_STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {empty && !channel && (
            <div className="hello">
              <StarChart />
              <p className="eyebrow">{greeting()}</p>
              <h1>{userName !== "you" ? `Hi ${userName}, I'm Lyra.` : "Hi, I'm Lyra."}</h1>
              <p>Text me like you would a trusted assistant. I'll keep it short and remember what matters.</p>
              <div className="chips">
                {STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!showToday && messages.map((m, i) => {
            // a reaction on its own is shown on your message; its empty reply takes no room
            if (m.role === "assistant" && !m.content.trim() && !m.meta.error && !m.meta.memory?.length && !m.meta.tasks?.length) return null;
            const d = parse(m.created_at);
            const day = dayLabel(d);
            const showDay = day !== lastDay;
            lastDay = day;
            // your messages sent back to back (within 5 minutes) read as one group, with one time under the last
            const near = (a?: Message, b?: Message) => !!a && !!b && a.role === "user" && b.role === "user" && Math.abs(parse(b.created_at).getTime() - parse(a.created_at).getTime()) < 5 * 60_000;
            const cont = !showDay && near(messages[i - 1], m);
            const lastOfGroup = m.role === "user" && !near(m, messages[i + 1]);
            return (
              <Fragment key={m.id}>
                {showDay && (
                  <div className="day">
                    <Star size={10} />
                    {day}
                  </div>
                )}
                <div className={`row ${m.role === "user" ? "user" : "lyra"}${cont ? " cont" : ""}${m.id === focus ? " focused" : ""}`} data-mid={m.id}>
                  {m.id > 0 && (m.content.trim() || m.role === "user") && (
                    <button className="msg-more" aria-label="Message actions" title="Copy, pin or delete" onClick={() => setActing(m)}>
                      <More size={18} />
                    </button>
                  )}
                  {m.meta.routine && (
                    <a className="routine-tag" href={`#/r/${m.meta.routine.id}`}>
                      {m.meta.routine.name}
                    </a>
                  )}
                  {m.meta.headsUp && <span className="routine-tag">Heads-up</span>}
                  {m.meta.checkIn && <span className="routine-tag">Check-in</span>}
                  {m.meta.reminder && <span className="routine-tag">{m.meta.reminder.kind === "remind" ? "Reminder" : "Follow-up"}</span>}
                  {m.meta.pinned && (
                    <span className="pin-tag">
                      <Pin size={13} /> Pinned
                    </span>
                  )}
                  {m.role === "user" && !!m.meta.attachments?.length && (
                    <div className="sent-files">
                      {m.meta.attachments.map((a, i) =>
                        a.thumb ? (
                          <img key={i} className="sent-photo" src={a.thumb} alt={a.name} />
                        ) : (
                          <span key={i} className="sent-file">
                            <FileIcon size={18} />
                            {a.name}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {m.role === "user" && !m.content.trim() ? (
                    m.meta.reaction ? (
                      <span className="reaction lone" role="img" aria-label={`Lyra reacted ${m.meta.reaction}`}>
                        {m.meta.reaction}
                      </span>
                    ) : null
                  ) : m.role === "user" ? (
                    <>
                      <div className={`bubble${m.meta.reaction ? " reacted" : ""}`} {...holdProps(m)}>
                        {m.content}
                        {m.meta.reaction && (
                          <span className="reaction" role="img" aria-label={`Lyra reacted ${m.meta.reaction}`}>
                            {m.meta.reaction}
                          </span>
                        )}
                      </div>
                      {lastOfGroup && m.id > 0 && <time className="stamp" dateTime={d.toISOString()}>{clock(d)}</time>}
                    </>
                  ) : !m.content.trim() && !m.meta.error ? null : (
                    <div className={`reply${m.meta.error ? " error" : headline(m.content) ? " headline" : ""}`} {...holdProps(m)}>
                      <Markdown text={m.content} />
                    </div>
                  )}
                  {!!m.meta.memory?.length && <Notes notes={m.meta.memory} onAction={(i, a) => answerNote(m, i, a)} />}
                  {!!m.meta.tasks?.length && <TaskNotes notes={m.meta.tasks} />}
                  {m.meta.triage && <TriageCard t={m.meta.triage} onSend={(text) => void send(text)} />}
                  {!!m.meta.actions?.length && <ActionCards ids={m.meta.actions} toast={toast} />}
                  {!!m.meta.docs?.length && (
                    <div className="notes">
                      {m.meta.docs.map((d) => (
                        <a className="note task-note doc-note" key={d.id} href={`#/d/${d.id}`}>
                          {d.kind === "dashboard" ? <Chart size={16} /> : <FileIcon size={16} />}
                          <span className="what">
                            <b>{d.kind === "dashboard" ? (d.created ? "Dashboard" : "Dashboard updated") : d.created ? "Doc" : "Doc updated"}</b> · {d.title}
                          </span>
                          <Chevron size={16} className="chev" />
                        </a>
                      ))}
                    </div>
                  )}
                  {!!m.meta.skills?.length && (
                    <div className="people-notes">
                      {m.meta.skills.map((s) => (
                        <a key={`${s.kind}${s.id}`} className="person-chip skill-chip" href="#/memory?skills">
                          {s.kind === "saved" ? `Learned ${s.name}` : `Followed ${s.name}`}
                        </a>
                      ))}
                    </div>
                  )}
                  {!!m.meta.people?.length && (
                    <div className="people-notes">
                      {m.meta.people.map((p) => (
                        <a key={p.id} className="person-chip" href="#/memory?people">
                          {p.created ? `Added ${p.name}` : `Noted about ${p.name}`}
                        </a>
                      ))}
                    </div>
                  )}
                  {m.meta.tidy && (
                    <button
                      className="btn quiet tidy-undo"
                      disabled={!!m.meta.tidy.undone}
                      onClick={async () => {
                        if (!confirm("Put your notes back the way they were before this tidy-up? Anything saved since then is undone too.")) return;
                        try {
                          await api.undoTidy(m.id);
                          toast("Tidy-up undone");
                        } catch (e) {
                          toast((e as Error).message);
                        }
                      }}
                    >
                      {m.meta.tidy.undone ? "Undone" : "Undo tidy-up"}
                    </button>
                  )}
                  {!!m.meta.sources?.length && <Sources list={m.meta.sources} />}
                  {!!m.meta.suggestions?.length && m.id === lastId && !pending && (
                    <div className="suggestions" aria-label="Suggested replies">
                      {m.meta.suggestions.map((s) => (
                        <button key={s} className="suggestion" onClick={() => void send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="sr-only">{clock(d)}</span>
                </div>
              </Fragment>
            );
          })}

          {resumed && !pending && (
            <div className="row lyra">
              <Thinking label="" />
            </div>
          )}
          {pending && (
            <div className="row lyra">
              {pending.reply ? (
                <div className={`reply caret${headline(pending.reply) ? " headline" : ""}`}>
                  <Markdown text={pending.reply} />
                </div>
              ) : (
                <Thinking label={pending.status} />
              )}
              {pending.reply && pending.status && <Thinking label={pending.status} />}
              {!!pending.notes.length && <Notes notes={pending.notes} />}
            </div>
          )}
        </div>
      </div>

      {talking && <VoiceOverlay channel={channel} onClose={endTalk} toast={toast} />}
      {attaching && (
        <div className="dialog-layer sheet-layer" role="presentation">
          <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={() => setAttaching(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Attach">
            <div className="group">
              {(
                [
                  ["Take a photo", cameraPick],
                  ["Photo library", photoPick],
                  ["File (PDF or text)", filePick],
                ] as const
              ).map(([label, ref]) => (
                <button
                  key={label}
                  className="item"
                  onClick={() => {
                    setAttaching(false);
                    ref.current?.click();
                  }}
                >
                  <span className="body">
                    <div className="title">{label}</div>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {acting && <MessageActions message={acting} onAct={(w) => void act(acting, w)} onClose={() => setActing(null)} />}
      <div className="composer" ref={composerRef}>
        {!atBottom && (
          <button className="ring jump" aria-label="Jump to latest" onClick={() => toBottom(true)}>
            <ArrowDown size={20} />
          </button>
        )}
        <form
          className={`composer-inner${dragging ? " dragging" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          {drafts.length > 0 && (
            <ul className="drafts" aria-label="Attached">
              {drafts.map((d) => (
                <li key={d.id} className={`draft${d.thumb ? " photo" : ""}`}>
                  {d.thumb ? <img src={d.thumb} alt={d.name} /> : <><FileIcon size={18} /><span>{d.name}</span></>}
                  <button type="button" aria-label={`Remove ${d.name}`} onClick={() => setDrafts((cur) => cur.filter((x) => x.id !== d.id))}>
                    <Close size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="attach"
            aria-label="Attach a photo or file"
            aria-expanded={attaching}
            disabled={!!pending}
            // a phone offers camera, photos or files; a computer goes straight to the file picker
            onClick={() => (isNative ? setAttaching(true) : filePick.current?.click())}
          >
            <Plus size={22} />
          </button>
          <input ref={filePick} type="file" hidden multiple accept="image/*,application/pdf,text/*,.md,.csv,.json,.ics" aria-label="Choose files" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ""; }} />
          <input ref={photoPick} type="file" hidden multiple accept="image/*" aria-label="Choose photos" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ""; }} />
          <input ref={cameraPick} type="file" hidden accept="image/*" capture="environment" aria-label="Take a photo" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ""; }} />
          <label htmlFor="msg" className="sr-only">
            Message Lyra
          </label>
          <textarea
            id="msg"
            ref={boxRef}
            rows={1}
            value={input}
            placeholder={channel ? `Message ${channel.name}` : "Message Lyra"}
            enterKeyHint="send"
            onChange={(e) => {
              setInput(e.target.value);
              grow();
            }}
            onPaste={(e) => {
              // pasting a screenshot or copied image attaches it
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void addFiles(e.clipboardData.files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          {pending && !input.trim() ? (
            <button type="button" className="send stop" aria-label="Stop" onClick={() => api.stop().catch(() => {})}>
              <Stop size={20} />
            </button>
          ) : (
            <>
              {canTalk && !input.trim() && !drafts.length && (
                <button type="button" className="talk" aria-label="Talk with Lyra" title="Talk with Lyra" onClick={() => void talk()}>
                  <Wave size={21} />
                </button>
              )}
              <button type="submit" className="send" aria-label="Send" disabled={!input.trim() && !drafts.length}>
                <ArrowUp size={22} strokeWidth={2.25} />
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

function Notes({ notes, onAction }: { notes: MemoryNote[]; onAction?: (i: number, a: "undo" | "accept" | "dismiss") => void }) {
  return (
    <div className="notes">
      {notes.map((n, i) => {
        const section = n.section.toLowerCase();
        const target = !n.notebookLabel || n.notebookLabel === "Memory" ? section : `${n.notebookLabel}, ${section}`;
        if (n.kind === "suggested")
          return (
            <div className="ask" key={i}>
              <div className="label">
                <Spark size={14} /> Save to {target}?
              </div>
              <div className="fact">{n.text}</div>
              <div className="actions">
                <button className="btn primary" disabled={!onAction} onClick={() => onAction?.(i, "accept")}>
                  Save
                </button>
                <button className="btn quiet" disabled={!onAction} onClick={() => onAction?.(i, "dismiss")}>
                  Skip
                </button>
              </div>
            </div>
          );
        const verb = n.kind === "saved" ? `Saved to ${target}` : n.kind === "removed" ? `Removed from ${target}` : "Not saved";
        return (
          <div className={`note${n.undone ? " undone" : ""}`} key={i}>
            {n.kind === "removed" || n.kind === "dismissed" ? <Minus size={16} /> : <Spark size={16} />}
            <span className="what">
              <b>{verb}</b> · {n.text}
            </span>
            {onAction && !n.undone && (n.kind === "saved" || n.kind === "removed") && (
              <button className="link-btn" onClick={() => onAction(i, "undo")}>
                Undo
              </button>
            )}
            {n.undone && <span className="pill">Undone</span>}
          </div>
        );
      })}
    </div>
  );
}

function TaskNotes({ notes }: { notes: TaskNote[] }) {
  return (
    <div className="notes">
      {notes.map((n, i) => (
        <a className="note task-note" key={i} href={`#/t/${n.id}`}>
          <TasksIcon size={16} />
          <span className="what">
            <b>{n.kind === "created" ? "Task added" : "Task updated"}</b> · {n.title}
            {n.kind === "updated" && ` · ${STATUS_LABEL[n.status as keyof typeof STATUS_LABEL] ?? n.status}`}
          </span>
          <Chevron size={16} className="chev" />
        </a>
      ))}
    </div>
  );
}

function Sources({ list }: { list: { url: string; title: string }[] }) {
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  return (
    <div className="sources" aria-label="Sources">
      <span className="sources-label">Sources</span>
      {list.map((s) => (
        <a key={s.url} className="source" href={s.url} target="_blank" rel="noreferrer noopener" title={s.title}>
          {host(s.url)}
        </a>
      ))}
    </div>
  );
}

function MessageActions({ message, onAct, onClose }: { message: Message; onAct: (what: "copy" | "pin" | "delete") => void; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Message actions">
        <p className="sheet-preview">{message.content.replace(/[*`#>]/g, "").slice(0, 160)}</p>
        <div className="group">
          <button className="item" onClick={() => onAct("copy")} autoFocus>
            <span className="body">
              <div className="title">Copy</div>
            </span>
          </button>
          <button className="item" onClick={() => onAct("pin")}>
            <span className="body">
              <div className="title">{message.meta.pinned ? "Unpin" : "Pin"}</div>
            </span>
          </button>
          <button
            className="item"
            onClick={() => {
              if (confirm("Delete this message? Lyra will forget it was said, but anything it saved to memory stays.")) onAct("delete");
            }}
          >
            <span className="body">
              <div className="title bad">Delete</div>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
