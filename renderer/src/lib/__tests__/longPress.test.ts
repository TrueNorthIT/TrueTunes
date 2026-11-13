import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installLongPress } from '../longPress';

// jsdom has no PointerEvent constructor: a MouseEvent carrying the pointer fields is what the listener reads.
function pointer(type: string, target: Element, init: { x?: number; y?: number; pointerType?: string } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 10, clientY: init.y ?? 10 });
  Object.assign(e, { pointerType: init.pointerType ?? 'touch', isPrimary: true });
  target.dispatchEvent(e);
}

describe('installLongPress', () => {
  let undo: () => void;
  let row: HTMLElement;
  let menus: MouseEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="row"><input id="field" /></div>';
    row = document.getElementById('row') as HTMLElement;
    menus = [];
    row.addEventListener('contextmenu', (e) => {
      menus.push(e);
      e.preventDefault(); // what a component's onContextMenu does when it opens a menu
    });
    undo = installLongPress();
  });
  afterEach(() => {
    undo();
    vi.useRealTimers();
  });

  it('sends contextmenu to the pressed element after the hold, at the finger', () => {
    pointer('pointerdown', row, { x: 40, y: 60 });
    vi.advanceTimersByTime(499);
    expect(menus).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(menus).toHaveLength(1);
    expect([menus[0].clientX, menus[0].clientY]).toEqual([40, 60]);
  });

  it('does nothing when the finger lifts early, moves away, or the page scrolls', () => {
    pointer('pointerdown', row);
    pointer('pointerup', row);
    vi.advanceTimersByTime(600);

    pointer('pointerdown', row, { x: 10, y: 10 });
    pointer('pointermove', row, { x: 10, y: 30 });
    vi.advanceTimersByTime(600);

    pointer('pointerdown', row);
    document.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(600);

    expect(menus).toHaveLength(0);
  });

  it('ignores a mouse (it has a right button) and a press in a text field (the system menu belongs there)', () => {
    pointer('pointerdown', row, { pointerType: 'mouse' });
    vi.advanceTimersByTime(600);
    pointer('pointerdown', document.getElementById('field') as HTMLElement);
    vi.advanceTimersByTime(600);
    expect(menus).toHaveLength(0);
  });

  it('stops after the undo', () => {
    undo();
    pointer('pointerdown', row);
    vi.advanceTimersByTime(600);
    expect(menus).toHaveLength(0);
  });
});
