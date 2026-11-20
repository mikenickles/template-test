// A pill that slides to the chosen option (the Chat/Tasks bar, segmented controls).
// The container gets a <span className="slide-pill" /> as a child; the chosen option has class "on".
// `memo` remembers where the pill last was, so a control that's re-created when the page
// changes still slides from the old option instead of appearing in place.
import { useLayoutEffect, useState } from "react";
import { haptic } from "./haptics";

const last = new Map<string, string>();

export function useSlidingPill(active: unknown, memo?: string): (el: HTMLElement | null) => void {
  const [box, setBox] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!box) return;
    const pill = box.querySelector<HTMLElement>(":scope > .slide-pill");
    if (!pill) return;
    const place = (animate: boolean) => {
      const on = box.querySelector<HTMLElement>(":scope > .on");
      if (!on) return void (pill.style.opacity = "0");
      const to = `${on.offsetLeft}px,${on.offsetTop}px,${on.offsetWidth}px,${on.offsetHeight}px`;
      if (!animate) pill.style.transition = "none";
      const [x, y, w, h] = to.split(",");
      pill.style.opacity = "1";
      pill.style.transform = `translate3d(${x},${y},0)`;
      pill.style.width = w;
      pill.style.height = h;
      if (!animate) {
        void pill.offsetWidth; // apply now, then let later moves animate
        pill.style.transition = "";
      }
      if (memo) last.set(memo, to);
    };
    const from = pill.dataset.placed ? null : memo ? last.get(memo) : undefined;
    if (!pill.dataset.placed) {
      pill.dataset.placed = "1";
      if (from) {
        // a fresh control: start where the pill was, then slide
        const [x, y, w, h] = from.split(",");
        pill.style.transition = "none";
        pill.style.transform = `translate3d(${x},${y},0)`;
        pill.style.width = w;
        pill.style.height = h;
        void pill.offsetWidth;
        pill.style.transition = "";
        place(true);
        // a different option than before (not just the page coming back): a tick
        if (memo && last.get(memo) !== from) haptic.select();
      } else place(false);
    } else {
      haptic.select();
      place(true);
    }
    // fonts loading, a badge appearing, the window resizing: follow without sliding
    let size = `${box.offsetWidth}x${box.offsetHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${box.offsetWidth}x${box.offsetHeight}`;
      if (now !== size) (size = now), place(false);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, active, memo]);

  return setBox;
}
