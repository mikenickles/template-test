import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { CATEGORY_ORDER, categorize, categoryFor, WHERE_LABEL, type StockItem, type Where } from '../data';
import { ITrash } from '../icons';
import { useStore } from '../store';
import { FabPlus, Field, Press, Segmented, Sheet, ease, spring, tap } from '../ui';

const KEYS: Where[] = ['fridge', 'freezer', 'pantry'];

export default function Stock() {
  const { data, act } = useStore();
  const [tab, setTab] = useState<Where>('fridge');
  const [dir, setDir] = useState(1);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [flash, setFlash] = useState('');
  const scroller = useRef<HTMLElement>(null);

  const pick = (w: Where) => {
    setDir(KEYS.indexOf(w) > KEYS.indexOf(tab) ? 1 : -1);
    setTab(w);
    setFlash('');
    scroller.current?.scrollTo({ top: 0 });
  };

  const groups = useMemo(() => {
    const by: Record<string, StockItem[]> = {};
    data.stock.filter((s) => s.where === tab).forEach((s) => { (by[categoryFor(s)] ||= []).push(s); });
    const rank = (c: string) => { const k = CATEGORY_ORDER.indexOf(c); return k < 0 ? 99 : k; };
    return Object.keys(by).sort((a, b) => rank(a) - rank(b)).map((c) => ({ name: c, items: by[c] }));
  }, [data.stock, tab]);

  const lowCount = data.stock.filter((s) => s.qty <= s.low).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    if (!nm) return;
    const q = Math.max(1, parseInt(qty, 10) || 1);
    const c = categorize(nm);
    const item = act.stockAdd(nm, q, '', c.where || tab);
    if (item.where !== tab) { setDir(KEYS.indexOf(item.where) > KEYS.indexOf(tab) ? 1 : -1); setTab(item.where); }
    setFlash('Added ' + item.name + ' to ' + WHERE_LABEL[item.where] + (c.category !== 'Other' ? ' · ' + c.category : ''));
    setName(''); setQty('1'); setAdding(false);
    tap('medium');
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="col" style={{ gap: 2 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={flash || 'default'} className="kicker" data-testid="stock-summary" style={{ color: flash ? '#23704A' : undefined }}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
              {flash || data.stock.length + ' items in the kitchen' + (lowCount ? ' · ' + lowCount + ' running low' : '')}
            </motion.span>
          </AnimatePresence>
          <h1 className="title">Stock</h1>
        </div>
        <Segmented label="Location" value={tab} onChange={pick} testId="stock-tabs"
          options={KEYS.map((k) => ({ value: k, label: WHERE_LABEL[k], count: data.stock.filter((s) => s.where === k).length }))} />
      </header>

      <main className="scroll noscroll" ref={scroller}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={tab} custom={dir} className="col" style={{ gap: 20 }}
            variants={{ enter: (d: number) => ({ opacity: 0, x: 40 * d }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: -40 * d }) }}
            initial="enter" animate="center" exit="exit" transition={{ duration: 0.38, ease }}>
            {groups.map((g) => (
              <motion.section key={g.name} layout="position" aria-label={g.name} className="col" style={{ gap: 8 }} transition={spring}>
                <div className="row" style={{ padding: '0 4px', gap: 8, alignItems: 'baseline' }}>
                  <h2 className="label">{g.name}</h2>
                  <span className="small muted">{g.items.length}</span>
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <AnimatePresence initial={false}>
                    {g.items.map((it, j) => <StockRow key={it.id} it={it} first={j === 0} />)}
                  </AnimatePresence>
                </div>
              </motion.section>
            ))}
            {!groups.length && <div className="muted" style={{ textAlign: 'center', padding: 40 }}>Nothing in the {WHERE_LABEL[tab].toLowerCase()} yet.</div>}
          </motion.div>
        </AnimatePresence>
      </main>

      <FabPlus open={adding} onClick={() => setAdding(!adding)} label="Add item" testId="stock-add" />
      <Sheet open={adding} onClose={() => setAdding(false)} label="Add to stock" testId="stock-sheet">
        <form onSubmit={submit} className="col" style={{ gap: 12 }}>
          <h2 className="sheet-title">Add to stock</h2>
          <div className="row" style={{ gap: 8 }}>
            <Field id="stock-name" label="Item name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Like strawberries or frozen peas" autoFocus enterKeyHint="done" />
            <div style={{ width: 72, flexShrink: 0 }}><Field id="stock-qty" label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" style={{ textAlign: 'center' }} /></div>
          </div>
          <AnimatePresence>
            {name.trim() && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="small muted" style={{ padding: '0 4px' }} data-testid="stock-guess">
                Goes in the {WHERE_LABEL[categorize(name).where || tab].toLowerCase()} · {categorize(name).category}
              </motion.div>
            )}
          </AnimatePresence>
          <button type="submit" className="btn-primary" disabled={!name.trim()}>Add to stock</button>
        </form>
      </Sheet>
    </div>
  );
}

function StockRow({ it, first }: { it: StockItem; first: boolean }) {
  const { act } = useStore();
  const low = it.qty <= it.low;
  return (
    <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }} transition={spring}
      style={{ overflow: 'hidden', borderTop: first ? 0 : '1px solid rgba(46,52,92,0.07)' }} data-testid="stock-row" data-name={it.name}>
      <div className="row" style={{ padding: '8px 8px 8px 16px', minHeight: 60 }}>
        <div className="col grow" style={{ gap: 3 }}>
          <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>{it.name}</span>
          <div className="row" style={{ gap: 6 }}>
            <AnimatePresence>
              {low && <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}
                style={{ fontSize: 11, fontWeight: 600, color: '#9A5B00', background: '#FFF3DE', padding: '2px 7px', borderRadius: 7, flexShrink: 0 }}>{it.qty === 0 ? 'Out' : 'Low'}</motion.span>}
            </AnimatePresence>
            <span className="ellipsis small muted">{it.note || WHERE_LABEL[it.where]}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 0, background: 'rgba(46,52,92,0.05)', borderRadius: 12, flexShrink: 0 }}>
          <AnimatePresence mode="wait" initial={false}>
            {it.qty === 0 ? (
              <motion.span key="trash" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring}>
                <Press className="icon-btn" label={'Remove ' + it.name} onClick={() => { tap('medium'); act.stockRemove(it.id); }}><ITrash size={17} color="#B4372D" /></Press>
              </motion.span>
            ) : (
              <motion.span key="minus" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring}>
                <Press className="icon-btn" label={'Decrease ' + it.name} onClick={() => { tap(); act.stockChange(it.id, -1); }}><span style={{ fontSize: 22, lineHeight: 1 }}>−</span></Press>
              </motion.span>
            )}
          </AnimatePresence>
          <span className="tnum" style={{ minWidth: 48, textAlign: 'center', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }} data-testid="stock-qty">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={it.qty} style={{ display: 'inline-block' }} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.2 }}>
                {it.unit ? it.qty + ' ' + it.unit : it.qty}
              </motion.span>
            </AnimatePresence>
          </span>
          <Press className="icon-btn" label={'Increase ' + it.name} onClick={() => { tap(); act.stockChange(it.id, 1); }}><span style={{ fontSize: 22, lineHeight: 1 }}>+</span></Press>
        </div>
      </div>
    </motion.div>
  );
}
