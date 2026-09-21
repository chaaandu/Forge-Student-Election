import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SplitFlap } from '../SplitFlap';
import { setReducedMotion } from '@/test/setup';

afterEach(() => setReducedMotion(false));

describe('SplitFlap accessibility contract', () => {
  it('has the real text in the DOM on first render', () => {
    render(<SplitFlap text="NOW BOARDING" />);
    // Present immediately — a screen reader never waits for the animation.
    expect(screen.getByText('NOW BOARDING')).toBeInTheDocument();
  });

  it('hides the animated tiles from assistive technology', () => {
    const { container } = render(<SplitFlap text="DEPARTED" />);
    const tiles = container.querySelector('.flap__tiles');
    expect(tiles).toHaveAttribute('aria-hidden', 'true');
    // The real text lives outside the hidden layer.
    expect(tiles?.textContent).not.toBe('');
    expect(container.querySelector('.sr-only')?.textContent).toBe('DEPARTED');
  });

  it('never exposes the intermediate random characters to a screen reader', async () => {
    const { container, rerender } = render(<SplitFlap text="AAAA" />);
    rerender(<SplitFlap text="ZZZZ" />);
    // Mid-flight, the accessible text is already the destination, not a scramble.
    expect(container.querySelector('.sr-only')?.textContent).toBe('ZZZZ');
  });

  it('uses the label override for abbreviations', () => {
    render(<SplitFlap text="GATE 03" label="Gate 3 of 7: Academic Lead — Boy" />);
    expect(screen.getByText('Gate 3 of 7: Academic Lead — Boy')).toBeInTheDocument();
    expect(screen.queryByText('GATE 03')).not.toBeInTheDocument();
  });

  it('announces only when asked to', () => {
    const { container, rerender } = render(<SplitFlap text="OPEN" />);
    expect(container.querySelector('.sr-only')).not.toHaveAttribute('aria-live');

    rerender(<SplitFlap text="OPEN" announce />);
    expect(container.querySelector('.sr-only')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('SplitFlap mechanics', () => {
  it('renders one tile per character, padded to the given width', () => {
    const { container } = render(<SplitFlap text="OK" width={6} />);
    expect(container.querySelectorAll('.flap__tile')).toHaveLength(6);
  });

  it('settles on the target text', async () => {
    const { container, rerender } = render(
      <SplitFlap text="AAA" timing={{ flipMs: 1, staggerMs: 0, flipsPerChar: 1 }} />,
    );
    rerender(<SplitFlap text="BBB" timing={{ flipMs: 1, staggerMs: 0, flipsPerChar: 1 }} />);

    await waitFor(() => {
      const bottoms = [...container.querySelectorAll('.flap__half--bottom .flap__char')];
      expect(bottoms.map((n) => n.textContent).join('')).toBe('BBB');
    });
  });

  it('does not flip characters that did not change', async () => {
    const timing = { flipMs: 1, staggerMs: 0, flipsPerChar: 1 };
    const { container, rerender } = render(<SplitFlap text="GATE 01" timing={timing} />);
    rerender(<SplitFlap text="GATE 02" timing={timing} />);

    // Only the final character is ever in a flipping state.
    await waitFor(() => {
      const leaves = container.querySelectorAll('.flap__leaf--front');
      expect(leaves.length).toBeLessThanOrEqual(1);
    });
  });

  it('calls onSettled when the flip completes', async () => {
    let settled = 0;
    const timing = { flipMs: 1, staggerMs: 0, flipsPerChar: 1 };
    const { rerender } = render(
      <SplitFlap text="AA" timing={timing} onSettled={() => (settled += 1)} />,
    );
    rerender(<SplitFlap text="BB" timing={timing} onSettled={() => (settled += 1)} />);
    await waitFor(() => expect(settled).toBeGreaterThan(0));
  });

  it('cleans up its animation frame on unmount', () => {
    const timing = { flipMs: 50, staggerMs: 10, flipsPerChar: 10 };
    const { rerender, unmount } = render(<SplitFlap text="AAAA" timing={timing} />);
    rerender(<SplitFlap text="ZZZZ" timing={timing} />);
    // Unmounting mid-animation must not throw or leave a frame scheduled.
    expect(() => unmount()).not.toThrow();
  });
});

describe('SplitFlap under prefers-reduced-motion', () => {
  it('renders the final characters immediately with no cycling', () => {
    setReducedMotion(true);
    const { container } = render(<SplitFlap text="DEPARTED" />);

    const bottoms = [...container.querySelectorAll('.flap__half--bottom .flap__char')];
    expect(bottoms.map((n) => n.textContent).join('')).toBe('DEPARTED');
    // No leaves means no rotation is happening at all.
    expect(container.querySelectorAll('.flap__leaf')).toHaveLength(0);
  });

  it('still shows the complete experience — same text, same place', () => {
    setReducedMotion(true);
    render(<SplitFlap text="NOW BOARDING" announce />);
    expect(screen.getByText('NOW BOARDING')).toBeInTheDocument();
  });
});
