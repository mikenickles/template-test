import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Assistant from './Assistant';
import { popBack } from './back';
import type { AppData } from './data';
import { IWave } from './icons';
import Menu from './Menu';
import { NavCtx, TABS, type Nav } from './nav';
import Calendar from './screens/Calendar';
import { GroceriesScreen, MealsScreen } from './screens/Food';
import Home from './screens/Home';
import Settings from './screens/Settings';
import Stock from './screens/Stock';
import Tasks from './screens/Tasks';
import { useStore } from './store';
import { ease, setHaptics, spring, tap } from './ui';
import { setPersonNames, type Tab } from './voice';

export default function App() {
  const { act, data } = useStore();
  const settings = data.settings;
  const [menuOpen, setMenuOpen] = useState(false);

  // Settings that live outside React: assistant names and vibration.
  useEffect(() => { setPersonNames(settings.names); }, [settings.names]);
  useEffect(() => { setHaptics(settings.haptics); }, [settings.haptics]);
  const [tab, setTab] = useState<Tab>('home');
  const [dir, setDir] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string; undo?: AppData } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const go = useCallback((t: Tab) => {
    setDir(Math.sign(TABS.indexOf(t) - TABS.indexOf(tabRef.current)));
    setTab(t);
  }, []);

  const showToast = useCallback((msg: string, undo?: AppData) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const nav = useMemo<Nav>(() => ({ tab, go, toast: showToast, openVoice: () => setVoiceOpen(true), openMenu: () => { setVoiceOpen(false); setMenuOpen(true); } }), [tab, go, showToast]);

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

  const screens: Record<Tab, React.ReactElement> = {
    home: <Home />, stock: <Stock />, calendar: <Calendar />, tasks: <Tasks />,
    groceries: <GroceriesScreen />, meals: <MealsScreen />, settings: <Settings />
  };
  const screen = screens[tab];

  return (
    <NavCtx.Provider value={nav}>
      <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
      <div className={'app' + (settings.reduceMotion ? ' calm' : '')} data-testid="app" data-tab={tab}>
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

        {/* Live voice button — always visible at the bottom of every screen */}
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

        <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />

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
      </MotionConfig>
    </NavCtx.Provider>
  );
}
