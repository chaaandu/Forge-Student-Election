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
    // their last keyframe and read as frozen.
    expect(css).toMatch(/@keyframes burst/);
    expect(css).toMatch(/@keyframes drift/);
    expect(css).toMatch(/animation:[\s\S]*burst[\s\S]*drift/);
    // And it ends invisible, so nothing is left stuck on screen.
    expect(css).toMatch(/@keyframes drift[\s\S]*opacity:\s*0;/);
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
