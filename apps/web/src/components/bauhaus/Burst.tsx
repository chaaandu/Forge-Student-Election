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
export function Burst({ pieces = 26 }: { pieces?: number }) {
  const reduced = useReducedMotion();

  // Deterministic per mount, so the composition is stable while it animates.
  const shards = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.24;
        // Two rings rather than one band, so the composition has depth instead
        // of a single even halo. The near pieces are larger and land sooner.
        const ring = i % 3 === 0 ? 1 : 0;
        const distance = (ring ? 190 : 110) + ((i * 37) % 90);
        return {
          form: FORMS[i % FORMS.length]!,
          color: FIELDS[(i * 3) % FIELDS.length]!,
          size: (ring ? 10 : 16) + ((i * 13) % 20),
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance * 0.74,
          // A whole turn or more, so the pieces tumble rather than tilt.
          rotate: ((i * 47) % 270) - 135,
          // Staggered across a longer window: they leave in a ragged burst
          // instead of all at once, which is what made it read as one thump.
          delay: (i % 7) * 38,
          duration: 700 + ((i * 53) % 320),
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
            ['--dur' as string]: `${shard.duration}ms`,
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
        /*
          THREE PHASES, because two of them were doing one job badly.

          The old version threw the pieces out and then drifted them away over
          five seconds. It read as a single soft puff: everything left at once,
          at the same speed, and the long drift meant most of the animation was
          shapes slowly disappearing rather than anything arriving.

          Now they are FIRED, they OVERSHOOT and settle back, and only then do
          they fade. The settle is the part that makes it feel like objects
          rather than a particle effect — a thrown block stops, it does not
          coast. Per-piece durations mean they do not land in unison.
        */
        .burst-piece {
          animation:
            burst var(--dur) var(--ease-snap) both,
            fade 1.6s calc(var(--dur) + 900ms) ease-out both;
          will-change: transform, opacity;
        }
        @keyframes burst {
          0% {
            transform: translate(0, 0) scale(.15) rotate(0deg);
            opacity: 0;
          }
          18% { opacity: 1 }
          /* Past the mark, then back to it: the overshoot is the whole feel,
             and it is the same curve the cards and buttons land on. */
          70% {
            transform:
              translate(calc(var(--x) * 1.12), calc(var(--y) * 1.12))
              scale(1.1) rotate(calc(var(--r) * 1.15));
            opacity: 1;
          }
          100% {
            transform: translate(var(--x), var(--y)) scale(1) rotate(var(--r));
            opacity: 1;
          }
        }
        /*
          The clear. Straight down and out — the pieces fall off the plate
          rather than evaporating where they hang, so the screen empties for the
          next voter instead of dimming.
        */
        @keyframes fade {
          0%   { opacity: 1 }
          100% {
            transform:
              translate(var(--x), calc(var(--y) + 46px))
              scale(.92) rotate(calc(var(--r) * 1.3));
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
