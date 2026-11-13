// Phase 16: an inbox triage, as a card under Lyra's reply: what needs you, what can
// wait, and newsletters. Each email opens in Gmail; ones that need you can get a reply drafted.
import { useState } from "react";
import type { Triage, TriageItem } from "../../core/triage";
import { Mail, Star } from "./icons";

const gmail = (thread: string) => `https://mail.google.com/mail/u/0/#inbox/${thread}`;

export function TriageCard({ t, onSend }: { t: Triage; onSend: (text: string) => void }) {
  const [showFyi, setShowFyi] = useState(false);
  const row = (i: TriageItem, needs = false) => (
    <li key={i.thread} className={`triage-item${needs ? " triage-needs" : ""}`}>
      {needs && <Star size={12} className="triage-star" />}
      <span className="triage-main">
        <span className="triage-from">{i.from}</span>
        <span className="triage-subject">{i.subject}</span>
        {i.why && <span className="triage-why">{i.why}</span>}
        <span className="triage-actions">
          {needs && (
            <button type="button" className="triage-btn" onClick={() => onSend(`Draft a reply to thread ${i.thread}`)}>
              Draft a reply
            </button>
          )}
          <a className="triage-btn" href={gmail(i.thread)} target="_blank" rel="noreferrer noopener">
            Open in Gmail
          </a>
        </span>
      </span>
    </li>
  );
  return (
    <section className="triage-card" aria-label="Inbox triage">
      <div className="action-head">
        <span className="action-kind">
          <Mail size={16} /> Inbox
        </span>
        <span className="action-state">{t.range}</span>
      </div>
      {t.summary && <p className="triage-summary">{t.summary}</p>}
      {t.needs.length > 0 && (
        <>
          <h3 className="triage-label on">Needs you · {t.needs.length}</h3>
          <ul className="triage-list">{t.needs.map((i) => row(i, true))}</ul>
        </>
      )}
      {t.later.length > 0 && (
        <>
          <h3 className="triage-label">Can wait · {t.later.length}</h3>
          <ul className="triage-list">{t.later.map((i) => row(i))}</ul>
        </>
      )}
      {t.fyi.length > 0 && (
        <>
          <button type="button" className="triage-label triage-fold" aria-expanded={showFyi} onClick={() => setShowFyi((v) => !v)}>
            Newsletters and promos · {t.fyi.length} {showFyi ? "· hide" : "· show"}
          </button>
          {showFyi && <ul className="triage-list compact">{t.fyi.map((i) => row(i))}</ul>}
        </>
      )}
      {!t.needs.length && !t.later.length && !t.fyi.length && <p className="triage-why">Nothing new.</p>}
    </section>
  );
}
