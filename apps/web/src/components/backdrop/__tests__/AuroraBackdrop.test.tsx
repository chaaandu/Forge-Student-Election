import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuroraBackdrop } from '../AuroraBackdrop';
import { setReducedMotion } from '@/test/setup';

afterEach(() => {
  setReducedMotion(false);
  vi.restoreAllMocks();
});

/**
 * The aurora is decoration on the screen where a voter types their own name.
 *
 * It breaks §8's first guardrail knowingly (an aurora is a glowing gradient),
 * so the things that keep it harmless are not style choices and are pinned
 * here. jsdom reports no WebGL, which is why the whole existing flow suite —
 * nineteen tests that walk a voter from welcome to submitted — already runs
 * with this absent and passes. That is the property that matters most: the
 * check-in desk does not need it.
 */
describe('the aurora backdrop', () => {
  it('renders nothing under prefers-reduced-motion', () => {
    setReducedMotion(true);
    const { container } = render(<AuroraBackdrop />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing where there is no WebGL', () => {
    // jsdom has none, so this is the real answer rather than a mocked one.
    const { container } = render(<AuroraBackdrop />);
    expect(container.firstChild).toBeNull();
  });
});
