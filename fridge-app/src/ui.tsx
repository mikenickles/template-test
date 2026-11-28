import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { useBackHandler } from './back';
import { now as nowDate } from './dates';

export const spring = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.9 };
export const softSpring = { type: 'spring' as const, stiffness: 260, damping: 28 };
export const ease = [0.32, 0.72, 0, 1] as const;

let hapticsOn = true;
/** Turned on/off from Settings. */
export function setHaptics(on: boolean) { hapticsOn = on; }

export function tap(style: 'light' | 'medium' = 'light') {
  if (!hapticsOn || !Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(() => undefined);
}

/** Pressable wrapper that squishes a touch on press. */
export function Press({ children, className, style, onClick, label, disabled, type = 'button', testId, pressed, current, expanded, role, checked, selected }: {
  children: ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void; label?: string; disabled?: boolean;
  type?: 'button' | 'submit'; testId?: string; pressed?: boolean; current?: boolean; expanded?: boolean; role?: string; checked?: boolean; selected?: boolean;
}) {
  return (
    <motion.button
      type={type}
      className={className}
      style={style}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-current={current ? 'page' : undefined}
      aria-expanded={expanded}
      aria-checked={checked}
      aria-selected={selected}
      role={role}
      disabled={disabled}
      data-testid={testId}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={spring}
    >
      {children}
    </motion.button>
  );
}

/** Segmented control with a springy sliding indicator. */
export function Segmented<T extends string>({ options, value, onChange, label, testId }: {
  options: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string; testId?: string;
}) {
  const id = useId();
  return (
    <div className="seg" role="tablist" aria-label={label} data-testid={testId}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={on} className={'seg-btn' + (on ? ' on' : '')} onClick={() => { if (!on) { tap(); onChange(o.value); } }}>
            {on && <motion.span layoutId={'seg-' + id} className="seg-ind" transition={spring} />}
            <span className="seg-label">{o.label}{o.count !== undefined && <span className="count tnum">{o.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Round checkbox whose tick draws itself in. */
export function Check({ checked, onToggle, label, color = '#4F5BD5', testId }: { checked: boolean; onToggle: () => void; label: string; color?: string; testId?: string }) {
  return (
    <button role="checkbox" aria-checked={checked} aria-label={label} className="check" onClick={() => { tap(); onToggle(); }} data-testid={testId}>
      <motion.span
        className="check-ring"
        animate={checked ? { backgroundColor: color, borderColor: color, scale: [1, 1.18, 1] } : { backgroundColor: 'rgba(255,255,255,0.7)', borderColor: '#CFCDC7', scale: 1 }}
        transition={{ duration: 0.35, ease }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path d="m5 12 5 5 9-10" initial={false} animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }} transition={{ duration: 0.3, ease }} />
        </svg>
      </motion.span>
    </button>
  );
}

/** Number that counts to its new value. */
export function Count({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    const c = animate(from, value, { duration: 0.8, ease, onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    return () => c.stop();
  }, [value]);
  return <span ref={ref} className={'tnum ' + (className || '')} style={style}>{value}</span>;
}

/** Bottom sheet: springs up, drag down or tap the scrim to dismiss. */
export function Sheet({ open, onClose, children, label, testId }: { open: boolean; onClose: () => void; children: ReactNode; label: string; testId?: string }) {
  const controls = useDragControls();
  const y = useMotionValue(0);
  const scrimOpacity = useTransform(y, [0, 300], [1, 0]);
  useBackHandler(open, onClose);
  const onEnd = (_: unknown, info: PanInfo) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); };
  // Sheets render in the app's top overlay layer so nothing (like the tab bar) can sit on top of them.
  const target = typeof document !== 'undefined' ? document.getElementById('overlay-root') : null;
  if (!target) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="scrim" style={{ opacity: scrimOpacity }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose} data-testid="scrim" />
          <motion.section
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            data-testid={testId}
            className="sheet"
            style={{ y }}
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            exit={{ y: '110%' }}
            transition={softSpring}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragEnd={onEnd}
          >
            <div onPointerDown={(e) => controls.start(e)} style={{ touchAction: 'none', paddingBottom: 4, cursor: 'grab' }}><div className="sheet-grip" /></div>
            <div className="sheet-body noscroll">{children}</div>
          </motion.section>
        </>
      )}
    </AnimatePresence>,
    target
  );
}

/** Staggered entrance for a list of cards. */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } }
};
export const riseItem = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease } }
};

/** Animated list row used for removable items. */
export const rowMotion = {
  layout: true,
  initial: { opacity: 0, height: 0, scale: 0.96 },
  animate: { opacity: 1, height: 'auto', scale: 1 },
  exit: { opacity: 0, height: 0, scale: 0.96, transition: { duration: 0.22 } },
  transition: { ...spring, opacity: { duration: 0.2 } }
};

export function FabPlus({ open, onClick, label, testId }: { open: boolean; onClick: () => void; label: string; testId?: string }) {
  return (
    <motion.button className="fab" onClick={() => { tap(); onClick(); }} aria-label={open ? 'Close' : label} aria-expanded={open} data-testid={testId}
      whileTap={{ scale: 0.9 }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
      <motion.span animate={{ rotate: open ? 45 : 0 }} transition={spring} style={{ display: 'flex' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg></motion.span>
    </motion.button>
  );
}

/** Field + label pair with a visually hidden label. */
export function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} className="field" {...rest} />
    </>
  );
}

export function useLatest<T>(v: T) { const r = useRef(v); r.current = v; return r; }

export function useTimeout() {
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (fn: () => void, ms: number) => { window.clearTimeout(t.current); t.current = window.setTimeout(fn, ms); };
}

export function useNow(ms = 30000) {
  const [current, setNow] = useState(() => nowDate());
  useEffect(() => { const i = window.setInterval(() => setNow(nowDate()), ms); return () => window.clearInterval(i); }, [ms]);
  return current;
}

/** On/off switch with a springy knob. */
export function Switch({ on, onChange, label, testId, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; testId?: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} data-testid={testId}
      onClick={() => { tap(); onChange(!on); }} style={{ width: 52, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, opacity: disabled ? 0.4 : 1 }}>
      <motion.span animate={{ backgroundColor: on ? '#4F5BD5' : 'rgba(46,52,92,0.18)' }} transition={{ duration: 0.25 }} style={{ width: 46, height: 28, borderRadius: 14, position: 'relative', display: 'inline-block' }}>
        <motion.span animate={{ x: on ? 18 : 0 }} transition={spring} style={{ position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </motion.span>
    </button>
  );
}
