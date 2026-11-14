import crypto from 'node:crypto';
import { db, now } from '../db.ts';
import { emit } from '../events.ts';
import type { Card, Tool } from '../tools/types.ts';

export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'done' | 'failed' | 'expired';

export interface Approval {
  id: string;
  thread: string;
  tool: string;
  input: unknown;
  card: Card;
  status: ApprovalStatus;
  result: string | null;
  created_at: number;
  decided_at: number | null;
}

interface Row extends Omit<Approval, 'input' | 'card'> { input: string; card: string }

const fromRow = (r: Row): Approval => ({ ...r, input: JSON.parse(r.input), card: JSON.parse(r.card) as Card });

/** What the interface shows. The raw input stays on the hub. */
export function approvalView(a: Approval) {
  return { id: a.id, tool: a.tool, card: a.card, status: a.status, result: a.result, at: a.created_at };
}

const waiters = new Map<string, (decision: 'approved' | 'declined') => void>();
/** Requests a turn in progress has said it will act on itself, even before it starts waiting. */
const claimed = new Set<string>();

/** How long an unanswered request stays open. Payment requests go stale quickly. */
const LIFETIME_MS = { money: 30 * 60_000, other: 48 * 3600_000 };

export function createApproval(thread: string, tool: Tool, input: unknown, willWait = false): Approval {
  const approval: Approval = {
    id: crypto.randomBytes(9).toString('base64url'),
    thread,
    tool: tool.name,
    input,
    card: tool.card!(input),
    status: 'pending',
    result: null,
    created_at: now(),
    decided_at: null,
  };
  db().prepare('insert into approvals(id, thread, tool, input, card, status, result, created_at, decided_at) values(?, ?, ?, ?, ?, ?, null, ?, null)')
    .run(approval.id, thread, tool.name, JSON.stringify(input), JSON.stringify(approval.card), approval.status, approval.created_at);
  if (willWait) claimed.add(approval.id);
  emit({ type: 'approval', approval: approvalView(approval) });
  return approval;
}

export function getApproval(id: string): Approval | null {
  const row = db().prepare('select * from approvals where id = ?').get(id) as unknown as Row | undefined;
  return row ? fromRow(row) : null;
}

/** Open requests, plus recently settled ones so the conversation keeps its history. */
export function listApprovals(): Approval[] {
  const rows = db()
    .prepare("select * from approvals where status = 'pending' or created_at > ? order by created_at")
    .all(now() - 7 * 24 * 3600_000) as unknown as Row[];
  return rows.map(fromRow);
}

function setStatus(id: string, status: ApprovalStatus, result?: string): Approval {
  const decided = status === 'approved' || status === 'declined' || status === 'expired';
  db().prepare('update approvals set status = ?, result = coalesce(?, result), decided_at = case when ? then ? else decided_at end where id = ?')
    .run(status, result ?? null, decided ? 1 : 0, now(), id);
  const approval = getApproval(id)!;
  emit({ type: 'approval', approval: approvalView(approval) });
  return approval;
}

/** Record how an approved action turned out. */
export function settle(id: string, status: 'done' | 'failed', result: string): Approval {
  return setStatus(id, status, result.slice(0, 400));
}

/**
 * Wait for the owner's answer. Resolves 'timeout' if they have not answered in
 * time (the request stays open) or the turn is stopped.
 */
export function waitFor(id: string, ms: number, signal: AbortSignal): Promise<'approved' | 'declined' | 'timeout'> {
  return new Promise((resolve) => {
    const done = (value: 'approved' | 'declined' | 'timeout') => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      waiters.delete(id);
      claimed.delete(id);
      resolve(value);
    };
    // The answer may already be in (it can arrive before the turn gets here).
    const status = getApproval(id)?.status;
    if (status === 'approved' || status === 'declined') {
      claimed.delete(id);
      resolve(status);
      return;
    }
    const onAbort = () => done('timeout');
    const timer = setTimeout(() => done('timeout'), ms);
    signal.addEventListener('abort', onAbort, { once: true });
    waiters.set(id, done);
  });
}

/**
 * The owner answered. If a turn is waiting on this request it carries on; if
 * not (the turn ended, or the hub restarted), an approved action runs now.
 */
export async function decide(
  id: string,
  decision: 'approve' | 'decline',
  runNow: (approval: Approval) => Promise<void>,
): Promise<Approval | null> {
  const current = getApproval(id);
  if (!current || current.status !== 'pending') return current;
  const approval = setStatus(id, decision === 'approve' ? 'approved' : 'declined');
  const waiter = waiters.get(id);
  if (waiter) waiter(approval.status as 'approved' | 'declined');
  else if (claimed.has(id)) return approval; // its turn is about to pick the answer up
  else if (approval.status === 'approved') await runNow(approval);
  return getApproval(id);
}

/** Close requests nobody answered. `isMoney` tells which tools spend money. */
export function expireStale(isMoney: (tool: string) => boolean): number {
  let expired = 0;
  const rows = db().prepare("select * from approvals where status = 'pending'").all() as unknown as Row[];
  for (const r of rows) {
    const life = isMoney(r.tool) ? LIFETIME_MS.money : LIFETIME_MS.other;
    if (now() - r.created_at > life && !waiters.has(r.id) && !claimed.has(r.id)) {
      setStatus(r.id, 'expired');
      expired++;
    }
  }
  return expired;
}

/** Decline everything still open (used by the kill switch). */
export function declineAllPending(): number {
  const rows = db().prepare("select id from approvals where status = 'pending'").all() as { id: string }[];
  for (const r of rows) {
    setStatus(r.id, 'declined');
    waiters.get(r.id)?.('declined');
  }
  return rows.length;
}
