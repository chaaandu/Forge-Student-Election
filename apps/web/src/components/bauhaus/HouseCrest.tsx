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
  /**
   * Set when the crest sits on a saturated colour field rather than on paper.
   *
   * The crests are black shields, and a black shield on the Knights field
   * (#BE3A2B) very nearly disappears — the one house whose own plate fails to
   * show its own crest. Mounting it on a paper block fixes that for every
   * house at once and without touching the artwork, which is the right place
   * to solve it: the shields are shared with the printed ballot.
   */
  onField?: boolean;
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
export function HouseCrest({
  house,
  size = 40,
  withName = false,
  nameColor,
  onField = false,
}: HouseCrestProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(house.crestUrl) && !failed;

  const artwork = showImage ? (
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
  );

  return (
    <span className="inline-flex items-center gap-3">
      {onField ? (
        <span
          className="inline-flex items-center justify-center"
          style={{
            flex: 'none',
            padding: Math.round(size * 0.16),
            background: 'var(--color-paper)',
            border: 'var(--rule-weight) solid var(--color-ink)',
          }}
        >
          {artwork}
        </span>
      ) : (
        artwork
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
