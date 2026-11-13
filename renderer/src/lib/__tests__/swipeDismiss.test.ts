import { describe, expect, it, vi } from 'vitest';
import { installSwipeDismiss, shouldDismiss, swipeIntent } from '../swipeDismiss';

describe('swipeIntent', () => {
  it('waits for the finger to travel', () => expect(swipeIntent(1, 3, 0)).toBe('wait'));
  it('takes a mostly vertical downward drag at the top', () => expect(swipeIntent(2, 20, 0)).toBe('drag'));
  it('leaves horizontal drags alone', () => expect(swipeIntent(30, 12, 0)).toBe('ignore'));
  it('leaves upward drags alone', () => expect(swipeIntent(0, -30, 0)).toBe('ignore'));
  it('scrolls scrolled content first', () => expect(swipeIntent(0, 30, 120)).toBe('ignore'));
});

describe('shouldDismiss', () => {
  it('closes past a quarter of the height', () => expect(shouldDismiss(210, 800, 900)).toBe(true));
  it('springs back short of it when slow', () => expect(shouldDismiss(120, 800, 900)).toBe(false));
  it('closes on a quick flick', () => expect(shouldDismiss(80, 800, 100)).toBe(true));
  it('ignores a tiny quick twitch', () => expect(shouldDismiss(20, 800, 10)).toBe(false));
  it('never closes on an upward drag', () => expect(shouldDismiss(-300, 800, 50)).toBe(false));
});

function touch(el: Element, type: string, x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  el.dispatchEvent(e);
  return e;
}

describe('installSwipeDismiss', () => {
  const setup = () => {
    const el = document.createElement('div');
    el.innerHTML = '<button id="b"></button>';
    Object.defineProperty(el, 'offsetHeight', { value: 800 });
    document.body.append(el);
    const onDismiss = vi.fn();
    installSwipeDismiss(el, onDismiss);
    return { el, onDismiss };
  };

  it('closes after a long drag down, and holds the page still', () => {
    const { el, onDismiss } = setup();
    touch(el, 'touchstart', 100, 100);
    const move = touch(el, 'touchmove', 102, 400);
    expect(move.defaultPrevented).toBe(true);
    touch(el, 'touchend', 0, 0);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('springs back from a short slow drag', async () => {
    const { el, onDismiss } = setup();
    touch(el, 'touchstart', 100, 100);
    await new Promise((r) => setTimeout(r, 300));
    touch(el, 'touchmove', 100, 150);
    touch(el, 'touchend', 0, 0);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });
  it('ignores a horizontal drag', () => {
    const { el, onDismiss } = setup();
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 300, 140);
    touch(el, 'touchend', 0, 0);
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it('ignores a drag that starts on a button', () => {
    const { el, onDismiss } = setup();
    touch(el.querySelector('#b')!, 'touchstart', 100, 100);
    touch(el, 'touchmove', 100, 500);
    touch(el, 'touchend', 0, 0);
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it('ignores a drag in scrolled content', () => {
    const { el, onDismiss } = setup();
    el.scrollTop = 50;
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 100, 500);
    touch(el, 'touchend', 0, 0);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
