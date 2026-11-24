// Cards for what an agent's tools found or did, the same as the phone's: a stretch of the calendar, an event it
// added, emails, a draft it saved, Drive files, or a follow-up or watch it set. Colored by the agent who made them.
import { useState } from '/vendor/hooks.mjs';
import { api } from './api.js';
import { Portrait, inkColor, tint } from './avatar.js';
import { Icon, html } from './ui.js';

const MAX_ROWS = 5;
const CALENDAR = 'https://calendar.google.com/calendar/r';
const GMAIL_DRAFTS = 'https://mail.google.com/mail/u/0/#drafts';

/** Only web links Google gave the hub, never anything else. */
const safe = (link, fallback = null) => (typeof link === 'string' && link.startsWith('https://') ? link : fallback);

const timeOf = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace('AM', 'am').replace('PM', 'pm');
/** An all-day event's date as local midnight, not UTC. */
const dateOf = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? new Date(`${value}T00:00:00`) : value ? new Date(value) : null);
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function lengthLabel(e) {
  if (e.allDay) return null;
  const minutes = Math.round((dateOf(e.end) - dateOf(e.start)) / 60000);
  if (!(minutes > 0)) return null;
  return minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes / 60} hr`;
}

function freeBetween(a, b) {
  if (a.allDay || b.allDay) return null;
  const minutes = Math.round((dateOf(b.start) - dateOf(a.end)) / 60000);
  if (minutes < 60) return null;
  const hours = Math.floor(minutes / 60);
  const half = minutes % 60 >= 30;
  return half ? `${hours}½ hours free` : hours === 1 ? '1 hour free' : `${hours} hours free`;
}

function untilLabel(e, now) {
  if (e.allDay) return null;
  const minutes = Math.floor((dateOf(e.start) - now) / 60000);
  if (minutes < 0 || minutes >= 12 * 60) return null;
  return minutes < 60 ? `In ${minutes} min` : `In ${Math.floor(minutes / 60)} hr`;
}

function shortWhen(at, now, phrase = false) {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(at))) / 86_400_000);
  const d = new Date(at);
  if (days <= 0) return phrase ? 'today' : timeOf(d);
  if (days === 1) return phrase ? 'yesterday' : 'Yesterday';
  const label = days < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return phrase ? `on ${label}` : label;
}

function followUpWhen(at, now) {
  const d = new Date(at);
  const days = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86_400_000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${timeOf(d)}`;
}

function whenLabel(e) {
  const start = dateOf(e.start);
  if (!start) return null;
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (e.allDay) return `${day} · All day`;
  const end = dateOf(e.end);
  return `${day} · ${timeOf(start)}${end ? ` – ${timeOf(end)}` : ''}`;
}

const initials = (name = '') => name.split('@')[0].split(/[\s._-]+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function Frame({ children, footer = null }) {
  return html`<section class="tool-card">${children}${footer && html`<div class="tool-card-foot">${footer}</div>`}</section>`;
}
const Open = ({ label, link }) => html`<a class="pill" href=${link} target="_blank" rel="noopener noreferrer">${label}</a>`;

function EventsCard({ card, now }) {
  const events = card.events ?? [];
  const days = [...new Map(events.map((e) => dateOf(e.start)).filter(Boolean).map((d) => [dayKey(d), d])).values()];
  const first = days[0] ?? new Date(card.from ?? now);
  const upcoming = events.findIndex((e) => dateOf(e.start) > now);
  const title = days.length <= 1
    ? first.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days.at(-1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return html`<${Frame} footer=${html`<${Open} label="Open Calendar" link=${safe(events[0]?.link, CALENDAR)} />`}>
    <div class="tool-card-head">
      <span class="date-badge"><span>${first.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>${first.getDate()}</span>
      <div><div class="title-s">${title}</div><div class="caption faint">Google Calendar · ${events.length === 0 ? 'nothing on' : events.length === 1 ? '1 event' : `${events.length} events`}</div></div>
    </div>
    <div class="events">
      ${events.length === 0 && html`<p class="muted" style="margin:0">Your calendar is clear.</p>`}
      ${events.map((e, i) => {
        const day = dateOf(e.start);
        const prev = events[i - 1];
        const newDay = days.length > 1 && day && (!prev || dayKey(dateOf(prev.start)) !== dayKey(day));
        const gap = prev && day && !newDay && dayKey(dateOf(prev.start)) === dayKey(day) ? freeBetween(prev, e) : null;
        const tag = i === upcoming ? untilLabel(e, now) : null;
        const detail = [e.location, lengthLabel(e)].filter(Boolean).join(' · ');
        return html`
          ${newDay && html`<div class="overline faint event-day">${day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>`}
          ${gap && html`<div class="free-gap"><span></span>${gap}<span></span></div>`}
          <div class="event-row">
            <div class="event-time mono">${e.allDay ? 'All day' : html`${timeOf(dateOf(e.start)).replace(/\s?[ap]m$/, '')}<span class="faint">${timeOf(dateOf(e.end))}</span>`}</div>
            <div class=${`event-block${i === upcoming ? ' next' : ''}`}>
              <div class="event-title"><span class="title-s">${e.title}</span>${tag && html`<span class="tag">${tag}</span>`}</div>
              ${detail && html`<div class="body-s muted">${detail}</div>`}
            </div>
          </div>`;
      })}
    </div>
  <//>`;
}

function EventAddedCard({ event }) {
  return html`<${Frame} footer=${html`<${Open} label="Open Calendar" link=${safe(event.link, CALENDAR)} />`}>
    <div class="tool-card-head"><span class="check-badge"><${Icon} name="check" size=${16} /></span><span class="title-s">Added to your calendar</span></div>
    <div class="event-block next solo"><div class="title-s">${event.title}</div><div class="body-s muted">${[whenLabel(event), event.location].filter(Boolean).join(' · ')}</div></div>
  <//>`;
}

function EmailsCard({ card, now }) {
  const emails = card.emails ?? [];
  const more = emails.length - MAX_ROWS;
  return html`<${Frame} footer=${more > 0 ? html`<span class="caption faint">${more} more in Gmail</span>` : null}>
    ${emails.length === 0 && html`<p class="muted" style="margin:16px">No emails matched.</p>`}
    ${emails.slice(0, MAX_ROWS).map((m) => html`<a class="mail-row" href=${safe(m.link, 'https://mail.google.com/')} target="_blank" rel="noopener noreferrer">
      <span class="initials">${initials(m.from)}</span>
      <span class="text">
        <span class="line">${m.unread && html`<i class="unread" aria-label="Unread"></i>`}<span class="title-s">${m.from}</span>${m.at && html`<span class="caption faint">${shortWhen(m.at, now)}</span>`}</span>
        <span class="body-s muted clip">${[m.subject, m.snippet].filter(Boolean).join(' · ')}</span>
      </span>
    </a>`)}
  <//>`;
}

function DraftCard({ card }) {
  return html`<${Frame} footer=${html`<${Open} label="Open in Gmail" link=${safe(card.link, GMAIL_DRAFTS)} /><span class="caption faint" style="margin-left:auto">You send it from Gmail</span>`}>
    <div class="draft-head"><span class="draft-tag overline">Draft</span><span class="body-s muted clip">${[`To ${card.recipient}`, card.subject].filter(Boolean).join(' · ')}</span></div>
    <p class="draft-body">${card.body?.trim()}</p>
  <//>`;
}

function FilesCard({ card, now }) {
  return html`<${Frame}>
    ${(card.files ?? []).slice(0, MAX_ROWS).map((f) => html`<a class="file-row" href=${safe(f.link, 'https://drive.google.com/')} target="_blank" rel="noopener noreferrer">
      <span class="file-badge"><${Icon} name="file" size=${20} /></span>
      <span class="text"><span class="title-s clip">${f.name}</span><span class="caption faint">${[f.kind, f.modified && `edited ${shortWhen(f.modified, now, true)}`].filter(Boolean).join(' · ')}</span></span>
      <${Icon} name="chevron" size=${18} />
    </a>`)}
  <//>`;
}

function PlanCard({ card, agent, now, notify }) {
  const followUp = card.type === 'followup';
  const [ended, setEnded] = useState(followUp && card.time && card.time <= now ? 'Checked in' : null);
  const cancel = async () => {
    try {
      await (followUp ? api.deleteFollowUp(card.ref) : api.deleteWatch(card.ref));
      setEnded(followUp ? 'Cancelled' : 'Stopped');
    } catch (e) {
      // Already gone: it ran, or someone cancelled it.
      if (/not found|404/i.test(e.message)) setEnded(followUp ? 'No longer set' : 'Stopped');
      else notify(e.message);
    }
  };
  const detail = followUp ? card.note : [card.what, card.condition && `for when ${card.condition}`].filter(Boolean).join(', ');
  return html`<${Frame} footer=${ended ? html`<span class="caption faint">${ended}</span>` : html`<button class="pill" onClick=${cancel}>${followUp ? 'Cancel' : 'Stop watching'}</button>`}>
    <div class="tool-card-head">
      <${Portrait} spec=${agent?.avatar} size=${40} />
      <div><div class="title-s">${agent?.name ?? 'Your agent'} ${followUp ? 'will check in' : 'is watching'}</div>
        <div class="caption ink">${followUp ? (card.time ? followUpWhen(card.time, now) : '') : `Checked every ${card.every || 'day'}`}</div></div>
    </div>
    ${detail && html`<p class="body-s muted plan-detail">${detail}</p>`}
  <//>`;
}

/** A big action an agent wants to take in the Treehouse browser, with Allow and Deny until it's answered. */
function ApprovalCard({ card, agent, notify }) {
  const [answered, setAnswered] = useState(false);
  const pending = card.status === 'pending';
  const decide = async (allow) => {
    setAnswered(true);
    try {
      await api.decide(card.ref, allow);
    } catch (e) {
      notify(e.message);
    }
  };
  const ended = { allowed: 'You allowed this', denied: 'You said no', expired: "No answer in time, so it wasn't done" }[card.status] ?? "The reply stopped, so it wasn't done";
  return html`<${Frame} footer=${pending
    ? html`<button class="pill" disabled=${answered} onClick=${() => decide(false)}>Deny</button><button class="pill selected" disabled=${answered} onClick=${() => decide(true)}>Allow</button><span class="caption ink" style="margin-left:auto">Waiting for you</span>`
    : html`<span class="caption faint">${ended}</span>`}>
    <div class="tool-card-head">
      <span class="file-badge" style="border-radius:50%"><${Icon} name="globe" size=${20} /></span>
      <div><div class="caption faint">${agent?.name ?? 'Your agent'} ${pending ? 'asks first' : 'asked first'}</div><div class="title-s">${card.action}</div>
        ${card.site && html`<div class="body-s muted">on ${card.site}, in the Treehouse browser</div>`}</div>
    </div>
  <//>`;
}

/** One card, in its agent's colors. */
export function ToolCard({ card, agent, notify = () => {}, now = Date.now() }) {
  const style = `--wash:${tint(agent?.avatar)};--ink:${inkColor(agent?.avatar)}`;
  const body = {
    events: () => html`<${EventsCard} card=${card} now=${now} />`,
    event_added: () => card.event && html`<${EventAddedCard} event=${card.event} />`,
    emails: () => html`<${EmailsCard} card=${card} now=${now} />`,
    draft: () => html`<${DraftCard} card=${card} />`,
    files: () => html`<${FilesCard} card=${card} now=${now} />`,
    followup: () => html`<${PlanCard} card=${card} agent=${agent} now=${now} notify=${notify} />`,
    watch: () => html`<${PlanCard} card=${card} agent=${agent} now=${now} notify=${notify} />`,
    approval: () => html`<${ApprovalCard} card=${card} agent=${agent} notify=${notify} />`,
  }[card.type];
  return body ? html`<div class="tool-card-wrap" style=${style}>${body()}</div>` : null;
}

/**
 * A reply's text cut where its cards go: [{ text }, { card }, { text }, …]. Cards sit where the agent's tools
 * ran, so what it wrote before a card comes first and what it wrote after follows.
 */
export function splitAtCards(text, cards = []) {
  const pieces = [];
  let start = 0;
  for (const card of [...cards].sort((a, b) => a.at - b.at)) {
    const end = Math.min(Math.max(card.at ?? 0, start), text.length);
    if (text.slice(start, end).trim()) pieces.push({ text: text.slice(start, end).trim() });
    pieces.push({ card });
    start = end;
  }
  if (text.slice(start).trim()) pieces.push({ text: text.slice(start).trim() });
  return pieces;
}
