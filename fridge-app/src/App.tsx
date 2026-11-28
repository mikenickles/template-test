import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Assistant from './Assistant';
import { popBack } from './back';
import type { AppData } from './data';
import { ICalendar, IFood, IFridge, IHome, ITasks, IWave } from './icons';
import { NavCtx, TABS, type FoodView, type Nav } from './nav';
import Calendar from './screens/Calendar';
import Food from './screens/Food';
import Home from './screens/Home';
import Stock from './screens/Stock';
import Tasks from './screens/Tasks';
import { useStore } from './store';
import { ease, spring, tap } from './ui';
import type { Tab } from './voice';

const TAB_META: { id: Tab; label: string; Icon: typeof IHome }[] = [
  { id: 'home', label: 'Home', Icon: IHome },
  { id: 'stock', label: 'Stock', Icon: IFridge },
  { id: 'calendar', label: 'Calendar', Icon: ICalendar },
  { id: 'tasks', label: 'Tasks', Icon: ITasks },
  { id: 'food', label: 'Food', Icon: IFood }
];

export default function App() {
  const { act } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [food, setFood] = useState<FoodView>('meals');
  const [dir, setDir] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string; undo?: AppData } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const go = useCallback((t: Tab, f?: FoodView) => {
    setDir(Math.sign(TABS.indexOf(t) - TABS.indexOf(tabRef.current)));
    if (f) setFood(f);
    setTab(t);
  }, []);

  const showToast = useCallback((msg: string, undo?: AppData) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const nav = useMemo<Nav>(() => ({ tab, food, go, setFood, toast: showToast, openVoice: () => setVoiceOpen(true) }), [tab, food, go, showToast]);

  // Android hardware back: close the top sheet, else go Home, else leave the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      if (popBack()) return;
      if (tabRef.current !== 'home') { go('home'); return; }
      CapApp.exitApp();
    });
    return () => { h.then((x) => x.remove()); };
  }, [go]);

  const screen = tab === 'home' ? <Home /> : tab === 'stock' ? <Stock /> : tab === 'calendar' ? <Calendar /> : tab === 'tasks' ? <Tasks /> : <Food />;

  return (
    <NavCtx.Provider value={nav}>
      <div className="app" data-testid="app" data-tab={tab}>
        <div className="blobs" aria-hidden><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>

        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={tab} custom={dir} style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 44, scale: d === 0 ? 0.98 : 1 }),
              center: { opacity: 1, x: 0, scale: 1 },
              exit: (d: number) => ({ opacity: 0, x: d * -44, scale: d === 0 ? 0.98 : 1 })
            }}
            initial="enter" animate="center" exit="exit" transition={{ duration: 0.34, ease }}>
            {screen}
          </motion.div>
        </AnimatePresence>

        <Assistant open={voiceOpen} onClose={() => setVoiceOpen(false)} onListening={setListening} />

        {/* Live voice button — always visible above the tab bar */}
        <div className="voice-wrap">
          <AnimatePresence>
            {listening && [0, 1].map((i) => (
              <motion.span key={'ring' + i} className="voice-ring" initial={{ scale: 1, opacity: 0.55 }} animate={{ scale: 1.9, opacity: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }} />
            ))}
          </AnimatePresence>
          <motion.button className={'voice' + (voiceOpen ? ' on' : '')} aria-label="Talk to Home assistant" aria-expanded={voiceOpen} data-testid="voice"
            onClick={() => { tap('medium'); setVoiceOpen((v) => !v); }} whileTap={{ scale: 0.88 }}
            initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }}>
            <motion.span animate={listening ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={listening ? { duration: 0.9, repeat: Infinity } : spring} style={{ display: 'flex' }}>
              <IWave size={26} color={voiceOpen ? '#FFFFFF' : '#4F5BD5'} />
            </motion.span>
          </motion.button>
        </div>

        <nav className="tabbar" aria-label="Main">
          {TAB_META.map(({ id, label, Icon }) => {
            const on = tab === id;
            return (
              <button key={id} className={'tab' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} data-testid={'tab-' + id}
                onClick={() => { if (!on) { tap(); go(id); } }}>
                <span className="tab-pill">
                  {on && <motion.span layoutId="tab-pill" className="tab-pill-bg" transition={spring} />}
                  <motion.span key={on ? 'on' : 'off'} style={{ position: 'relative', display: 'flex' }} initial={on ? { scale: 0.7, y: 2 } : false} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
                    <Icon size={22} color={on ? '#4F5BD5' : '#66656D'} />
                  </motion.span>
                </span>
                {label}
              </button>
            );
          })}
        </nav>

        <div id="overlay-root" className="overlay-root" />

        <AnimatePresence>
          {toast && (
            <motion.div key={toast.id} className="toast" role="status" data-testid="toast" initial={{ y: -80, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -80, opacity: 0 }} transition={spring}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} onDragEnd={(_, i) => { if (i.offset.y < -30) setToast(null); }}>
              <span className="grow">{toast.msg}</span>
              {toast.undo && <button onClick={() => { act.restore(toast.undo!); setToast(null); tap(); }} data-testid="undo">Undo</button>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </NavCtx.Provider>
  );
}
