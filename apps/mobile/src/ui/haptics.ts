// Thin, failure-proof wrapper over expo-haptics. A device without a vibration motor (or a denied
// setting) must never surface as an error, so every call swallows failures.

import * as Haptics from 'expo-haptics';

const fire = (fn: () => Promise<void>) => {
  try {
    fn().catch(() => {});
  } catch {
    /* no haptics available */
  }
};

export const haptic = {
  /** Tab switches, toggles. */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** Small confirmations: play/pause, add buttons. */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Mode changes and gesture commits: long-press select, drag start, swipe action fired. */
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
