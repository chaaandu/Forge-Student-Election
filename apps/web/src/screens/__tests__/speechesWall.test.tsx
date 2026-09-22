import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeechesWall } from '@/screens/SpeechesWall';

/**
 * jsdom has no WebGL, so `supportsWebGL()` answers false for free — the
 * fallback path is the default here and the scene path has to be asked for.
 */
vi.mock('@/lib/webgl', () => ({ supportsWebGL: vi.fn(() => false) }));
const { supportsWebGL } = await import('@/lib/webgl');

afterEach(() => vi.mocked(supportsWebGL).mockReturnValue(false));

describe('the speeches wall', () => {
  it('hangs the derived noren, at the configured variant and props', () => {
    vi.mocked(supportsWebGL).mockReturnValue(true);
    render(<SpeechesWall />);

    const frame = screen.getByTitle('Woven Cloth washi noren');
    expect(frame).toHaveAttribute('src', '/noren/forge-speeches.html');
    // As authored: no `allow-same-origin`. The frame is artwork and must not be
    // able to reach this document or a session token.
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    // hue 0 / saturation 1 / brightness 1 is the identity filter, so the
    // authored component omits it rather than forcing a compositing layer.
    expect(frame.style.filter).toBe('');
  });

  it('fills the frame, so the wall is 100vh with nothing to scroll', () => {
    vi.mocked(supportsWebGL).mockReturnValue(true);
    const { container } = render(<SpeechesWall />);

    // The sizing lives on `.shader-frame` in wall.css; the component's job is
    // only to fill whatever it is given.
    expect(container.querySelector('.shader-frame')).not.toBeNull();
    const frame = screen.getByTitle('Woven Cloth washi noren');
    expect(frame.style.width).toBe('100%');
    expect(frame.style.height).toBe('100%');
  });

  it('still says all three things with no usable WebGL', () => {
    // A black rectangle on a projector is not an option, and the frame cannot
    // report this itself — its document loads happily over a void.
    render(<SpeechesWall />);

    expect(screen.queryByTitle('Woven Cloth washi noren')).toBeNull();
    expect(screen.getByText('FORGE STUDENTS')).toBeInTheDocument();
    expect(screen.getByAltText('Mesa School of Business')).toBeInTheDocument();

    // The words are set letter by letter, as they are down the cloth's panels.
    const words = document.querySelectorAll('.wall-fallback__word');
    expect([...words].map((word) => word.textContent)).toEqual(['ELECTION', 'SPEECHES']);
  });
});
