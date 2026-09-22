/**
 * Does this machine have WebGL at all?
 *
 * WHY THE FRAME CANNOT ANSWER THIS FOR US. `onLoad` fires when an iframe's
 * DOCUMENT loads, not when the scene renders. So on a machine with no usable
 * WebGL the document loaded perfectly happily, reported itself ready, and the
 * caller faded out its own static artwork in response — leaving a flat void
 * with the panel sitting in the corner of it. Verified in Chrome: that is
 * exactly what you get, and it is the FIRST thing a voter sees.
 *
 * It is not a hypothetical failure either. Managed Windows fleets, remote
 * desktop sessions and blocklisted integrated drivers all land here, and a
 * school hall is where all three live.
 *
 * Asked in the PARENT rather than by patching a frame, so the hash-verified
 * vendored documents stay byte-for-byte what was derived. Cached because
 * creating a WebGL context is not free and the answer cannot change.
 *
 * It lives here rather than beside either scene because both the kiosk backdrop
 * and the hall wall both need it, and they should not import each other.
 */
let webglSupport: boolean | null = null;

export function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    webglSupport = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    // Some hardened configurations throw rather than return null.
    webglSupport = false;
  }
  return webglSupport;
}
