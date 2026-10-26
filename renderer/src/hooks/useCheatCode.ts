import { useEffect, useEffectEvent } from 'react';

/**
 * Fires `onMatch` when the user types `sequence` anywhere in the app (P-8).
 *
 * Pinned by hooks/__tests__/useCheatCode.test.tsx.
 *
 * Contract:
 *  - listens for keydown on window/document (events dispatched on any element bubble to it);
 *  - compares `event.key` case-insensitively (so "B" matches "b");
 *  - a key that is not the next expected one resets progress to the start;
 *  - keystrokes whose target is an <input>, <textarea>, <select> or contenteditable element are
 *    ignored entirely (they neither advance nor reset progress);
 *  - after a match, progress resets so the sequence can be typed again;
 *  - the listener is removed on unmount.
 */

/** Konami code. */
export const KONAMI_CODE: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true'
  );
}

export function useCheatCode(sequence: readonly string[], onMatch: () => void): void {
  // Always calls the latest onMatch without re-subscribing the listener.
  const fireMatch = useEffectEvent(onMatch);

  useEffect(() => {
    const expected = sequence.map((k) => k.toLowerCase());
    let progress = 0;

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || MODIFIER_KEYS.has(e.key)) return;
      const key = e.key.toLowerCase();
      if (key === expected[progress]) {
        progress++;
      } else {
        // A wrong key restarts the code, but may itself be the first key of a new attempt.
        progress = key === expected[0] ? 1 : 0;
      }
      if (progress === expected.length) {
        progress = 0;
        fireMatch();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sequence]);
}
