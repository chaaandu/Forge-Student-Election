import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type PaperVariant = 'mesa-elections' | 'site-of-the-year';

export interface PaperBackdropProps {
  variant?: PaperVariant;
  /** Fires once the frame reports loaded, so the fallback can cross-fade out. */
  onReady?: () => void;
  className?: string;
}

/**
 * The ThreeUI 3D paper, as the welcome backdrop.
 *
 * PROVENANCE. The authored source is vendored verbatim and hash-verified in
 * `apps/web/vendor/threeui/` (see its README and the test alongside it). The
 * document this frame loads is derived from it by
 * `scripts/build-paper-variant.mjs`, which re-verifies the SHA-256 published in
 * the integration brief before applying an enumerated set of content-only
 * patches. No shader, no motion and no interaction is touched.
 *
 * WHY `src` AND NOT `srcDoc`. The authored `ThreeDPaper` inlines the document
 * with `srcDoc` and statically imports all four variants with `?raw` — roughly
 * 2.5 MB into the JavaScript bundle, against an application bundle of ~280 KB.
 * On a kiosk that cost lands on the one screen that must be instant. Serving
 * the document from /public keeps it out of the bundle entirely and lets the
 * browser cache it. The trade is recorded in docs/design-direction.md.
 *
 * The sandbox stays as authored (`allow-scripts`, no `allow-same-origin`), so
 * the frame cannot reach the parent document, its storage, or the session
 * token. It is decoration with no access to the election.
 */
export function PaperBackdrop({
  variant = 'mesa-elections',
  onReady,
  className = '',
}: PaperBackdropProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [hostVisible, setHostVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );
  // Keyed by variant rather than a boolean, so switching variants resets
  // readiness by derivation. A `setReady(false)` inside an effect would cause a
  // cascading render for no benefit.
  const [readyVariant, setReadyVariant] = useState<PaperVariant | null>(null);

  // Both guards mirror the authored component: do not run a WebGL scene for a
  // backdrop that is scrolled away or in a hidden tab.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setHostVisible(entry?.isIntersecting ?? true),
      { rootMargin: '80px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const mounted = hostVisible && documentVisible && !reducedMotion;
  const ready = mounted && readyVariant === variant;

  // Reduced motion: render nothing at all. The caller's static artwork is the
  // complete experience, and this is a continuously animating scene.
  if (reducedMotion) return <div ref={hostRef} className={className} aria-hidden="true" />;

  return (
    <div ref={hostRef} className={className} aria-hidden="true" data-state={ready ? 'ready' : 'loading'}>
      {mounted && (
        <iframe
          title=""
          aria-hidden="true"
          tabIndex={-1}
          src={`/paper/${variant}.html`}
          sandbox="allow-scripts"
          loading="eager"
          key={variant}
          onLoad={() => {
            setReadyVariant(variant);
            onReady?.();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            border: 0,
            background: '#08080a',
            opacity: ready ? 1 : 0,
            transition: 'opacity 420ms ease-out',
          }}
        />
      )}
    </div>
  );
}
