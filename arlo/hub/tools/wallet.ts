import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR, ROOT } from '../config.ts';
import { isConnected } from '../connections.ts';
import { db, now } from '../db.ts';
import { getSecret } from '../secrets.ts';
import { getSettings } from '../settings.ts';
import { clip, defineTool } from './types.ts';
import type { ToolContext } from './types.ts';

/**
 * Money. Two separate things live here:
 *
 *  1. Your Stripe account (balance, payments, payment links, refunds), through
 *     a restricted API key.
 *  2. Paying for things. Arlo never holds or sees a card number. On your
 *     approval it asks for a one-time card capped at the agreed amount, and the
 *     card is shown only to you, in the Wallet panel, to finish the checkout.
 *     The card comes from your Link wallet (personal use; needs Stripe's Link
 *     CLI) or from Stripe Issuing (business accounts).
 *
 * Every spend needs approval and is checked against limits you set; neither
 * can be switched off.
 */

// ---------- Stripe API ----------

interface StripeError { type?: string; code?: string; message?: string }

async function stripe<T>(
  fetchImpl: typeof fetch,
  method: 'GET' | 'POST',
  route: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const key = getSecret('stripe.key');
  if (!key) throw new Error('Stripe is not connected.');
  const query = new URLSearchParams(params).toString();
  const res = await fetchImpl(`https://api.stripe.com${route}${method === 'GET' && query ? `?${query}` : ''}`, {
    method,
    signal,
    headers: { authorization: `Bearer ${key}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? query : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: StripeError };
  if (!res.ok) {
    throw Object.assign(new Error(json.error?.message ?? `Stripe said ${res.status}`), { code: json.error?.code, status: res.status });
  }
  return json as T;
}

/** Used when connecting: is this key real? */
export async function checkStripeKey(fetchImpl: typeof fetch): Promise<void> {
  await stripe(fetchImpl, 'GET', '/v1/balance');
}

// ---------- Ledger and limits ----------

export interface Payment {
  id: number; at: number; amount: number; currency: string; merchant: string; reason: string;
  rail: 'link' | 'issuing'; status: 'requested' | 'ready' | 'cancelled' | 'failed'; external_id: string | null;
}

export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);
}

export function listPayments(limit = 30): Payment[] {
  return db().prepare('select * from payments order by id desc limit ?').all(limit) as unknown as Payment[];
}

/** What has been committed since local midnight. */
export function spentToday(at: number = now()): number {
  const midnight = new Date(at);
  midnight.setHours(0, 0, 0, 0);
  const row = db()
    .prepare("select coalesce(sum(amount), 0) as total from payments where at >= ? and status in ('requested', 'ready')")
    .get(midnight.getTime()) as { total: number };
  return row.total;
}

/** The reason a spend is not allowed, or null if it is within the owner's limits. */
export function overLimit(minor: number, at: number = now()): string | null {
  const w = getSettings().wallet;
  if (!w.enabled) return 'Payments are switched off. The user can switch them on under Wallet in the menu, on their computer.';
  if (minor <= 0) return 'The amount must be more than zero.';
  if (minor > w.perPurchase) return `That is more than the ${money(w.perPurchase, w.currency)} per-purchase limit the user set.`;
  if (spentToday(at) + minor > w.perDay) {
    return `That would pass today's ${money(w.perDay, w.currency)} limit (${money(spentToday(at), w.currency)} already committed today).`;
  }
  return null;
}

function record(p: Omit<Payment, 'id' | 'at'>): number {
  const info = db()
    .prepare('insert into payments(at, amount, currency, merchant, reason, rail, status, external_id) values(?, ?, ?, ?, ?, ?, ?, ?)')
    .run(now(), p.amount, p.currency, p.merchant, p.reason, p.rail, p.status, p.external_id);
  return Number(info.lastInsertRowid);
}

// ---------- Link wallet (Stripe's Link CLI, installed separately) ----------

/** The CLI's entry script if it has been installed in the arlo folder, else null. */
export function linkCliPath(): string | null {
  const file = path.join(ROOT, 'node_modules', '@stripe', 'link-cli', 'dist', 'cli.js');
  return fs.existsSync(file) ? file : null;
}

/** Runs the CLI with an argument list (never a shell), so nothing in a merchant name can become a command. */
function link(args: string[]): Promise<string> {
  const cli = linkCliPath();
  if (!cli) return Promise.reject(new Error('The Link CLI is not installed.'));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args], { timeout: 90_000, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(clip(stderr || stdout || err.message, 300)));
      else resolve(stdout);
    });
  });
}

type Card = { number: string; cvc: string; exp_month: number; exp_year: number };

function findCard(value: unknown): Card | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.number === 'string' && typeof o.cvc === 'string') return o as unknown as Card;
  for (const child of Object.values(o)) {
    const found = findCard(child);
    if (found) return found;
  }
  return null;
}

// ---------- What the Wallet panel calls ----------

export function walletStatus() {
  const w = getSettings().wallet;
  const rail = linkCliPath() ? 'link' : isConnected('stripe') ? 'issuing' : null;
  return { ...w, rail, spentToday: spentToday(), payments: listPayments() };
}

/** Card details for the owner's eyes only. Fetched fresh each time; never stored, never shown to the model. */
export async function revealCard(id: number, fetchImpl: typeof fetch): Promise<{ status: string; card?: Card & { last4: string } }> {
  const p = db().prepare('select * from payments where id = ?').get(id) as unknown as Payment | undefined;
  if (!p?.external_id || p.status === 'cancelled' || p.status === 'failed') throw new Error('That card is no longer available.');
  if (p.rail === 'issuing') {
    const card = await stripe<Card & { status: string }>(fetchImpl, 'GET', `/v1/issuing/cards/${p.external_id}`, { 'expand[0]': 'number', 'expand[1]': 'cvc' });
    return { status: card.status, card: { number: card.number, cvc: card.cvc, exp_month: card.exp_month, exp_year: card.exp_year, last4: card.number.slice(-4) } };
  }
  const file = path.join(DATA_DIR, `card-${crypto.randomBytes(8).toString('hex')}.json`);
  try {
    const out = await link(['spend-request', 'retrieve', p.external_id, '--include', 'card', '--output-file', file, '--force', '--format', 'json']);
    const status = /"status"\s*:\s*"([a-z_]+)"/.exec(out)?.[1] ?? 'unknown';
    const card = fs.existsSync(file) ? findCard(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
    if (!card) return { status };
    db().prepare("update payments set status = 'ready' where id = ?").run(id);
    return { status, card: { ...card, last4: card.number.slice(-4) } };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

export async function cancelPayment(id: number, fetchImpl: typeof fetch): Promise<void> {
  const p = db().prepare('select * from payments where id = ?').get(id) as unknown as Payment | undefined;
  if (!p) return;
  if (p.rail === 'issuing' && p.external_id && p.status === 'ready') {
    await stripe(fetchImpl, 'POST', `/v1/issuing/cards/${p.external_id}`, { status: 'canceled' });
  }
  db().prepare("update payments set status = 'cancelled' where id = ?").run(id);
}

// ---------- Tools ----------

const payInput = z.object({
  amount: z.number().positive().max(100000).describe('Total to pay, in whole currency units, including tax and shipping (e.g. 23.40).'),
  merchant: z.string().min(2).max(80).regex(/^[^-]/, 'Must not start with a dash'),
  merchant_url: z.url().refine((u) => /^https?:\/\//i.test(u), 'Must be a web address').describe('The shop\'s website or checkout page.'),
  reason: z.string().min(10).max(300).regex(/^[^-]/, 'Must not start with a dash').describe('What is being bought and why, in plain words. Shown to the user.'),
});
const toMinor = (amount: number) => Math.round(amount * 100);

const pay = defineTool({
  name: 'wallet_pay',
  description:
    'Ask to pay for something. The user is shown the amount and merchant and must approve; the amount is checked against ' +
    'limits they set. On approval a one-time card capped at that amount is prepared and shown only to the user, who ' +
    'finishes the checkout themselves. You never see card details, and you cannot fill in a checkout page.',
  schema: payInput,
  risk: 'money',
  available: () => getSettings().wallet.enabled && (!!linkCliPath() || isConnected('stripe')),
  label: (i) => `Preparing a payment to ${clip(i.merchant, 40)}`,
  check: (i) => overLimit(toMinor(i.amount)),
  card: (i) => {
    const w = getSettings().wallet;
    return {
      title: `Pay ${money(toMinor(i.amount), w.currency)} to ${clip(i.merchant, 40)}?`,
      rows: [
        { label: 'Site', value: new URL(i.merchant_url).host },
        { label: 'Left today after this', value: money(Math.max(0, w.perDay - spentToday() - toMinor(i.amount)), w.currency) },
      ],
      body: i.reason,
      warning: 'This sets up a one-time card for exactly this amount. You finish the checkout.',
      confirmLabel: 'Approve payment',
      done: `One-time card ready for ${clip(i.merchant, 40)}`,
    };
  },
  run: async (i, ctx) => {
    const w = getSettings().wallet;
    const minor = toMinor(i.amount);
    const blocked = overLimit(minor); // again, at the moment of spending
    if (blocked) throw new Error(blocked);

    if (linkCliPath()) {
      const context =
        `Purchase requested by the account owner through their personal agent and approved by them in the agent's app. ` +
        `${i.reason} Merchant: ${i.merchant}. The total will not exceed ${money(minor, w.currency)} including taxes and shipping.`;
      const out = await link([
        'spend-request', 'create',
        '--merchant-name', i.merchant, '--merchant-url', i.merchant_url,
        '--amount', String(minor), '--currency', w.currency,
        '--context', context, '--credential-type', 'card', '--request-approval', '--format', 'json',
      ]);
      const id = /lsrq_[A-Za-z0-9]+/.exec(out)?.[0];
      if (!id) throw new Error('Link did not return a spend request.');
      record({ amount: minor, currency: w.currency, merchant: i.merchant, reason: i.reason, rail: 'link', status: 'requested', external_id: id });
      return {
        requested: true,
        next: 'A one-time card was requested from the user\'s Link wallet. They confirm it in the Link app, then open Wallet in the menu here to see the card and finish the checkout. Tell them that.',
      };
    }

    const holders = await stripe<{ data: { id: string }[] }>(ctx.fetch, 'GET', '/v1/issuing/cardholders', { status: 'active', limit: '1' }, ctx.signal);
    const cardholder = holders.data[0]?.id;
    if (!cardholder) throw new Error('This Stripe account has no active Issuing cardholder. Issuing has to be set up in the Stripe Dashboard first.');
    const params: Record<string, string> = {
      cardholder, currency: w.currency, type: 'virtual', status: 'active',
      'spending_controls[spending_limits][0][amount]': String(minor),
      'spending_controls[spending_limits][0][interval]': 'per_authorization',
      'metadata[created_by]': 'arlo', 'metadata[merchant]': i.merchant,
    };
    let singleUse = true;
    let card: { id: string; last4: string };
    try {
      card = await stripe(ctx.fetch, 'POST', '/v1/issuing/cards', { ...params, 'lifecycle_controls[cancel_after][payment_count]': '1' }, ctx.signal);
    } catch (err) {
      if ((err as { code?: string }).code !== 'parameter_unknown') throw err;
      singleUse = false; // older API version: capped per charge, but stays open until cancelled
      card = await stripe(ctx.fetch, 'POST', '/v1/issuing/cards', params, ctx.signal);
    }
    record({ amount: minor, currency: w.currency, merchant: i.merchant, reason: i.reason, rail: 'issuing', status: 'ready', external_id: card.id });
    return {
      ready: true,
      card_ending: card.last4,
      next:
        'The one-time card is ready under Wallet in the menu. Only the user can see the number; they finish the checkout themselves. Tell them that.' +
        (singleUse ? '' : ' This card does not close by itself, so remind them to cancel it in Wallet after paying.'),
    };
  },
});

const balance = defineTool({
  name: 'stripe_balance',
  description: 'The balance of the user\'s Stripe account (available and pending).',
  schema: z.object({}),
  risk: 'read',
  needs: 'stripe',
  label: () => 'Checking your Stripe balance',
  run: async (_i, ctx) => {
    const b = await stripe<{ available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] }>(ctx.fetch, 'GET', '/v1/balance', {}, ctx.signal);
    return { available: b.available.map((x) => money(x.amount, x.currency)), pending: b.pending.map((x) => money(x.amount, x.currency)) };
  },
});

const payments = defineTool({
  name: 'stripe_payments',
  description: 'Recent payments received in the user\'s Stripe account.',
  schema: z.object({ limit: z.number().int().min(1).max(25).default(10) }),
  risk: 'read',
  needs: 'stripe',
  untrusted: true, // descriptions and customer text come from other people
  label: () => 'Looking at recent Stripe payments',
  run: async (i, ctx) => {
    const res = await stripe<{ data: { id: string; amount: number; currency: string; status: string; description: string | null; created: number }[] }>(
      ctx.fetch, 'GET', '/v1/payment_intents', { limit: String(i.limit) }, ctx.signal,
    );
    return res.data.map((p) => ({
      id: p.id, amount: money(p.amount, p.currency), status: p.status, description: p.description,
      date: new Date(p.created * 1000).toISOString().slice(0, 10),
    }));
  },
});

const paymentLink = defineTool({
  name: 'stripe_payment_link',
  description: 'Create a Stripe payment link the user can send to someone to get paid a fixed amount.',
  schema: z.object({ name: z.string().min(2).max(120).describe('What the payment is for.'), amount: z.number().positive().max(1000000), currency: z.string().length(3).default('usd') }),
  risk: 'confirm',
  needs: 'stripe',
  label: () => 'Creating a payment link',
  card: (i) => ({
    title: 'Create this payment link?',
    rows: [{ label: 'For', value: i.name }, { label: 'Amount', value: money(toMinor(i.amount), i.currency) }],
    confirmLabel: 'Create link',
    done: 'Payment link created',
  }),
  run: async (i, ctx) => {
    const price = await stripe<{ id: string }>(ctx.fetch, 'POST', '/v1/prices', {
      unit_amount: String(toMinor(i.amount)), currency: i.currency.toLowerCase(), 'product_data[name]': i.name,
    }, ctx.signal);
    const made = await stripe<{ url: string }>(ctx.fetch, 'POST', '/v1/payment_links', {
      'line_items[0][price]': price.id, 'line_items[0][quantity]': '1',
    }, ctx.signal);
    return { url: made.url };
  },
});

const refund = defineTool({
  name: 'stripe_refund',
  description: 'Refund a payment received in the user\'s Stripe account, fully or partly. Money leaves the account, so the user must approve.',
  schema: z.object({
    payment_intent: z.string().regex(/^pi_[A-Za-z0-9]+$/),
    amount: z.number().positive().optional().describe('Leave out to refund in full.'),
    currency: z.string().length(3).default('usd'),
    why: z.string().min(5).max(200),
  }),
  risk: 'money',
  needs: 'stripe',
  label: () => 'Preparing a refund',
  card: (i) => ({
    title: i.amount ? `Refund ${money(toMinor(i.amount), i.currency)}?` : 'Refund this payment in full?',
    rows: [{ label: 'Payment', value: i.payment_intent }],
    body: i.why,
    warning: 'Refunds can\'t be undone.',
    confirmLabel: 'Refund',
    done: 'Refund issued',
  }),
  run: async (i, ctx) => {
    const res = await stripe<{ id: string; status: string }>(ctx.fetch, 'POST', '/v1/refunds', {
      payment_intent: i.payment_intent, ...(i.amount ? { amount: String(toMinor(i.amount)) } : {}),
    }, ctx.signal);
    return { refunded: true, id: res.id, status: res.status };
  },
});

export const walletTools = [pay, balance, payments, paymentLink, refund];
