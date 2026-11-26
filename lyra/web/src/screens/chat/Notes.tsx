/** Memory notes under a reply (saved, suggested, undone) and a task's notes. */
import { type MemoryNote, type TaskNote } from "../../api";
import { Chevron, Minus, Spark, TasksIcon } from "../../icons";
import { STATUS_LABEL } from "../Tasks";
import { ask } from "../../ask";

export function Notes({ notes, onAction }: { notes: MemoryNote[]; onAction?: (i: number, a: "undo" | "accept" | "dismiss") => void }) {
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

export function TaskNotes({ notes }: { notes: TaskNote[] }) {
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
