import { useEffect, useState } from "react";
import { api, type Message } from "../api";
import { Pin } from "../icons";
import { dayLabel, parse } from "../when";

/** Messages pinned in a chat (long-press a message to pin it). Shows nothing if there are none. */
export function PinnedList({ channelId, toast }: { channelId: number | null; toast: (m: string) => void }) {
  const [list, setList] = useState<Message[]>([]);
  useEffect(() => {
    api.pinned(channelId).then(setList, () => {});
  }, [channelId]);
  if (!list.length) return null;

  const unpin = async (m: Message) => {
    try {
      await api.pinMessage(m.id, false);
      setList((l) => l.filter((x) => x.id !== m.id));
      toast("Unpinned");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className="section">
      <h2 className="section-label">Pinned</h2>
      <div className="group">
        {list.map((m) => (
          <div className="item pinned-item" key={m.id}>
            <span className="tile">
              <Pin />
            </span>
            <span className="body">
              <div className="title pinned-text">{m.content.replace(/[*`#>]/g, "")}</div>
              <div className="sub">
                {m.role === "user" ? "You" : "Lyra"} · {dayLabel(parse(m.created_at))}
              </div>
            </span>
            <button className="btn quiet" onClick={() => void unpin(m)}>
              Unpin
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
