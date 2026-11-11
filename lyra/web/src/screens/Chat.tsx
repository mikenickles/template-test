import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, sendChat, type MemoryNote, type Message } from "../api";
import { ArrowDown, ArrowUp, ArrowUpRight, Minus, Spark, Stop } from "../icons";
import { StarChart, Thinking } from "../LyraMark";
import { Markdown } from "../markdown";
import { clock, dayLabel, parse } from "../when";

interface Pending {
  reply: string;
  status: string;
  notes: MemoryNote[];
}

const STARTERS = ["What's new in my inbox?", "What do you know about me so far?", "Remember that I prefer short replies"];

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Chat({ userName, toast }: { userName: string; toast: (msg: string) => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    api
      .messages()
      .then((r) => {
        setMessages(r.messages);
        setHasMore(r.messages.length >= 60);
      })
      .catch(() => {
        setMessages([]);
        toast("Couldn't load the chat. Is Lyra running?");
      });
  }, [toast]);

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

  const onScroll = () => {
    const el = logRef.current!;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    setAtBottom(near);
  };

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
    const r = await api.messages(messages[0].id);
    setHasMore(r.messages.length >= 60);
    stick.current = false;
    setMessages((m) => [...r.messages, ...(m ?? [])]);
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - before));
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    setInput("");
    requestAnimationFrame(grow);
    stick.current = true;
    const temp: Message = { id: -Date.now(), role: "user", content: text, created_at: new Date().toISOString(), meta: {} };
    setMessages((m) => [...(m ?? []), temp]);
    setPending({ reply: "", status: "", notes: [] });
    try {
      await sendChat(text, {
        text: (d) => setPending((p) => p && { ...p, reply: p.reply + d, status: "" }),
        status: (label) => setPending((p) => p && { ...p, status: label }),
        memory: (note) => setPending((p) => p && { ...p, notes: [...p.notes, note] }),
        done: (msg, user) =>
          setMessages((m) => [...(m ?? []).map((x) => (x.id === temp.id && user ? user : x)), msg]),
      });
    } catch (e) {
      setMessages((m) => (m ?? []).filter((x) => x.id !== temp.id));
      setInput(text);
      toast((e as Error).message);
    } finally {
      setPending(null);
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
  let lastDay = "";

  return (
    <div className="chat">
      <div className="log" ref={logRef} onScroll={onScroll} aria-live="polite">
        <div className="log-inner">
          {hasMore && (
            <button className="chip small" onClick={loadEarlier}>
              Show earlier messages
            </button>
          )}

          {empty && (
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

          {messages.map((m) => {
            const d = parse(m.created_at);
            const day = dayLabel(d);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <Fragment key={m.id}>
                {showDay && <div className="day">{day}</div>}
                <div className={`row ${m.role === "user" ? "user" : "lyra"}`}>
                  {m.role === "user" ? (
                    <div className="bubble">{m.content}</div>
                  ) : (
                    <div className={`reply${m.meta.error ? " error" : ""}`}>
                      <Markdown text={m.content} />
                    </div>
                  )}
                  {!!m.meta.memory?.length && <Notes notes={m.meta.memory} onAction={(i, a) => answerNote(m, i, a)} />}
                  <span className="sr-only">{clock(d)}</span>
                </div>
              </Fragment>
            );
          })}

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

      <div className="composer">
        {!atBottom && (
          <button className="ring jump" aria-label="Jump to latest" onClick={() => toBottom(true)}>
            <ArrowDown size={20} />
          </button>
        )}
        <form
          className="composer-inner"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="msg" className="sr-only">
            Message Lyra
          </label>
          <textarea
            id="msg"
            ref={boxRef}
            rows={1}
            value={input}
            placeholder="Message Lyra"
            enterKeyHint="send"
            onChange={(e) => {
              setInput(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          {pending ? (
            <button type="button" className="send stop" aria-label="Stop" onClick={() => api.stop().catch(() => {})}>
              <Stop size={20} />
            </button>
          ) : (
            <button type="submit" className="send" aria-label="Send" disabled={!input.trim()}>
              <ArrowUp size={22} strokeWidth={2.25} />
            </button>
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
        if (n.kind === "suggested")
          return (
            <div className="ask" key={i}>
              <div className="label">
                <Spark size={14} /> Save to {section}?
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
        const verb = n.kind === "saved" ? `Saved to ${section}` : n.kind === "removed" ? `Removed from ${section}` : "Not saved";
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
