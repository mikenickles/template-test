import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, sendChat, type MemoryNote, type Message } from "../api";
import { ArrowDown, ArrowUp, Check, Minus, Stop } from "../icons";
import { LyraMark } from "../LyraMark";
import { Markdown } from "../markdown";
import { clock, dayLabel, parse } from "../when";

interface Pending {
  reply: string;
  status: string;
  notes: MemoryNote[];
}

const STARTERS = ["What's new in my inbox?", "What do you know about me so far?", "Remember that I prefer short replies"];

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

  const toBottom = useCallback((smooth = false) => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    if (stick.current) toBottom();
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
            <button className="chip" style={{ alignSelf: "center", marginTop: 16 }} onClick={loadEarlier}>
              Show earlier messages
            </button>
          )}

          {empty && (
            <div className="hello">
              <LyraMark size={56} />
              <h1>Hi{userName !== "you" ? ` ${userName}` : ""}, I'm Lyra.</h1>
              <p>Text me like you would a trusted assistant. I'll keep it short and remember what matters.</p>
              <div className="chips">
                {STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
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
                  <div className={`bubble${m.meta.error ? " error" : ""}`}>
                    {m.role === "user" ? m.content : <Markdown text={m.content} />}
                  </div>
                  {!!m.meta.memory?.length && (
                    <Notes notes={m.meta.memory} onAction={(i, a) => answerNote(m, i, a)} />
                  )}
                  <span className="time sr-only">{clock(d)}</span>
                </div>
              </Fragment>
            );
          })}

          {pending && (
            <div className="row lyra">
              {pending.reply ? (
                <div className="bubble caret">
                  <Markdown text={pending.reply} />
                </div>
              ) : (
                <div className="typing" role="status">
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {pending.status && <span>{pending.status}…</span>}
                </div>
              )}
              {pending.reply && pending.status && <div className="note">{pending.status}…</div>}
              {!!pending.notes.length && <Notes notes={pending.notes} />}
            </div>
          )}
        </div>
      </div>

      <div className="composer composer-wrap">
        {!atBottom && (
          <button className="round jump" aria-label="Jump to latest" onClick={() => toBottom(true)}>
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
            <button type="button" className="send" aria-label="Stop" onClick={() => api.stop().catch(() => {})}>
              <Stop size={20} />
            </button>
          ) : (
            <button type="submit" className="send" aria-label="Send" disabled={!input.trim()}>
              <ArrowUp size={22} />
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
        if (n.kind === "suggested")
          return (
            <div className="ask" key={i}>
              <div className="label">Save to {n.section.toLowerCase()}?</div>
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
        const verb =
          n.kind === "saved" ? `Saved to ${n.section.toLowerCase()}` : n.kind === "removed" ? `Removed from ${n.section.toLowerCase()}` : "Not saved";
        return (
          <div className={`note${n.undone ? " undone" : ""}`} key={i}>
            {n.kind === "removed" || n.kind === "dismissed" ? <Minus size={16} /> : <Check size={16} />}
            <span className="what">
              {verb}: {n.text}
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
