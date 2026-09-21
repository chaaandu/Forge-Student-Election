import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';
import '@/styles/splitflap.css';

/**
 * A split-flap display.
 *
 * Provenance: the flip mechanic (front/back tile halves, a staggered
 * rAF-driven character sequence) is adapted from React Bits' `SplitFlapText`
 * — MIT + Commons Clause, © David Haz. See THIRD_PARTY_NOTICES.md and ADR-7.
 *
 * Re-implemented rather than copied in because this theme needs the opposite of
 * what the original does:
 *
 *   • CONTROLLED, not self-cycling. The board flips because application state
 *     changed — never on a timer. `STATUS: DEPARTED` appears when the server
 *     confirms the vote, and at no other moment.
 *   • ACCESSIBLE. The real text is in the DOM on first paint inside a
 *     visually-hidden span; the animated tiles are aria-hidden, so assistive
 *     technology never reads the intermediate random characters.
 *   • REDUCED-MOTION COMPLETE. With the preference set, the final characters
 *     render immediately. Nothing is removed, nothing is hidden.
 *   • TESTABLE. Timing is injectable, so the mechanic can be asserted without
 *     waiting on wall-clock animation.
 */

export type FlapTone = 'signal' | 'go' | 'stop' | 'neutral';
export type FlapSize = 'sm' | 'md' | 'lg' | 'xl';

export interface FlapTiming {
  /** Duration of one character flip. */
  flipMs: number;
  /** Delay applied per tile index, producing the left-to-right ripple. */
  staggerMs: number;
  /** Random characters cycled through before landing on the target. */
  flipsPerChar: number;
}

export const DEFAULT_TIMING: FlapTiming = { flipMs: 110, staggerMs: 35, flipsPerChar: 6 };

const CHARSETS = {
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ·—',
  alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
  numeric: '0123456789',
} as const;

export interface SplitFlapProps {
  /** Controlled: the component flips TO this. */
  text: string;
  /** Pad or truncate to a fixed tile count so the layout never reflows. */
  width?: number;
  charset?: keyof typeof CHARSETS | string;
  size?: FlapSize;
  tone?: FlapTone;
  /** Overrides the screen-reader text when `text` is an abbreviation. */
  label?: string;
  /** Announce changes to screen readers. Use only where the change is meaningful. */
  announce?: boolean;
  timing?: Partial<FlapTiming>;
  onSettled?: () => void;
  className?: string;
}

interface Tile {
  current: string;
  incoming: string | null;
  tick: number;
}

const resolveCharset = (charset: SplitFlapProps['charset']): string =>
  (charset && charset in CHARSETS
    ? CHARSETS[charset as keyof typeof CHARSETS]
    : typeof charset === 'string' && charset.length > 0
      ? charset
      : CHARSETS.alphanumeric);

const pad = (value: string, width: number): string =>
  value.length >= width ? value.slice(0, width) : value.padEnd(width, ' ');

const tilesFor = (value: string): Tile[] =>
  [...value].map((char) => ({ current: char, incoming: null, tick: 0 }));

export function SplitFlap({
  text,
  width,
  charset = 'alphanumeric',
  size = 'md',
  tone = 'signal',
  label,
  announce = false,
  timing,
  onSettled,
  className = '',
}: SplitFlapProps) {
  const reducedMotion = useReducedMotion();
  const resolvedWidth = width ?? text.length;
  const target = useMemo(() => pad(text, resolvedWidth), [text, resolvedWidth]);

  const [tiles, setTiles] = useState<Tile[]>(() => tilesFor(target));
  const currentRef = useRef(target);
  const frameRef = useRef<number | null>(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    const { flipMs, staggerMs, flipsPerChar } = { ...DEFAULT_TIMING, ...timing };
    const alphabet = resolveCharset(charset);

    const cancel = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    cancel();

    const settle = () => {
      currentRef.current = target;
      setTiles(tilesFor(target));
      settledRef.current?.();
    };

    // Reduced motion, or the width changed under us: land immediately.
    if (reducedMotion || flipMs <= 0 || currentRef.current.length !== target.length) {
      settle();
      return cancel;
    }

    const from = currentRef.current;

    // Only characters that actually changed flip. A one-word change ripples;
    // it does not reset the whole board.
    const plans = [...target]
      .map((char, index) => {
        if (from[index] === char) return null;
        const sequence: string[] = [];
        for (let i = 0; i < flipsPerChar; i += 1) {
          sequence.push(alphabet[Math.floor(Math.random() * alphabet.length)] ?? ' ');
        }
        sequence.push(char);
        return { index, from: from[index] ?? ' ', sequence, step: -1, done: false };
      })
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

    if (plans.length === 0) {
      settle();
      return cancel;
    }

    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      let pending = false;
      const updates: { index: number; current: string; incoming: string | null }[] = [];

      for (const plan of plans) {
        const local = elapsed - plan.index * staggerMs;
        if (local < 0) {
          pending = true;
          continue;
        }
        const step = Math.floor(local / flipMs);
        if (step < plan.sequence.length) {
          pending = true;
          if (step !== plan.step) {
            plan.step = step;
            updates.push({
              index: plan.index,
              current: step === 0 ? plan.from : (plan.sequence[step - 1] ?? plan.from),
              incoming: plan.sequence[step] ?? null,
            });
          }
        } else if (!plan.done) {
          plan.done = true;
          updates.push({ index: plan.index, current: plan.sequence.at(-1) ?? ' ', incoming: null });
        }
      }

      if (updates.length > 0) {
        setTiles((previous) => {
          const next = [...previous];
          for (const update of updates) {
            const tile = next[update.index];
            if (!tile) continue;
            next[update.index] = {
              current: update.current,
              incoming: update.incoming,
              tick: tile.tick + 1,
            };
          }
          return next;
        });
      }

      if (pending) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        currentRef.current = target;
        settledRef.current?.();
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return cancel;
    // `timing` is a literal at every call site; depending on its identity would
    // restart the animation on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reducedMotion, charset]);

  const readable = label ?? text;

  return (
    <span className={`flap flap--${size} flap--${tone} ${className}`.trim()}>
      {/*
        The real text, present on first paint. This is what a screen reader
        announces — never the tiles.
      */}
      <span className="sr-only" {...(announce ? { 'aria-live': 'polite' as const } : {})}>
        {readable}
      </span>

      <span aria-hidden="true" className="flap__tiles" style={{ display: 'inherit', gap: 'inherit' }}>
        {tiles.map((tile, index) => (
          <span className="flap__tile" key={index}>
            <span className="flap__half flap__half--top">
              <span className="flap__char">{tile.incoming ?? tile.current}</span>
            </span>
            <span className="flap__half flap__half--bottom">
              <span className="flap__char">{tile.current}</span>
            </span>

            {tile.incoming !== null && (
              <span key={tile.tick}>
                <span className="flap__leaf flap__leaf--front">
                  <span className="flap__char">{tile.current}</span>
                </span>
                <span className="flap__leaf flap__leaf--back">
                  <span className="flap__char">{tile.incoming}</span>
                </span>
              </span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
