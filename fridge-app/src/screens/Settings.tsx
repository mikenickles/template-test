import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, PEOPLE, PERSON_IDS, STORE_IDS, STORES } from '../data';
import { TitleBar } from '../Menu';
import { useNav } from '../nav';
import { useStore } from '../store';
import { Press, Segmented, Sheet, Switch, ease, riseItem, spring, stagger, tap } from '../ui';

type Confirm = 'fresh' | 'sample' | null;

export default function Settings() {
  return (
    <div className="screen" data-testid="settings">
      <SettingsBody />
    </div>
  );
}

function SettingsBody() {
  const { data, act } = useStore();
  const nav = useNav();
  const s = data.settings;
  const [confirm, setConfirm] = useState<Confirm>(null);

  const setName = (k: keyof typeof s.names, v: string) => act.settingsSet({ names: { ...s.names, [k]: v.slice(0, 16) } });

  const doConfirm = () => {
    const before = act.snapshot();
    if (confirm === 'fresh') { act.clearAll(); nav.toast('All lists cleared', before); }
    if (confirm === 'sample') { act.reset(); nav.toast('Sample data restored', before); }
    tap('medium');
    setConfirm(null);
  };

  return (
    <>
      <header className="screen-head" style={{ paddingBottom: 6 }}>
        <TitleBar kicker={<span className="kicker">Family, shopping and app preferences</span>} title="Settings" />
      </header>

      <motion.main className="scroll noscroll" style={{ paddingBottom: 'calc(var(--sab) + 110px)', display: 'flex', flexDirection: 'column', gap: 22 }}
        variants={stagger} initial="hidden" animate="show">

        <Section title="Family" note="These names are used across the app, and the assistant understands them.">
          {PERSON_IDS.map((k, i) => {
            const p = PEOPLE[k];
            return (
              <Row key={k} first={i === 0}>
                <span style={{ width: 34, height: 34, borderRadius: 17, background: p.tint, color: p.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {(s.names[k].trim() || p.name)[0]?.toUpperCase()}
                </span>
                <label htmlFor={'name-' + k} className="sr-only">Name for {p.name}</label>
                <input id={'name-' + k} className="field" value={s.names[k]} placeholder={DEFAULT_SETTINGS.names[k]}
                  onChange={(e) => setName(k, e.target.value)} onBlur={(e) => { if (!e.target.value.trim()) setName(k, DEFAULT_SETTINGS.names[k]); }}
                  enterKeyHint="done" autoCapitalize="words" style={{ height: 44, background: 'transparent', paddingLeft: 6 }} />
              </Row>
            );
          })}
        </Section>

        <Section title="Groceries" note="New items go here unless you pick another store.">
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Default store</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-label="Default store">
              {STORE_IDS.map((k) => {
                const st = STORES[k], on = s.defaultStore === k;
                return (
                  <motion.button key={k} role="radio" aria-checked={on} onClick={() => { tap(); act.settingsSet({ defaultStore: k }); }} whileTap={{ scale: 0.94 }}
                    animate={{ backgroundColor: on ? st.dot : st.tint, color: on ? '#FFFFFF' : st.text }} transition={{ duration: 0.25 }}
                    style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>{st.name}</motion.button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="Home screen">
          <Row first>
            <RowText title="Show weather" sub="Uses your location for the forecast" />
            <Switch on={s.weather} onChange={(v) => act.settingsSet({ weather: v })} label="Show weather" testId="set-weather" />
          </Row>
          <AnimatePresence initial={false}>
            {s.weather && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} style={{ overflow: 'hidden' }}>
                <Row>
                  <RowText title="Temperature" />
                  <div style={{ width: 150 }}>
                    <Segmented label="Temperature units" value={s.units} onChange={(v) => act.settingsSet({ units: v })} testId="set-units"
                      options={[{ value: 'F', label: '°F' }, { value: 'C', label: '°C' }]} />
                  </div>
                </Row>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        <Section title="Feel">
          <Row first>
            <RowText title="Vibrate on taps" sub="Small buzzes when you check things off" />
            <Switch on={s.haptics} onChange={(v) => act.settingsSet({ haptics: v })} label="Vibrate on taps" testId="set-haptics" />
          </Row>
          <Row>
            <RowText title="Reduce motion" sub="Calmer transitions and no drifting background" />
            <Switch on={s.reduceMotion} onChange={(v) => act.settingsSet({ reduceMotion: v })} label="Reduce motion" testId="set-motion" />
          </Row>
        </Section>

        <Section title="Your data" note="Everything is saved only on this phone.">
          <Row first>
            <RowText title="Start fresh" sub="Empty stock, groceries, tasks, calendar and meal plan" />
            <Press className="btn-soft" onClick={() => setConfirm('fresh')} testId="set-fresh" style={{ color: '#B4372D' }}>Clear</Press>
          </Row>
          <Row>
            <RowText title="Sample data" sub="Bring back the example family" />
            <Press className="btn-soft" onClick={() => setConfirm('sample')} testId="set-sample">Restore</Press>
          </Row>
        </Section>

        <motion.p variants={riseItem} className="small muted" style={{ textAlign: 'center' }}>Family Fridge 1.0</motion.p>
      </motion.main>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} label="Confirm" testId="confirm-sheet">
        <div className="col" style={{ gap: 14 }}>
          <h2 className="sheet-title">{confirm === 'fresh' ? 'Clear all lists?' : 'Restore the sample data?'}</h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
            {confirm === 'fresh'
              ? 'This empties stock, groceries, tasks, the calendar and the meal plan. Your settings stay. You can undo right after.'
              : 'This replaces everything with the example family’s lists. Your settings stay. You can undo right after.'}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-soft grow" style={{ height: 48 }} onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-primary grow" data-testid="confirm-yes" onClick={doConfirm} style={confirm === 'fresh' ? { background: '#B4372D', boxShadow: '0 10px 24px rgba(180,55,45,0.25)' } : undefined}>
              {confirm === 'fresh' ? 'Clear everything' : 'Restore'}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <motion.section variants={riseItem} aria-label={title} className="col" style={{ gap: 8, flexShrink: 0 }}>
      <h2 className="label" style={{ padding: '0 4px' }}>{title}</h2>
      <div className="card" style={{ overflow: 'hidden' }}>{children}</div>
      {note && <p className="small muted" style={{ padding: '0 6px', lineHeight: 1.4 }}>{note}</p>}
    </motion.section>
  );
}

function Row({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <motion.div layout transition={spring} className="row" style={{ minHeight: 60, padding: '8px 12px 8px 16px', gap: 12, borderTop: first ? 0 : '1px solid rgba(46,52,92,0.07)' }}>
      {children}
    </motion.div>
  );
}

function RowText({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="col grow" style={{ gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}
