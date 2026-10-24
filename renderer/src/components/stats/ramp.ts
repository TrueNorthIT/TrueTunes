/** Sequential ramp, dark surface: low values recede towards the surface. */
export const RAMP_STEPS = 9;
export const RAMP = Array.from(
  { length: RAMP_STEPS },
  (_, i) => `color-mix(in srgb, var(--ramp-hi) ${Math.round((i / (RAMP_STEPS - 1)) * 100)}%, var(--ramp-lo))`
);
