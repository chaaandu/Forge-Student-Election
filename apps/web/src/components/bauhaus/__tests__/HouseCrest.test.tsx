import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { House } from '@mesa/election-core';
import { HouseCrest } from '../HouseCrest';

const samurai: House = {
  id: 'samurai',
  name: 'Samurai',
  color: '#2D62AE',
  shape: 'circle',
  crestUrl: '/houses/samurai.svg',
};

describe('HouseCrest', () => {
  it('renders the crest when the house has one', () => {
    const { container } = render(<HouseCrest house={samurai} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', samurai.crestUrl!);
    // Decorative: the name is carried by the row, never by the artwork.
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to the elementary form when the image fails', () => {
    const { container } = render(<HouseCrest house={samurai} />);
    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('finds its own artwork when nothing configures a crest', () => {
    // The shields ship with the web app; the election data does not have to
    // point at them. It used to, and when a generator stopped copying
    // `crestUrl` every house silently rendered its drawn shape instead —
    // four coloured blocks on the ballot, with nothing logged, because
    // falling back is what the fallback is for.
    //
    // The guarantee that a broken image degrades to the drawn form is still
    // covered, by the test above this one.
    const { container } = render(<HouseCrest house={{ ...samurai, crestUrl: undefined }} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/houses/samurai.png');
  });

  it('renders the house name when asked', () => {
    render(<HouseCrest house={samurai} withName />);
    expect(screen.getByText('Samurai')).toBeInTheDocument();
  });
});
