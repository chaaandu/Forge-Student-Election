import { useState } from 'react';
import type { House } from '@mesa/election-core';
import { Shape } from './Shape';

export interface HouseCrestProps {
  house: House;
  size?: number;
  /** Renders the house name beside the crest. */
  withName?: boolean;
  /** Colour for the name. Defaults to the house's text-safe variant. */
  nameColor?: string;
}

/**
 * A house crest.
 *
 * Shows the real shield when the house has one, and falls back to the drawn
 * shield carrying its elementary form when it does not — so a missing or
 * broken image degrades to something correct rather than to a gap.
 *
 * Decorative in both cases: the house name is always rendered alongside, or
 * supplied by the surrounding row. Identity never rests on the artwork, and
 * never on colour alone.
 */
export function HouseCrest({ house, size = 40, withName = false, nameColor }: HouseCrestProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(house.crestUrl) && !failed;

  return (
    <span className="inline-flex items-center gap-3">
      {showImage ? (
        <img
          src={house.crestUrl}
          alt=""
          aria-hidden="true"
          width={size}
          height={Math.round(size * 1.4)}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ width: size, height: 'auto', display: 'block', flex: 'none' }}
        />
      ) : (
        <Shape form={house.shape ?? 'square'} size={Math.round(size * 0.62)} color={house.color} />
      )}

      {withName && (
        <span
          className="label"
          style={{ color: nameColor ?? 'var(--color-ink-soft)', fontSize: 'var(--text-2xs)' }}
        >
          {house.name}
        </span>
      )}
    </span>
  );
}
