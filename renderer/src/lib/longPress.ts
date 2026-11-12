// A long press is the touch form of a right-click. Android sends `contextmenu` for one; iOS Safari never does, so
// the web app sends its own: a finger held still for HOLD_MS gets a `contextmenu` event on the element under it,
// which the components' ordinary onContextMenu handlers answer. Nothing happens when no handler takes it.

const HOLD_MS = 500;
/** A finger that travels further than this is scrolling or swiping, not pressing. */
const SLOP_PX = 10;
/** After the finger lifts, how long the click and mouse events a touch trails behind it are swallowed. */
const TRAIL_MS = 700;

const isTyping = (el: Element) => !!el.closest('input, textarea, select, [contenteditable="true"]');

/** Listen on `doc` for long presses. Returns the undo. */
export function installLongPress(doc: Document = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let x = 0;
  let y = 0;
  /** A press opened a menu: swallow what the lifting finger sends next (a click would land on the menu's backdrop). */
  let opened = false;
  let swallowUntil = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const onDown = (e: PointerEvent) => {
    cancel();
    opened = false;
    swallowUntil = 0;
    const target = e.target;
    if (e.pointerType === 'mouse' || !e.isPrimary || !(target instanceof Element) || isTyping(target)) return;
    x = e.clientX;
    y = e.clientY;
    timer = setTimeout(() => {
      timer = undefined;
      if (!target.isConnected) return;
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      // dispatchEvent is false when a handler called preventDefault, which is how a menu says it opened.
      opened = !target.dispatchEvent(ev);
    }, HOLD_MS);
  };
  const onMove = (e: PointerEvent) => {
    if (timer && Math.hypot(e.clientX - x, e.clientY - y) > SLOP_PX) cancel();
  };
  const onUp = () => {
    cancel();
    if (opened) swallowUntil = Date.now() + TRAIL_MS;
  };
  /** The browser's own contextmenu (Android, a touch laptop): let it do the job, once. */
  const onNativeMenu = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    if (opened) {
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (timer) {
      cancel();
      opened = true;
    }
  };
  const swallow = (e: Event) => {
    if (!opened || !e.isTrusted) return;
    if (swallowUntil && Date.now() > swallowUntil) {
      opened = false;
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const trail = ['click', 'mousedown', 'mouseup'] as const;
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointermove', onMove, true);
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', cancel, true);
  doc.addEventListener('scroll', cancel, true);
  doc.addEventListener('contextmenu', onNativeMenu, true);
  trail.forEach((t) => doc.addEventListener(t, swallow, true));
  return () => {
    cancel();
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('pointermove', onMove, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', cancel, true);
    doc.removeEventListener('scroll', cancel, true);
    doc.removeEventListener('contextmenu', onNativeMenu, true);
    trail.forEach((t) => doc.removeEventListener(t, swallow, true));
  };
}
