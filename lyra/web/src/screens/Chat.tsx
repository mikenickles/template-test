import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, onChange, sendChat, type Channel, type MemoryNote, type Message, type TaskNote } from "../api";
import { ArrowDown, ArrowUp, ArrowUpRight, ChannelIcon, Chart, Chevron, Close, File as FileIcon, Minus, Wave, More, Pin, Plus, Spark, Stop, TasksIcon, ThumbDown, ThumbUp } from "../icons";
import { haptic } from "../haptics";
import { sound } from "../sounds";
import { FEEDBACK_REASONS } from "../../../core/style";
import { noteOf, onIncoming, prepare, prepareShared, strip, takeIncoming, type Draft } from "../attach";
import { MAX_ATTACHMENTS } from "../../../core/attachments";
import { copyText, isNative, liveVoice } from "../platform";
import { VoiceOverlay } from "../VoiceOverlay";
import { ActionCards } from "../ActionCard";
import { TriageCard } from "../TriageCard";
import { ScanCard } from "../ScanCard";
import { WidgetCard } from "../WidgetCard";
import { SetupCard } from "../Setup";
import { markSeen } from "../seen";
import { Globe, Pencil, Refresh, Reply as ReplyIcon, Star } from "../icons";
import { excerptOf, splitQuote, withQuote } from "../../../core/quote";
import { showTokens, tokenLine } from "../tokens";
import { setChatStatus } from "../StatusLine";
import { STATUS_LABEL } from "./Tasks";
import { StarChart, Thinking } from "../LyraMark";
import { Markdown } from "../markdown";
import { clock, dayLabel, parse } from "../when";
import { ask } from "../ask";

interface Pending {
  reply: string;
  status: string;
  notes: MemoryNote[];
}

/** First things to say. The inbox one only once mail is connected. */
const starters = (mail: boolean) => [mail ? "What's new in my inbox?" : "What can you do for me?", "What do you know about me so far?", "Remember that I prefer short replies"];
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
  /** a message to scroll to and highlight (from search) */
  focus?: number;
  /** web search is on (the "Web" switch in the message box, same as Settings, AI model) */
  webSearch: boolean;
}


/** Skip re-rendering the whole conversation unless something it shows changed (e.g. while the menu slides). */
export const Chat = memo(ChatView, (a, b) => {
  const same = (x: Channel | null, y: Channel | null) =>
    x === y || (!!x && !!y && x.id === y.id && x.name === y.name && x.icon === y.icon && x.about === y.about);
  return a.focus === b.focus && a.webSearch === b.webSearch && a.hasOpenAI === b.hasOpenAI && a.userName === b.userName && a.toast === b.toast && a.onTasksChanged === b.onTasksChanged && same(a.channel, b.channel);
});

function ChatView({ userName, toast, channel, onTasksChanged, hasOpenAI, focus, webSearch }: ChatProps) {
  const channelId = channel?.id ?? null;
  // (0.58) the message box's Web switch: shown at once, saved in the background
  const [web, setWeb] = useState(webSearch);
  useEffect(() => setWeb(webSearch), [webSearch]);
  const toggleWeb = () => {
    const on = !web;
    setWeb(on);
    haptic.select();
    api.saveSettings({ webSearch: on }).then(
      () => toast(on ? "Lyra can search the web" : "Web search off"),
      () => setWeb(!on),
    );
  };
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

  // a button tapped on a notification: send that step here, once (and only if it was just now)
  const sendRef = useRef<(t: string) => Promise<void>>(async () => {});
  useEffect(() => {
    const take = () => {
      try {
        const o = JSON.parse(sessionStorage.getItem("lyra.say") || "null") as { hash: string; say: string; at: number } | null;
        const here = channelId === null ? "#/" : `#/c/${channelId}`;
        if (!o || o.hash.split("?")[0] !== here || Date.now() - o.at > 60_000) return;
        sessionStorage.removeItem("lyra.say");
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
  // (0.59) and Kit, Lyra's face, does a little hop when the reply lands
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) document.body.dataset.busy = "1";
    else delete document.body.dataset.busy;
    if (wasPending.current && !pending) {
      document.body.dataset.landed = "1";
      const t = setTimeout(() => delete document.body.dataset.landed, 1300);
      wasPending.current = false;
      return () => {
        clearTimeout(t);
        delete document.body.dataset.busy;
      };
    }
    wasPending.current = !!pending;
    return () => {
      delete document.body.dataset.busy;
    };
  }, [pending]);

  const toBottom = useCallback((smooth = false) => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // the welcome screen reads from the top (also when its checklist loads in and makes it taller);
  // a conversation sticks to the latest message
  const welcome = useRef(true);
  welcome.current = !(messages?.length || pending);
  useLayoutEffect(() => {
    if (stick.current && !welcome.current) toBottom();
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
    else if (stick.current && !welcome.current) toBottom();
    setAtBottom(near || stick.current || welcome.current);
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
      frame = requestAnimationFrame(() => stick.current && !welcome.current && toBottom());
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

  // jump to one message (from search), loading earlier pages if needed
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
      requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
      return;
    }
    if (hasMore && focusTries.current++ < 10) void loadEarlier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, messages, hasMore]);

  // ---- photos and files waiting to be sent with the next message ----
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // each reply's token count under it (Settings, Usage)
  const [tokens, setTokens] = useState(showTokens);
  useEffect(() => {
    const on = () => setTokens(showTokens());
    addEventListener("lyra:tokens", on);
    return () => removeEventListener("lyra:tokens", on);
  }, []);
  // the message being answered (long-press, Reply): its excerpt rides along as a quote
  const [replyTo, setReplyTo] = useState<{ id: number; excerpt: string; mine: boolean } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const filePick = useRef<HTMLInputElement>(null);
  const photoPick = useRef<HTMLInputElement>(null);
  const cameraPick = useRef<HTMLInputElement>(null);
  const scanPick = useRef<HTMLInputElement>(null);

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
  /** "Scan a paper": the photo is sent right away with the ask, and Lyra answers with a card of what to do. */
  const scanFiles = async (files: File[]) => {
    try {
      const ready = await Promise.all(files.slice(0, 2).map((f) => prepare(f, f.name || "scan.jpg")));
      await send("Scan this: what's on it that I need to do or remember?", ready);
    } catch (e) {
      toast((e as Error).message);
    }
  };

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

  const send = async (raw: string, given?: Draft[]) => {
    const files = given ?? drafts;
    if (!raw.trim() && !files.length) return;
    // answering one message: only what's typed in the box carries the quote (not a tapped button or a notification's reply)
    const text = replyTo && raw === input && raw.trim() ? withQuote(replyTo.excerpt, raw) : raw.trim();
    if (raw === input) setReplyTo(null);
    haptic.tap();
    sound.send();
    // A reply's being written: this joins it, like texting back to back.
    if (pending) {
      if (files.length) return toast("Photos and files go once Lyra has finished this reply.");
      if (!text) return;
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
          if (!msg.meta.error) sound.reply();
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
  // the "What's new in my inbox?" starter only makes sense once mail is connected
  const [mail, setMail] = useState(false);
  useEffect(() => void api.state().then((s) => setMail(s.connectors.some((c) => c.id === "gmail" && c.state === "connected")), () => {}), []);
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
              haptic.press();
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

  // thumbs up or down on a reply; down asks what was off (optional)
  const [whyFor, setWhyFor] = useState<Message | null>(null);
  const rate = async (m: Message, rating: "up" | "down" | null, why?: string) => {
    try {
      haptic.select();
      const next = await api.rateReply(m.id, rating, why);
      setMessages((list) => (list ?? []).map((x) => (x.id === m.id ? next : x)));
      if (rating === "down" && why === undefined) setWhyFor(next);
      else if (rating === "up") toast("Thanks! Noted 🙌");
      else if (rating === "down") toast("Thanks, noted");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // Edit and Try again work on the last exchange only: your latest message and what Lyra said to it.
  const lastAsk = (() => {
    const list = messages ?? [];
    let i = list.length - 1;
    while (i >= 0 && list[i].role === "assistant") i--;
    const m = list[i];
    const after = list.slice(i + 1);
    if (!m || m.id < 0 || pending || m.meta.attachments?.length || m.meta.voice) return null;
    // only a plain answer can be taken back: nothing Lyra saved, set, made or proposed, and nothing it posted on its own
    const did = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== false && v !== null);
    const plain = after.every((r) => r.id > 0 && !DID.some((k) => did(r.meta[k])));
    return plain ? { message: m, after } : null;
  })();
  const canEdit = (m: Message) => lastAsk?.message.id === m.id;
  const canRetry = (m: Message) => !!lastAsk && lastAsk.after.length === 1 && lastAsk.after[0].id === m.id;

  /** Take back the last exchange: put your message back in the box to change, or send it again as it was. */
  const redo = async (again: boolean) => {
    if (!lastAsk) return;
    const { message, after } = lastAsk;
    for (const x of [...after, message]) await api.deleteMessage(x.id);
    const gone = new Set([message.id, ...after.map((x) => x.id)]);
    setMessages((list) => (list ?? []).filter((x) => !gone.has(x.id)));
    if (again) return void sendRef.current?.(message.content);
    const was = splitQuote(message.content);
    if (was.quote) setReplyTo({ id: 0, excerpt: was.quote, mine: false });
    setInput(was.text);
    requestAnimationFrame(() => {
      grow();
      boxRef.current?.focus();
    });
  };

  const act = async (m: Message, what: "copy" | "pin" | "delete" | "up" | "down" | "edit" | "retry" | "reply") => {
    setActing(null);
    try {
      if (what === "reply") {
        setReplyTo({ id: m.id, excerpt: excerptOf(splitQuote(m.content).text), mine: m.role === "user" });
        requestAnimationFrame(() => boxRef.current?.focus());
      } else if (what === "edit" || what === "retry") {
        await redo(what === "retry");
      } else if (what === "up" || what === "down") {
        await rate(m, m.meta.feedback?.rating === what ? null : what);
      } else if (what === "copy") {
        await copyText(splitQuote(m.content).text);
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
          {hasMore && (
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
              <SetupCard toast={toast} />
              <div className="chips">
                {starters(mail).map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
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
                        {(() => {
                          const q = splitQuote(m.content);
                          return (
                            <>
                              {q.quote && <span className="bubble-quote">{q.quote}</span>}
                              {q.text}
                            </>
                          );
                        })()}
                        {m.meta.reaction && (
                          <span className="reaction" role="img" aria-label={`Lyra reacted ${m.meta.reaction}`}>
                            {m.meta.reaction}
                          </span>
                        )}
                      </div>
                      {lastOfGroup && m.id > 0 && <time className="stamp" dateTime={d.toISOString()}>{clock(d)}</time>}
                    </>
                  ) : !m.content.trim() && !m.meta.error ? null : (
                    <div className={`reply${m.meta.error ? " error" : ""}`} {...holdProps(m)}>
                      <Markdown text={m.content} />
                    </div>
                  )}
                  {!!m.meta.memory?.length && <Notes notes={m.meta.memory} onAction={(i, a) => answerNote(m, i, a)} />}
                  {!!m.meta.tasks?.length && <TaskNotes notes={m.meta.tasks} />}
                  {m.meta.triage && <TriageCard t={m.meta.triage} />}
                  {m.meta.scan && m.id > 0 && <ScanCard messageId={m.id} scan={m.meta.scan} toast={toast} />}
                  {m.meta.widget && m.id > 0 && <WidgetCard messageId={m.id} widget={m.meta.widget} toast={toast} onSend={(text) => void send(text)} live={m.id === lastId && !pending} />}
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
                        if (!(await ask("Put your notes back the way they were before this tidy-up? Anything saved since then is undone too."))) return;
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
                  {tokens && m.meta.usage && !(m.meta.feedback || (m.id === lastId && !pending)) && <span className="reply-tokens">{tokenLine(m.meta.usage)}</span>}
                  {m.role === "assistant" && m.id > 0 && !m.meta.error && !!m.content.trim() && (m.meta.feedback || (m.id === lastId && !pending)) && (
                    <div className={`rate${m.meta.feedback ? " rated" : ""}`} role="group" aria-label="Rate this reply">
                      {(!m.meta.feedback || m.meta.feedback.rating === "up") && (
                        <button
                          className={`rate-btn${m.meta.feedback?.rating === "up" ? " on" : ""}`}
                          aria-label={m.meta.feedback?.rating === "up" ? "You liked this reply (tap to undo)" : "Good reply"}
                          aria-pressed={m.meta.feedback?.rating === "up"}
                          onClick={() => void rate(m, m.meta.feedback?.rating === "up" ? null : "up")}
                        >
                          <ThumbUp size={16} />
                        </button>
                      )}
                      {(!m.meta.feedback || m.meta.feedback.rating === "down") && (
                        <button
                          className={`rate-btn${m.meta.feedback?.rating === "down" ? " on" : ""}`}
                          aria-label={m.meta.feedback?.rating === "down" ? "You didn't like this reply (tap to undo)" : "Not quite"}
                          aria-pressed={m.meta.feedback?.rating === "down"}
                          onClick={() => void rate(m, m.meta.feedback?.rating === "down" ? null : "down")}
                        >
                          <ThumbDown size={16} />
                        </button>
                      )}
                      {canRetry(m) && !m.meta.feedback && (
                        <button className="rate-btn" aria-label="Try again" title="Try again" onClick={() => void redo(true)}>
                          <Refresh size={16} />
                        </button>
                      )}
                      {m.meta.feedback?.why && <span className="rate-why">{m.meta.feedback.why}</span>}
                      {tokens && m.meta.usage && <span className="reply-tokens">{tokenLine(m.meta.usage)}</span>}
                    </div>
                  )}
                  {m.meta.error && canRetry(m) && (
                    <button className="btn quiet retry-btn" onClick={() => void redo(true)}>
                      <Refresh size={16} /> Try again
                    </button>
                  )}
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
                <div className="reply caret">
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
                  ["Scan a paper (flyer, slip, receipt)", scanPick],
                  ["Voice memo", null],
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
                    // a voice memo opens the listening sheet, and what you say comes back to this chat
                    if (!ref) return void dispatchEvent(new CustomEvent("lyra:memo", { detail: channelId === null ? "#/" : `#/c/${channelId}` }));
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
      {acting && <MessageActions message={acting} canEdit={canEdit(acting)} canRetry={canRetry(acting)} onAct={(w) => void act(acting, w)} onClose={() => setActing(null)} />}
      {whyFor && (
        <WhySheet
          onSend={(why) => {
            const m = whyFor;
            setWhyFor(null);
            if (why) void rate(m, "down", why);
            else toast("Thanks, noted");
          }}
        />
      )}
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
          {replyTo && (
            <div className="replying">
              <span className="replying-body">
                <span className="replying-label">{replyTo.mine ? "Replying to your message" : "Replying to Lyra"}</span>
                <span className="replying-text">{replyTo.excerpt}</span>
              </span>
              <button type="button" className="replying-close" aria-label="Stop replying to that message" onClick={() => setReplyTo(null)}>
                <Close size={16} />
              </button>
            </div>
          )}
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
            <Plus size={20} />
          </button>
          <button type="button" className={`web-toggle${web ? " on" : ""}`} aria-pressed={web} title="Search the web when it helps" onClick={toggleWeb}>
            <Globe size={16} />
            <span>Web</span>
          </button>
          <span className="composer-gap" aria-hidden="true" />
          <input ref={filePick} type="file" hidden multiple accept="image/*,application/pdf,text/*,.md,.csv,.json,.ics" aria-label="Choose files" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ""; }} />
          <input ref={photoPick} type="file" hidden multiple accept="image/*" aria-label="Choose photos" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ""; }} />
          <input ref={cameraPick} type="file" hidden accept="image/*" capture="environment" aria-label="Take a photo" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ""; }} />
          {/* a paper: the photo goes straight to Lyra, which shows what on it needs doing */}
          <input
            ref={scanPick}
            type="file"
            hidden
            accept="image/*,application/pdf"
            capture="environment"
            aria-label="Scan a paper"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) void scanFiles(files);
            }}
          />
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
                <ArrowUp size={19} strokeWidth={2.25} />
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

/** After a thumbs down: what was off? One tap, a few words, or skip. */
function WhySheet({ onSend }: { onSend: (why: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [more, setMore] = useState("");
  const why = [...picked, more.trim()].filter(Boolean).join("; ");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSend("");
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onSend]);
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Skip" tabIndex={-1} onClick={() => onSend("")} />
      <div className="sheet why-sheet" role="dialog" aria-modal="true" aria-label="What was off?">
        <h2 className="why-title">What was off?</h2>
        <p className="why-sub">Lyra learns from this, so the next replies fit you better.</p>
        <div className="why-chips">
          {FEEDBACK_REASONS.map((r) => (
            <button
              key={r}
              className={`why-chip${picked.includes(r) ? " on" : ""}`}
              aria-pressed={picked.includes(r)}
              onClick={() => {
                haptic.select();
                setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <input className="field" placeholder="Anything else? (optional)" value={more} maxLength={160} onChange={(e) => setMore(e.target.value)} />
        <div className="dialog-actions">
          <button className="btn quiet" onClick={() => onSend("")}>
            Skip
          </button>
          <button className="btn ink" disabled={!why} onClick={() => onSend(why)}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a reply's meta holds when Lyra did something with it (or posted it unasked): those can't be taken back by Try again. */
const DID = ["memory", "tasks", "worker", "routine", "voice", "reminder", "actions", "checkIn", "tidy", "skills", "docs", "placeReminder", "scan", "people", "headsUp", "lifeAdmin"] as const;

function MessageActions({
  message,
  canEdit,
  canRetry,
  onAct,
  onClose,
}: {
  message: Message;
  canEdit: boolean;
  canRetry: boolean;
  onAct: (what: "copy" | "pin" | "delete" | "up" | "down" | "edit" | "retry" | "reply") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Message actions">
        <p className="sheet-preview">{splitQuote(message.content).text.replace(/[*`#>]/g, "").slice(0, 160)}</p>
        {message.meta.usage && (
          <p className="sheet-usage">
            This reply: {(message.meta.usage.input + message.meta.usage.output).toLocaleString("en-US")} tokens ({message.meta.usage.input.toLocaleString("en-US")} read, {message.meta.usage.output.toLocaleString("en-US")} written)
            {message.meta.usage.calls > 1 ? `, ${message.meta.usage.calls} calls` : ""}
            {message.meta.usage.cached ? `; ${message.meta.usage.cached.toLocaleString("en-US")} read from the cache` : ""} · {message.meta.usage.model}
          </p>
        )}
        <div className="group">
          {!!message.content.trim() && !message.meta.error && (
            <button className="item" onClick={() => onAct("reply")} autoFocus>
              <span className="body">
                <div className="title">Reply</div>
              </span>
              <ReplyIcon size={18} />
            </button>
          )}
          <button className="item" onClick={() => onAct("copy")}>
            <span className="body">
              <div className="title">Copy</div>
            </span>
          </button>
          {canEdit && (
            <button className="item" onClick={() => onAct("edit")}>
              <span className="body">
                <div className="title">Edit and send again</div>
              </span>
              <Pencil size={18} />
            </button>
          )}
          {canRetry && (
            <button className="item" onClick={() => onAct("retry")}>
              <span className="body">
                <div className="title">Try again</div>
              </span>
              <Refresh size={18} />
            </button>
          )}
          <button className="item" onClick={() => onAct("pin")}>
            <span className="body">
              <div className="title">{message.meta.pinned ? "Unpin" : "Pin"}</div>
            </span>
          </button>
          {message.role === "assistant" && (
            <>
              <button className="item" onClick={() => onAct("up")}>
                <span className="body">
                  <div className="title">{message.meta.feedback?.rating === "up" ? "Undo good reply" : "Good reply"}</div>
                </span>
                <ThumbUp size={18} />
              </button>
              <button className="item" onClick={() => onAct("down")}>
                <span className="body">
                  <div className="title">{message.meta.feedback?.rating === "down" ? "Undo not quite" : "Not quite"}</div>
                </span>
                <ThumbDown size={18} />
              </button>
            </>
          )}
          <button
            className="item"
            onClick={() => {
              void ask("Delete this message? Lyra will forget it was said, but anything it saved to memory stays.").then<unknown>((ok) => ok && onAct("delete"));
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
