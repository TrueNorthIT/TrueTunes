// Swipe down to dismiss a panel (Now playing, the bottom sheet). One gesture, written once: the panel follows the
// finger while it is dragged down from the top of its own content, and goes if it is let go far enough or flicked.
// Horizontal drags, drags that start on a control (the seek bar, the volume slider, a button) and drags in
// scrolled content never start it. Left-edge back swipes are the browser's and are not touched.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Let go past this share of the panel's height and it closes. */
export const DISMISS_FRACTION = 0.25;
/** Or flick faster than this (px per ms) over at least FLICK_MIN_PX. */
export const FLICK_SPEED = 0.5;
const FLICK_MIN_PX = 40;
/** How far the finger travels before we decide what the gesture is. */
const LOCK_PX = 8;

export type Intent = 'wait' | 'drag' | 'ignore';

/** What a touch that has moved (dx, dy) from where it began is: undecided, a dismiss drag, or not ours. */
export function swipeIntent(dx: number, dy: number, scrollTop: number): Intent {
  if (Math.hypot(dx, dy) < LOCK_PX) return 'wait';
  return dy > 0 && dy > Math.abs(dx) * 1.5 && scrollTop <= 0 ? 'drag' : 'ignore';
}

/** Whether letting go after dragging `dy` px down over `ms` closes a panel `height` px tall. */
export function shouldDismiss(dy: number, height: number, ms: number): boolean {
  if (dy <= 0) return false;
  if (dy >= height * DISMISS_FRACTION) return true;
  return dy >= FLICK_MIN_PX && dy / Math.max(ms, 1) >= FLICK_SPEED;
}

const CONTROLS = 'button, a, input, select, textarea, [role="slider"], [data-no-swipe]';

/** Attach the gesture to `el`. Returns the undo. */
export function installSwipeDismiss(el: HTMLElement, onDismiss: () => void, controls = CONTROLS): () => void {
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let dy = 0;
  let active = false; // a touch is being watched
  let dragging = false;

  const reset = () => {
    active = dragging = false;
    dy = 0;
  };
  const onStart = (e: TouchEvent) => {
    reset();
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t) return;
    // The seek bar and sliders are controls, and a button is a tap: none of them starts a swipe.
    if (e.target instanceof Element && e.target.closest(controls)) return;
    x0 = t.clientX;
    y0 = t.clientY;
    t0 = Date.now();
    active = true;
    el.style.transition = 'none';
  };
  const onMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!active || !t) return;
    const mx = t.clientX - x0;
    const my = t.clientY - y0;
    if (!dragging) {
      const intent = swipeIntent(mx, my, el.scrollTop);
      if (intent === 'wait') return;
      if (intent === 'ignore') return reset();
      dragging = true;
    }
    // Ours now: the page must not scroll, and Safari must not pull to refresh.
    if (e.cancelable) e.preventDefault();
    dy = Math.max(0, my);
    if (!reduced()) el.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    const was = dragging;
    const go = was && shouldDismiss(dy, el.offsetHeight, Date.now() - t0);
    reset();
    if (!was) return;
    if (go) return onDismiss();
    if (!reduced()) el.style.transition = 'transform var(--dur) var(--ease)';
    el.style.transform = '';
  };
  const onCancel = () => {
    if (dragging) el.style.transform = '';
    reset();
  };

  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onCancel);
  return () => {
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
  };
}

/** The same, for a panel that is mounted while `enabled`. */
export function useSwipeDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled = true,
  controls?: string
) {
  // The latest callback, so a re-render in the middle of a drag does not drop the gesture.
  const latest = useRef(onDismiss);
  useLayoutEffect(() => {
    latest.current = onDismiss;
  });
  useEffect(() => {
    const el = ref.current;
    return el && enabled ? installSwipeDismiss(el, () => latest.current(), controls) : undefined;
  }, [ref, enabled, controls]);
}
