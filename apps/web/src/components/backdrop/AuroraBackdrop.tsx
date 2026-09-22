import { lazy, Suspense } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { supportsWebGL } from '@/lib/webgl';
import { GROUND } from '@/lib/ground';

/**
 * The aurora, with every reason it might not run in one place.
 *
 * Split from `Aurora` itself so the decision is readable, and so the shader and
 * `ogl` are behind a `lazy()` boundary. The check-in desk must be typable the
 * instant it paints; a ~40 KB WebGL library has no business being in the chunk
 * that gets a voter to the name field.
 *
 * FOUR REASONS IT DOES NOT RENDER, in the order they are cheapest to decide:
 *
 *   ground      the aurora is a light source, and it is designed against the
 *               dark page. On the paper ground it would be a coloured haze over
 *               cream, which is both ugly and a contrast risk on a screen where
 *               a voter reads 145 near-identical names.
 *   motion      `prefers-reduced-motion`. A continuously moving field sitting
 *               behind a text input is the case that setting exists for.
 *   WebGL       the same check the paper backdrop uses. Without it, ogl throws
 *               during setup and leaves a dead canvas over the check-in desk.
 *   visibility  handled inside Aurora: the loop stops when the tab is hidden.
 *
 * NOTE ON GUARDRAILS. design-direction.md §8 opens with "No gradient that reads
 * as a gradient, no glow, no glassmorphism, no blur", and an aurora is a
 * glowing gradient. That is a deliberate exception, asked for explicitly, and
 * §8 has been amended to record it rather than left contradicting the code.
 */
const Aurora = lazy(() =>
  import('./Aurora').then((module) => ({ default: module.Aurora })),
);

export function AuroraBackdrop() {
  const reducedMotion = useReducedMotion();

  if (GROUND !== 'night') return null;
  if (reducedMotion) return null;
  if (!supportsWebGL()) return null;

  return (
    /*
      Fixed and full-bleed, behind the plate rather than behind the type.

      The check-in panel is opaque, so nothing a voter reads is ever set over
      moving colour — the aurora only ever shows in the margins. That is what
      keeps this decoration rather than a legibility problem, and the rendered
      contrast audit is run on this screen to prove it.
    */
    <div
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
      data-aurora
    >
      {/*
        Dimmed to atmosphere, with opacity on the container rather than by
        touching the shader.

        At full strength this is a sunset: the ramp runs blue to red to yellow
        across the viewport and #FFC20E is the most luminous colour in the
        palette, so the right-hand margin became a bright orange mass next to a
        list of student names. Keeping the shader byte-identical and dimming the
        element is both the smaller change and the reversible one.

        The colours are the Bauhaus primaries rather than the component's
        default purples, so the backdrop belongs to this palette and not to
        someone else's demo.
      */}
      <Suspense fallback={null}>
        <div style={{ width: '100%', height: '100%', opacity: 0.4 }}>
          <Aurora colorStops={['#1B4D9B', '#DE2B1F', '#FFC20E']} speed={0.55} blend={0.6} amplitude={0.8} />
        </div>
      </Suspense>
    </div>
  );
}
