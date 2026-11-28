import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type AppData, type CalEvent, type Grocery, type PersonId, type Settings, type StockItem, type StoreId, type Task, type Where,
  DEFAULT_SETTINGS, categorize, capitalize, inStock, peopleFor, seedData, uid
} from './data';

const KEY = 'family-fridge:data:v1';

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as AppData;
      // Data saved before settings existed gets the defaults filled in.
      if (d && d.version === 1 && Array.isArray(d.stock)) {
        const st = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
        return { ...d, settings: { ...st, names: { ...DEFAULT_SETTINGS.names, ...(st.names || {}) } } };
      }
    }
  } catch { /* fall through to seed */ }
  return seedData();
}

export interface Actions {
  // stock
  stockAdd(name: string, qty?: number, unit?: string, where?: Where | null): StockItem;
  stockChange(id: string, delta: number): void;
  stockRemove(id: string): void;
  stockOut(name: string): boolean;
  // groceries
  groceryAdd(name: string, qty?: string, store?: StoreId): Grocery;
  groceryToggle(id: string): void;
  groceryRemove(id: string): void;
  groceriesPutAway(): number;
  // tasks
  taskAdd(who: PersonId, title: string, due?: string): Task;
  taskToggle(id: string): void;
  taskRemove(id: string): void;
  taskSetDone(id: string, done: boolean): void;
  // calendar
  eventAdd(e: Omit<CalEvent, 'id'>): CalEvent;
  eventRemove(id: string): void;
  // meals
  planSet(key: string, meal: string | null): void;
  // settings & data
  settingsSet(patch: Partial<Settings>): void;
  clearAll(): void;
  snapshot(): AppData;
  restore(d: AppData): void;
  reset(): void;
}

interface Ctx { data: AppData; act: Actions; }
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  const ref = useRef(data);
  ref.current = data;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  }, [data]);

  const set = useCallback((fn: (d: AppData) => AppData) => {
    const next = fn(ref.current);
    ref.current = next;
    setData(next);
  }, []);

  const act = useMemo<Actions>(() => ({
    stockAdd(name, qty = 1, unit = '', where = null) {
      const c = categorize(name);
      const item: StockItem = { id: uid('st'), name: capitalize(name.trim()), qty, unit, low: 0, note: 'Added today', where: where || c.where || 'pantry' };
      set((d) => {
        const existing = d.stock.find((s) => s.name.toLowerCase() === item.name.toLowerCase() && s.where === item.where);
        if (existing) {
          item.id = existing.id;
          return { ...d, stock: d.stock.map((s) => (s.id === existing.id ? { ...s, qty: s.qty + qty, note: 'Restocked today' } : s)) };
        }
        return { ...d, stock: [item, ...d.stock] };
      });
      return item;
    },
    stockChange(id, delta) {
      set((d) => ({ ...d, stock: d.stock.map((s) => (s.id === id ? { ...s, qty: Math.max(0, s.qty + delta) } : s)) }));
    },
    stockRemove(id) { set((d) => ({ ...d, stock: d.stock.filter((s) => s.id !== id) })); },
    stockOut(name) {
      const n = name.toLowerCase();
      let hit = false;
      set((d) => ({
        ...d,
        stock: d.stock.map((s) => {
          if (s.name.toLowerCase() === n || inStock([s], name)) { hit = true; return { ...s, qty: 0 }; }
          return s;
        })
      }));
      return hit;
    },
    groceryAdd(name, qty = '1', store = 'safeway') {
      const g: Grocery = { id: uid('g'), name: capitalize(name.trim()), qty: qty.trim() || '1', store, got: false };
      set((d) => {
        const dup = d.groceries.find((x) => !x.got && x.name.toLowerCase() === g.name.toLowerCase());
        if (dup) { g.id = dup.id; return d; }
        return { ...d, groceries: [g, ...d.groceries] };
      });
      return g;
    },
    groceryToggle(id) { set((d) => ({ ...d, groceries: d.groceries.map((g) => (g.id === id ? { ...g, got: !g.got } : g)) })); },
    groceryRemove(id) { set((d) => ({ ...d, groceries: d.groceries.filter((g) => g.id !== id) })); },
    groceriesPutAway() {
      const got = ref.current.groceries.filter((g) => g.got);
      set((d) => {
        let stock = d.stock;
        got.forEach((g) => {
          const qty = parseInt(g.qty, 10) || 1;
          const unit = g.qty.replace(/^\s*\d+\s*/, '').trim();
          const c = categorize(g.name);
          const where = c.where || 'pantry';
          const ex = stock.find((s) => s.name.toLowerCase() === g.name.toLowerCase());
          if (ex) stock = stock.map((s) => (s.id === ex.id ? { ...s, qty: s.qty + qty, note: 'Restocked today' } : s));
          else stock = [{ id: uid('st'), name: g.name, qty, unit, low: 0, note: 'Bought today', where }, ...stock];
        });
        return { ...d, stock, groceries: d.groceries.filter((g) => !g.got) };
      });
      return got.length;
    },
    taskAdd(who, title, due = 'Today') {
      const t: Task = { id: uid('t'), who, title: capitalize(title.trim()), due, done: false };
      set((d) => ({ ...d, tasks: [t, ...d.tasks] }));
      return t;
    },
    taskToggle(id) { set((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })); },
    taskSetDone(id, done) { set((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done } : t)) })); },
    taskRemove(id) { set((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) })); },
    eventAdd(e) {
      const ev: CalEvent = { ...e, id: uid('e'), title: capitalize(e.title.trim()) };
      set((d) => ({ ...d, events: [...d.events, ev] }));
      return ev;
    },
    eventRemove(id) {
      set((d) => (id.includes('@') ? { ...d, skipped: [...d.skipped, id] } : { ...d, events: d.events.filter((e) => e.id !== id) }));
    },
    planSet(key, meal) {
      set((d) => {
        const plan = { ...d.plan };
        if (meal) plan[key] = meal; else delete plan[key];
        return { ...d, plan };
      });
    },
    settingsSet(patch) { set((d) => ({ ...d, settings: { ...d.settings, ...patch } })); },
    clearAll() { set((d) => ({ ...d, stock: [], groceries: [], tasks: [], events: [], skipped: [], plan: {}, noRoutines: true })); },
    snapshot() { return ref.current; },
    restore(d) { set(() => d); },
    reset() { set((d) => ({ ...seedData(), settings: d.settings })); }
  }), [set]);

  const value = useMemo(() => ({ data, act }), [data, act]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}

/** People (colors + the family's own names). */
export function usePeople() {
  const { data } = useStore();
  return useMemo(() => peopleFor(data.settings), [data.settings]);
}
