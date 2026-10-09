// Design tokens lifted from the desktop renderer's global.css (:root). Keep in sync.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#1c1c1e',
  bg1: '#252528',
  bg2: 'rgba(255,255,255,0.08)',
  glass: 'rgba(22,22,24,0.88)',
  border: 'rgba(255,255,255,0.1)',
  border2: 'rgba(255,255,255,0.2)',
  text: '#ffffff',
  text2: 'rgba(255,255,255,0.65)',
  text3: 'rgba(255,255,255,0.5)',
  accent: '#2a6df4',
  danger: '#ff453a',
  success: '#30d158',
} as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Text presets so screens do not hand-roll font sizes. */
export const type = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 17, fontWeight: '600' },
  body: { color: colors.text, fontSize: 15 },
  secondary: { color: colors.text2, fontSize: 13 },
  caption: { color: colors.text3, fontSize: 12 },
});
