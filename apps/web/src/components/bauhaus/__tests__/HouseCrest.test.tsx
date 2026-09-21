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

  it('falls back to the elementary form when no crest is configured', () => {
    const { container } = render(<HouseCrest house={{ ...samurai, crestUrl: undefined }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the house name when asked', () => {
    render(<HouseCrest house={samurai} withName />);
    expect(screen.getByText('Samurai')).toBeInTheDocument();
  });
});
