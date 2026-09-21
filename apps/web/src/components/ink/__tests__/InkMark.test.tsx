import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InkMark } from '../InkMark';
import { setReducedMotion } from '@/test/setup';

afterEach(() => setReducedMotion(false));

describe('InkMark', () => {
  it('renders nothing when there is no mark', () => {
    const { container } = render(<InkMark marked={false} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('is decorative by default — selection is announced by the card, not the glyph', () => {
    const { container } = render(<InkMark marked />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).not.toHaveAttribute('role');
  });

  it('takes an accessible name when it stands alone', () => {
    render(<InkMark marked label="Vote recorded" />);
    expect(screen.getByRole('img', { name: 'Vote recorded' })).toBeInTheDocument();
  });

  it('draws itself with a stroke animation', () => {
    const { container } = render(<InkMark marked />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('style')).toMatch(/stroke-dashoffset/);
    expect(path?.getAttribute('style')).toMatch(/ink-draw/);
  });

  it('appears instantly under prefers-reduced-motion', () => {
    setReducedMotion(true);
    const { container } = render(<InkMark marked />);
    const path = container.querySelector('path');

    // Present and fully drawn: no dash offset to animate away.
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute('style') ?? '').not.toMatch(/stroke-dashoffset/);
  });

  it('gives each instance its own filter id, so two marks cannot collide', () => {
    const { container } = render(
      <>
        <InkMark marked />
        <InkMark marked />
      </>,
    );
    const ids = [...container.querySelectorAll('filter')].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
