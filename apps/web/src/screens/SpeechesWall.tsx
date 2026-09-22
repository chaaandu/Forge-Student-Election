import { WovenCloth } from '@/components/noren/WovenCloth';
import { supportsWebGL } from '@/lib/webgl';

const SLEEVE = 'FORGE STUDENTS';
const PANELS = ['ELECTION', 'SPEECHES'] as const;

/**
 * The speeches wall: a washi noren hung across the whole screen, at `/wall`.
 *
 * Everything it says is printed into the cloth itself, by
 * `scripts/build-noren-variant.mjs` — the sleeve, the two panels and the crest
 * are part of the texture, not an overlay. So the page has no layout of its
 * own to scale: the scene fits the box it is given, and reads the same at 1080
 * wide as at 1920.
 *
 * The WebGL check is asked here rather than inside the frame, so the vendored
 * document stays byte-for-byte what was derived. `onLoad` cannot answer it —
 * the frame's DOCUMENT loads perfectly happily on a machine with no usable
 * context, and reports itself ready over a black void.
 */
export function SpeechesWall() {
  if (!supportsWebGL()) {
    return (
      <div className="shader-frame">
        <div className="wall-fallback">
          <div className="wall-fallback__cloth">
            <p className="wall-fallback__sleeve">{SLEEVE}</p>
            <div className="wall-fallback__panel">
              <p className="wall-fallback__word">
                {[...PANELS[0]].map((letter, i) => (
                  <span key={`${letter}${i}`}>{letter}</span>
                ))}
              </p>
            </div>
            <div className="wall-fallback__panel">
              <span className="wall-fallback__crest">
                <img
                  className="wall-fallback__mark"
                  src="/favicon-192x192.png"
                  alt="Mesa School of Business"
                />
              </span>
            </div>
            <div className="wall-fallback__panel">
              <p className="wall-fallback__word">
                {[...PANELS[1]].map((letter, i) => (
                  <span key={`${letter}${i}`}>{letter}</span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shader-frame">
      <WovenCloth variant="washi" hue={0} saturation={1.0} brightness={1.0} />
    </div>
  );
}
