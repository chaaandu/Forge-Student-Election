import type { House } from '@mesa/election-core';
import { roleFor } from '@/lib/color';
import { Shape } from './Shape';

export interface HouseMarkProps {
  house: House;
  size?: 'sm' | 'md' | 'lg';
  /** Show the house name beside the form. */
  withName?: boolean;
}

const SIZES = { sm: 18, md: 26, lg: 40 } as const;

/**
 * A house, as colour and form together.
 *
 * Never colour alone: a voter who cannot distinguish red from green still sees
 * a square versus an arc, and the name is written next to it whenever it
 * matters. The colour used for the *name* is the derived text-safe variant, not
 * the field — Bauhaus yellow as text would be invisible.
 */
export function HouseMark({ house, size = 'md', withName = false }: HouseMarkProps) {
  const role = roleFor(house.color);

  return (
    <span className="inline-flex items-center gap-2.5">
      <Shape form={house.shape ?? 'square'} size={SIZES[size]} color={role.field} />
      {withName && (
        <span
          style={{
            fontFamily: 'var(--font-geometric)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: size === 'lg' ? 'var(--text-md)' : 'var(--text-sm)',
            color: role.text,
          }}
        >
          {house.name}
        </span>
      )}
    </span>
  );
}
