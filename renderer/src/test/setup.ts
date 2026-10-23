import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createSonosFake } from './sonosFake';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom defaults innerWidth to 1024, which is below the skinny-mode breakpoint
// (FULL_MIN = 1144) and would make the app render the skinny side-panel layout.
// Use the app's real default window width so tests exercise the full layout.
window.innerWidth = 1280;

// jsdom has no showModal()/close(); common/Dialog only needs the open attribute toggled.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };

Object.defineProperty(window, 'sonos', {
  writable: true,
  value: createSonosFake((_name, impl) => vi.fn(impl)),
});
