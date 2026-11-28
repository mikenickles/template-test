import { useEffect, useRef } from 'react';

/** A stack of "close me" handlers, so Android's back button closes the top-most sheet first. */
const stack: { id: number; fn: () => void }[] = [];
let next = 1;

export function useBackHandler(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = next++;
    stack.push({ id, fn: () => ref.current() });
    return () => { const i = stack.findIndex((s) => s.id === id); if (i >= 0) stack.splice(i, 1); };
  }, [active]);
}

/** Runs the top handler; returns false when nothing was open. */
export function popBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.fn();
  return true;
}
