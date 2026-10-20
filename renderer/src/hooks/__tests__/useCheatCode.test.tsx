// P-8 "A cheat-code key sequence typed anywhere in the app (Konami: ArrowUp ArrowUp ArrowDown
// ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a; case-insensitive letters; a wrong key
// resets progress; ignore keystrokes while typing in inputs) opens a poll admin dialog."
//
// Code under test: useCheatCode / KONAMI_CODE in renderer/src/hooks/useCheatCode.ts (stub that throws).
// Keystrokes are dispatched on elements (not on window) because the code must work wherever focus is.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';
import { useCheatCode } from '../useCheatCode';

// Literal copy of the agreed sequence so these tests do not depend on the constant under test.
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

function press(keys: readonly string[], target: Element = document.body) {
  for (const key of keys) fireEvent.keyDown(target, { key });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('P-8 useCheatCode', () => {
  it('calls onMatch once when the full sequence is typed', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    press(KONAMI_CODE);
    expect(onMatch, 'Expected the Konami code to trigger the callback exactly once').toHaveBeenCalledTimes(1);
  });

  it('does not call onMatch for a partial sequence', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    press(KONAMI_CODE.slice(0, -1));
    expect(onMatch, 'Expected no trigger before the final key').not.toHaveBeenCalled();
  });

  it('treats the letters case-insensitively', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    press([...KONAMI_CODE.slice(0, -2), 'B', 'A']);
    expect(onMatch, 'Expected B then A (capitals) to complete the code').toHaveBeenCalledTimes(1);
  });

  it('resets progress on a wrong key', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    // Up Up Down, a stray "x", then the remainder: must NOT complete.
    press(['ArrowUp', 'ArrowUp', 'ArrowDown', 'x', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']);
    expect(onMatch, 'Expected the stray key to reset progress so the code does not complete').not.toHaveBeenCalled();
    press(KONAMI_CODE);
    expect(onMatch, 'Expected a clean run after the reset to trigger').toHaveBeenCalledTimes(1);
  });

  it('can be typed again after a match', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    press(KONAMI_CODE);
    press(KONAMI_CODE);
    expect(onMatch, 'Expected progress to reset after a match so it triggers a second time').toHaveBeenCalledTimes(2);
  });

  it('ignores keystrokes typed into an input', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(KONAMI_CODE, input);
    expect(onMatch, 'Expected typing the code into a text field not to open the admin dialog').not.toHaveBeenCalled();
  });

  it('ignores keystrokes in a textarea', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    const area = document.createElement('textarea');
    document.body.appendChild(area);
    press(KONAMI_CODE, area);
    expect(onMatch, 'Expected typing the code into a textarea not to trigger').not.toHaveBeenCalled();
  });

  it('keystrokes in an input neither advance nor reset progress', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(KONAMI_CODE.slice(0, 4));
    press(['x', 'y'], input);
    press(KONAMI_CODE.slice(4));
    expect(onMatch, 'Expected typing in an input mid-sequence to be ignored, not to reset the sequence').toHaveBeenCalledTimes(1);
  });

  it('supports a custom sequence', () => {
    const onMatch = vi.fn();
    renderHook(() => useCheatCode(['x', 'y'], onMatch));
    press(['x', 'y']);
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const onMatch = vi.fn();
    const { unmount } = renderHook(() => useCheatCode(KONAMI_CODE, onMatch));
    unmount();
    press(KONAMI_CODE);
    expect(onMatch, 'Expected no trigger after the component unmounted').not.toHaveBeenCalled();
  });
});
