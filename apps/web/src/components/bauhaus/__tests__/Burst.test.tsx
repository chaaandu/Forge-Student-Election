import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Burst } from '../Burst';
import { setReducedMotion } from '@/test/setup';

afterEach(() => setReducedMotion(false));

const styles = (container: HTMLElement) =>
  [...container.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n');

describe('Burst', () => {
  it('clears itself instead of hanging in the air', () => {
    const { container } = render(<Burst />);
    const css = styles(container);

    // The first phase throws the pieces out; without a second they stop dead on
    // their last keyframe and read as frozen. Checked as a PROPERTY rather than
    // by keyframe name — this assertion pinned the name `drift` and failed when
    // the second phase was reworked into something better, which is a test
    // getting in the way of the thing it was meant to protect.
    expect(css).toMatch(/@keyframes burst/);
    expect(css).toMatch(/@keyframes fade/);
    expect(css).toMatch(/animation:[\s\S]*burst[\s\S]*fade/);
    // And it ends invisible, so nothing is left stuck on screen.
    expect(css).toMatch(/@keyframes fade[\s\S]*opacity:\s*0;/);
  });

  it('overshoots and settles, rather than coasting to a stop', () => {
    // A thrown block stops; it does not drift to a halt. The overshoot is what
    // makes these read as objects instead of a particle effect, and it is the
    // same curve the cards and buttons land on.
    const css = styles(render(<Burst />).container);
    expect(css).toMatch(/@keyframes burst[\s\S]*70%[\s\S]*scale\(1\.1\)/);
    expect(css).toMatch(/burst var\(--dur\) var\(--ease-snap\)/);
  });

  it('gives each piece its own duration, so they do not land in unison', () => {
    const { container } = render(<Burst />);
    const durations = [...container.querySelectorAll<HTMLElement>('.burst-piece')].map((el) =>
      el.style.getPropertyValue('--dur'),
    );
    expect(new Set(durations).size).toBeGreaterThan(3);
  });

  it('is decorative only', () => {
    const { container } = render(<Burst />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[role]')).toBeNull();
  });

  it('renders the elementary forms in the primaries', () => {
    const { container } = render(<Burst pieces={8} />);
    expect(container.querySelectorAll('.burst-piece')).toHaveLength(8);
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('stands still under reduced motion rather than flying', () => {
    setReducedMotion(true);
    const { container } = render(<Burst pieces={6} />);
    const piece = container.querySelector<HTMLElement>('.burst-piece');

    // Placed at its destination directly.
    expect(piece?.getAttribute('style')).toMatch(/transform/);
    expect(styles(container)).toMatch(/prefers-reduced-motion[\s\S]*animation:\s*none/);
  });
});
