import '@testing-library/jest-dom';
import { vi } from 'vitest';

const noop = () => () => {};
const pending = () => new Promise<never>(() => {});

Object.defineProperty(window, 'sonos', {
  writable: true,
  value: {
    fetchStats:         vi.fn(pending),
    fetchDailyGame:     vi.fn(pending),
    submitGameScore:    vi.fn(pending),
    fetchGameLeaderboard: vi.fn(pending),
    fetch:              vi.fn(pending),
    fetchImage:         vi.fn(pending),
    onAuthReady:        vi.fn(noop),
    onAuthExpired:      vi.fn(noop),
    onWsMessage:        vi.fn(noop),
    onWsReady:          vi.fn(noop),
    onWsGroups:         vi.fn(noop),
    onAttributionMap:   vi.fn(noop),
    onAttributionEvent: vi.fn(noop),
    getDisplayName:     vi.fn(pending),
    setDisplayName:     vi.fn(pending),
    publishQueued:      vi.fn(pending),
    refreshAttribution: vi.fn(pending),
    refreshPlayback:    vi.fn(pending),
    resync:             vi.fn(pending),
    play:               vi.fn(pending),
    pause:              vi.fn(pending),
    skipNext:           vi.fn(pending),
    skipPrev:           vi.fn(pending),
    getVersion:         vi.fn(pending),
    isNewVersion:       vi.fn(() => Promise.resolve(false)),
    openExternal:       vi.fn(() => Promise.resolve()),
    trackEvent:         vi.fn(() => Promise.resolve()),
    minimizeWindow:     vi.fn(() => Promise.resolve()),
    maximizeWindow:     vi.fn(() => Promise.resolve()),
    closeWindow:        vi.fn(() => Promise.resolve()),
    isWindowMaximized:  vi.fn(() => Promise.resolve(false)),
    onWindowMaximized:  vi.fn(() => () => {}),
    onUpdateDownloaded: vi.fn(noop),
    installUpdate:      vi.fn(pending),
  },
});
