import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { inStock, RECIPES, STORE_IDS, STORES, type Recipe, type StoreId } from '../data';
import { addDays, dateKey, DOW_SHORT, today } from '../dates';
import { IClose, ISpark } from '../icons';
import { TitleBar } from '../Menu';
import { useNav } from '../nav';
import { useStore } from '../store';
import { Check, FabPlus, Field, Press, Sheet, ease, spring, tap, useTimeout } from '../ui';

export function MealsScreen() {
  return (
    <div className="screen">
      <header className="screen-head" style={{ paddingBottom: 8 }}>
        <TitleBar kicker={<span className="kicker">Dinner ideas from what you have</span>} title="Meals" />
      </header>
      <Meals />
    </div>
  );
}

export function GroceriesScreen() {
  const { data } = useStore();
  const toBuy = data.groceries.filter((g) => !g.got);
  const stores = new Set(toBuy.map((g) => g.store)).size;
  return (
    <div className="screen">
      <header className="screen-head" style={{ paddingBottom: 8 }}>
        <TitleBar kicker={<span className="kicker" data-testid="groceries-summary">{toBuy.length} items · {stores} {stores === 1 ? 'store' : 'stores'}</span>} title="Groceries" />
      </header>
      <Groceries />
    </div>
  );
}

/* ---------------- Meals ---------------- */

const FILTERS: [string, string][] = [['quick', 'Under 30 min'], ['kid', 'Kid-friendly'], ['veg', 'Vegetarian'], ['freezer', 'Uses the freezer']];

function shuffle<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function Meals() {
  const { data, act } = useStore();
  const nav = useNav();
  const [filter, setFilter] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(() => RECIPES.map((r) => r.id));
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(0);
  const later = useTimeout();
  const t = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));

  const ideas = useMemo(() => {
    const scored = order.map((id) => RECIPES.find((r) => r.id === id)!).filter((r) => !filter || r.tags.includes(filter))
      .map((r) => {
        const have = r.ingredients.filter((i) => inStock(data.stock, i));
        const need = r.ingredients.filter((i) => !inStock(data.stock, i));
        return { r, have, need };
      });
    // Prefer what you can make right now, keeping the shuffled order within each group.
    return scored.sort((a, b) => Math.min(a.need.length, 2) - Math.min(b.need.length, 2)).slice(0, 6);
  }, [order, filter, data.stock]);

  const generate = () => {
    if (loading) return;
    tap('medium');
    setLoading(true);
    later(() => { setOrder(shuffle(RECIPES.map((r) => r.id))); setRound((n) => n + 1); setLoading(false); }, 1100);
  };

  const plannedDay = (name: string) => days.find((d) => data.plan[dateKey(d)] === name);
  const addToPlan = (r: Recipe) => {
    const open = days.find((d) => !data.plan[dateKey(d)]);
    if (!open) { nav.toast('This week is fully planned'); return; }
    tap('medium');
    act.planSet(dateKey(open), r.name);
    nav.toast(r.name + ' planned for ' + (dateKey(open) === dateKey(t) ? 'tonight' : DOW_SHORT[(open.getDay() + 6) % 7]));
  };
  const addNeeds = (need: string[]) => {
    const before = act.snapshot();
    need.forEach((n) => act.groceryAdd(n, '1', data.settings.defaultStore));
    tap('medium');
    nav.toast('Added ' + need.length + ' to Groceries', before);
  };
  const onList = (need: string[]) => need.every((n) => data.groceries.some((g) => !g.got && g.name.toLowerCase() === n.toLowerCase()));

  return (
    <main className="scroll noscroll" style={{ padding: '4px 0 calc(var(--tabbar) + 104px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section aria-label="This week's dinners" className="noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 16px', flexShrink: 0 }} data-testid="plan">
        {days.map((d, i) => {
          const k = dateKey(d), meal = data.plan[k];
          return (
            <motion.div key={k} layout transition={spring} data-testid="plan-day" data-meal={meal || ''}
              style={{ flexShrink: 0, width: 112, height: 84, borderRadius: 18, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: meal ? 'rgba(255,255,255,0.68)' : 'transparent', border: meal ? '1px solid rgba(255,255,255,0.9)' : '1.5px dashed rgba(46,52,92,0.16)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? '#3D47B8' : '#66656D' }}>{i === 0 ? 'Tonight' : DOW_SHORT[(d.getDay() + 6) % 7] + ' ' + d.getDate()}</span>
                <AnimatePresence>
                  {meal && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>
                    <Press label={'Remove ' + meal} className="icon-btn" style={{ width: 32, height: 32, margin: '-9px -10px -9px 0' }} onClick={() => { tap(); act.planSet(k, null); }}><IClose size={12} color="#A9A8AE" /></Press>
                  </motion.span>}
                </AnimatePresence>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={meal || 'open'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}
                  style={{ fontSize: 13, fontWeight: meal ? 600 : 500, lineHeight: 1.25, color: meal ? '#1B1B1F' : '#66656D', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meal || 'Open'}</motion.span>
              </AnimatePresence>
            </motion.div>
          );
        })}
      </section>

      <div className="row" style={{ padding: '0 16px', justifyContent: 'space-between' }}>
        <span className="small muted">{loading ? 'Checking your fridge, freezer and pantry…' : ideas.length + ' ideas from what you have'}</span>
        <Press onClick={generate} testId="new-ideas" className="row" style={{ height: 40, gap: 7, borderRadius: 20, padding: '0 14px 0 11px', background: '#4F5BD5', color: '#fff', fontSize: 14, fontWeight: 600, boxShadow: '0 8px 20px rgba(79,91,213,0.3)' }}>
          <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : spring} style={{ display: 'flex' }}><ISpark size={16} color="#fff" /></motion.span>
          {loading ? 'Thinking…' : 'New ideas'}
        </Press>
      </div>

      <div className="noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px', flexShrink: 0 }}>
        {FILTERS.map(([k, label]) => {
          const on = filter === k;
          return <Press key={k} pressed={on} onClick={() => { tap(); setFilter(on ? null : k); }} className="pill" style={on ? { borderColor: '#4F5BD5', background: '#ECEEFB', color: '#2F3E9E' } : undefined}>{label}</Press>;
        })}
      </div>

      <div className="col" style={{ padding: '0 16px', gap: 12 }}>
        {loading ? [0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, height: 260 }}>
            <div className="shim" style={{ height: 100, margin: '-18px -18px 4px', borderRadius: '22px 22px 0 0' }} />
            <div className="shim" style={{ height: 20, width: '65%', borderRadius: 8 }} />
            <div className="shim" style={{ height: 14, width: '40%', borderRadius: 6 }} />
            <div className="grow" />
            <div className="shim" style={{ height: 44, borderRadius: 12 }} />
          </div>
        )) : ideas.map(({ r, have, need }, i) => {
          const pd = plannedDay(r.name);
          const listed = need.length > 0 && onList(need);
          return (
            <motion.article key={r.id + '-' + round + '-' + (filter || '')} className="card" data-testid="idea" data-name={r.name}
              initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.06, duration: 0.5, ease }}
              style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
              <div aria-hidden style={{ position: 'relative', height: 104, margin: '-18px -18px 2px', overflow: 'hidden', background: 'radial-gradient(circle at 80% 40%, ' + r.art[1] + ', ' + r.art[0] + ' 70%)' }}>
                <span style={{ position: 'absolute', left: 14, bottom: 12, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.75)' }}>{r.mins} min</span>
                <motion.svg width="130" height="130" viewBox="0 0 140 140" style={{ position: 'absolute', right: 12, top: -12 }} initial={{ rotate: -30, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.1 + i * 0.06, duration: 0.8, ease }}>
                  <circle cx="70" cy="76" r="58" fill="#2E3460" opacity="0.10" /><circle cx="70" cy="70" r="57" fill="#FFFFFF" /><circle cx="70" cy="70" r="47" fill="none" stroke="#ECEBF2" strokeWidth="1.5" />
                  <circle cx="70" cy="70" r="40" fill={r.art[2]} /><circle cx="55" cy="60" r="10" fill={r.art[3]} /><circle cx="85" cy="64" r="8" fill={r.art[4]} />
                  <circle cx="66" cy="86" r="9" fill={r.art[3]} /><circle cx="88" cy="86" r="6" fill={r.art[4]} /><circle cx="72" cy="52" r="5" fill={r.art[4]} />
                  <path d="M46 74 Q70 56 94 74" stroke="#FFFFFF" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
                </motion.svg>
              </div>
              <div className="col" style={{ gap: 4 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{r.name}</h2>
                <span style={{ fontSize: 13, color: '#66656D' }}>Serves {r.serves} · {need.length ? have.length + ' of ' + r.ingredients.length + ' in stock' : 'All in stock'}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {have.map((u) => <span key={u} style={{ fontSize: 12, fontWeight: 500, padding: '5px 9px', borderRadius: 9, background: '#E9F5EE', color: '#1F6A42' }}>{u}</span>)}
                {need.map((n) => <span key={n} style={{ fontSize: 12, fontWeight: 500, padding: '5px 9px', borderRadius: 9, background: '#FFF3DE', color: '#8A5200' }}>Need {n}</span>)}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Press onClick={() => !pd && addToPlan(r)} testId="plan-btn" className="grow"
                  style={{ height: 44, borderRadius: 12, fontSize: 14, fontWeight: 600, transition: 'background .3s, color .3s', background: pd ? '#ECEEFB' : '#4F5BD5', color: pd ? '#2F3E9E' : '#fff' }}>
                  {pd ? 'Planned · ' + (dateKey(pd) === dateKey(t) ? 'Tonight' : DOW_SHORT[(pd.getDay() + 6) % 7]) : 'Add to plan'}
                </Press>
                {need.length > 0 && (
                  <Press onClick={() => !listed && addNeeds(need)} testId="need-btn"
                    style={{ height: 44, padding: '0 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .3s, color .3s', border: '1px solid ' + (listed ? '#E9F5EE' : 'rgba(255,255,255,0.9)'), background: listed ? '#E9F5EE' : 'rgba(255,255,255,0.68)', color: listed ? '#1F6A42' : '#1B1B1F' }}>
                    {listed ? 'On the list' : 'Add ' + need.length + ' to groceries'}
                  </Press>
                )}
              </div>
            </motion.article>
          );
        })}
        {!loading && !ideas.length && <div className="muted" style={{ textAlign: 'center', padding: 30 }}>No ideas match that filter.</div>}
      </div>
    </main>
  );
}

/* ---------------- Groceries ---------------- */

function Groceries() {
  const { data, act } = useStore();
  const nav = useNav();
  const [filter, setFilter] = useState<'all' | StoreId>('all');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [store, setStore] = useState<StoreId>(data.settings.defaultStore);
  const checked = data.groceries.filter((g) => g.got).length;
  const stores = STORE_IDS.filter((k) => filter === 'all' || k === filter);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    act.groceryAdd(name, qty || '1', store);
    setName(''); setQty('');
    tap('medium');
    document.getElementById('g-name')?.focus();
  };
  const putAway = () => {
    const before = act.snapshot();
    const n = act.groceriesPutAway();
    tap('medium');
    nav.toast('Put away ' + n + (n === 1 ? ' item' : ' items') + ' into Stock', before);
  };

  return (
    <>
      <main className="scroll noscroll" style={{ padding: '4px 0 calc(var(--tabbar) + 104px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="tablist" aria-label="Store" className="noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px', flexShrink: 0 }}>
          {(['all', ...STORE_IDS] as ('all' | StoreId)[]).map((k) => {
            const on = filter === k;
            const left = data.groceries.filter((g) => !g.got && (k === 'all' || g.store === k)).length;
            const color = k === 'all' ? '#1B1B1F' : STORES[k].dot;
            return (
              <motion.button key={k} role="tab" aria-selected={on} onClick={() => { tap(); setFilter(k); }} className={'pill' + (on ? ' on' : '')} whileTap={{ scale: 0.94 }}
                style={{ position: 'relative', overflow: 'hidden', background: on ? 'transparent' : undefined }}>
                {on && <motion.span layoutId="store-pill" transition={spring} style={{ position: 'absolute', inset: 0, background: color, borderRadius: 20 }} />}
                <span style={{ position: 'relative' }}>{(k === 'all' ? 'All' : STORES[k].name) + ' · ' + left}</span>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {checked > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ padding: '0 16px', flexShrink: 0, overflow: 'hidden' }}>
              <Press onClick={putAway} testId="put-away" className="row" style={{ width: '100%', height: 48, borderRadius: 16, justifyContent: 'center', gap: 8, background: '#E9F5EE', color: '#1F6A42', fontSize: 14, fontWeight: 600, border: '1px solid rgba(255,255,255,0.9)' }}>
                Put away {checked} checked · add to Stock
              </Press>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="col" style={{ padding: '0 16px', gap: 12 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {stores.map((k) => {
              const s = STORES[k];
              const list = data.groceries.filter((g) => g.store === k).sort((a, b) => Number(a.got) - Number(b.got));
              const left = list.filter((g) => !g.got).length;
              return (
                <motion.section key={k} layout aria-label={s.name} className="card" style={{ overflow: 'hidden' }} data-testid="store-card"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring}>
                  <div className="row" style={{ padding: '16px 18px 8px' }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: s.tint, color: s.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{s.name[0]}</span>
                    <h2 className="grow" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{s.name}</h2>
                    <span className="tnum" style={{ fontSize: 13, color: '#66656D' }}>{left} left</span>
                  </div>
                  <div className="col" style={{ padding: '0 6px 8px' }}>
                    <AnimatePresence initial={false}>
                      {list.map((g) => (
                        <motion.div key={g.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, x: 40, transition: { duration: 0.25 } }} transition={spring} style={{ overflow: 'hidden' }} data-testid="grocery-row" data-name={g.name}>
                          <div className="row" style={{ gap: 4, minHeight: 52 }}>
                            <Check checked={g.got} onToggle={() => act.groceryToggle(g.id)} label={g.name} color={s.dot} />
                            <motion.span className="grow ellipsis" animate={{ color: g.got ? '#66656D' : '#1B1B1F' }} style={{ fontSize: 15, fontWeight: 500, textDecoration: g.got ? 'line-through' : 'none' }}>{g.name}</motion.span>
                            <span style={{ fontSize: 13, color: '#66656D', whiteSpace: 'nowrap' }}>{g.qty}</span>
                            <Press className="icon-btn" label={'Remove ' + g.name} onClick={() => { tap(); act.groceryRemove(g.id); }}><IClose size={15} color="#A9A8AE" /></Press>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {!list.length && <div style={{ padding: '14px 12px 12px', textAlign: 'center', fontSize: 14, color: '#66656D' }}>Nothing needed here.</div>}
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        </div>
      </main>

      <FabPlus open={adding} onClick={() => { setStore(filter === 'all' ? data.settings.defaultStore : filter); setAdding(!adding); }} label="Add item" testId="grocery-add" />
      <Sheet open={adding} onClose={() => setAdding(false)} label="Add grocery item" testId="grocery-sheet">
        <form onSubmit={submit} className="col" style={{ gap: 12 }}>
          <h2 className="sheet-title">Add to groceries</h2>
          <div className="row" style={{ gap: 8 }}>
            <Field id="g-name" label="Item" value={name} onChange={(e) => setName(e.target.value)} placeholder="What do we need?" autoFocus enterKeyHint="done" />
            <div style={{ width: 76, flexShrink: 0 }}><Field id="g-qty" label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" style={{ textAlign: 'center' }} /></div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#66656D' }}>Get it from</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STORE_IDS.map((k) => {
              const s = STORES[k], on = k === store;
              return (
                <motion.button type="button" key={k} aria-pressed={on} onClick={() => { tap(); setStore(k); }} whileTap={{ scale: 0.94 }}
                  animate={{ backgroundColor: on ? s.dot : s.tint, color: on ? '#FFFFFF' : s.text }} transition={{ duration: 0.25 }}
                  style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>{s.name}</motion.button>
              );
            })}
          </div>
          <button type="submit" className="btn-primary" disabled={!name.trim()}>Add to {STORES[store].name} list</button>
        </form>
      </Sheet>
    </>
  );
}
