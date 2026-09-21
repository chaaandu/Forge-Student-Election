import '@testing-library/jest-dom/vitest';

// A few suites (token contrast) run in the node environment to read real files
// from disk, so the DOM shims below must be skipped there.
const hasDom = typeof window !== 'undefined';

// jsdom has no matchMedia; the reduced-motion hook needs one. Default to
// "motion allowed" so tests exercise the animated paths unless they opt out.
if (hasDom && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (hasDom && !window.requestAnimationFrame) {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
}

/** Let a test simulate a voter who has reduced motion enabled. */
export function setReducedMotion(reduced: boolean): void {
  if (!hasDom) return;
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
