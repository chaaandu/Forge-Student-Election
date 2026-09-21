import { useMemo } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { Shape } from './Shape';
import type { HouseShape } from '@mesa/election-core';

const FORMS: HouseShape[] = ['square', 'circle', 'triangle', 'arc'];
const FIELDS = ['var(--bh-red)', 'var(--bh-blue)', 'var(--bh-yellow)', 'var(--bh-green)'];

/**
 * The celebration.
 *
 * Elementary forms in primaries, thrown outward and settling — a Bauhaus
 * composition assembling itself rather than confetti. Deliberately not confetti:
 * confetti reads as a game reward, and nothing here should suggest the voter
 * *won* something. This marks that they took part.
 *
 * Two phases, and the second is the one that matters: the pieces fly out, then
 * keep drifting and fade away. An earlier version ran only the first phase, so
 * the shapes stopped dead on their last keyframe and hung there looking stuck —
 * the screen read as broken rather than finished.
 *
 * Under reduced motion the same pieces render in their final positions, so the
 * composition is still there; it simply does not fly.
 */
export function Burst({ pieces = 18 }: { pieces?: number }) {
  const reduced = useReducedMotion();

  // Deterministic per mount, so the composition is stable while it animates.
  const shards = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.24;
        const distance = 96 + ((i * 37) % 120);
        return {
          form: FORMS[i % FORMS.length]!,
          color: FIELDS[(i * 3) % FIELDS.length]!,
          size: 12 + ((i * 13) % 22),
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance * 0.78,
          rotate: ((i * 47) % 90) - 45,
          delay: (i % 6) * 45,
        };
      }),
    [pieces],
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {shards.map((shard, i) => (
        <span
          key={i}
          className="burst-piece absolute left-1/2 top-1/2"
          style={{
            ['--x' as string]: `${shard.x}px`,
            ['--y' as string]: `${shard.y}px`,
            ['--r' as string]: `${shard.rotate}deg`,
            animationDelay: `${shard.delay}ms`,
            ...(reduced
              ? { transform: `translate(${shard.x}px, ${shard.y}px) rotate(${shard.rotate}deg)`, opacity: 0.9 }
              : {}),
          }}
        >
          <Shape form={shard.form} size={shard.size} color={shard.color} />
        </span>
      ))}

      <style>{`
        .burst-piece {
          animation:
            burst 820ms var(--ease-snap) both,
            drift 5s 820ms cubic-bezier(.33,0,.4,1) both;
          will-change: transform, opacity;
        }
        @keyframes burst {
          0%   { transform: translate(0,0) scale(.2) rotate(0deg); opacity: 0 }
          35%  { opacity: 1 }
          100% { transform: translate(var(--x), var(--y)) scale(1) rotate(var(--r)); opacity: .92 }
        }
        /*
          The second phase is the point. The burst alone ended on its last
          keyframe and simply stopped, so the shapes read as frozen mid-air —
          the screen looked broken rather than finished. They now keep drifting
          outward and fade out, so the composition clears instead of hanging.
        */
        @keyframes drift {
          0%   { transform: translate(var(--x), var(--y)) scale(1) rotate(var(--r)); opacity: .92 }
          100% {
            transform:
              translate(calc(var(--x) * 1.45), calc(var(--y) * 1.45 - 26px))
              scale(1.06) rotate(calc(var(--r) * 1.6));
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          /* No flight and no fade: the pieces are simply there, then the screen
             resets. Motion is the decoration, not the message. */
          .burst-piece { animation: none }
        }
      `}</style>
    </div>
  );
}
