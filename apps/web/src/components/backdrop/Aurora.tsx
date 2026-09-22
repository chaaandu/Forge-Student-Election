import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { useEffect, useRef, useState } from 'react';

import './Aurora.css';

/**
 * React Bits' `Aurora`, as the check-in backdrop.
 *
 * PROVENANCE
 * Source: https://reactbits.dev/backgrounds/aurora
 * Author: David Haz — https://github.com/DavidHDev/react-bits
 * Licence: MIT + Commons Clause License Condition v1.0
 *
 * The Commons Clause forbids SELLING the software. Mesa does not sell this, so
 * it is usable here, but it is not plain MIT and THIRD_PARTY_NOTICES.md records
 * it. Note that that file previously read "No React Bits code remains in this
 * repository" — this reverses that, deliberately, and the notice has been
 * updated rather than left stale.
 *
 * WHAT WAS CHANGED, and nothing else:
 *   - ported to TypeScript;
 *   - `lightMode` removed. It was a second rendering path for a light page, and
 *     this only ever draws on the dark ground;
 *   - THREE KIOSK GATES added, none of them cosmetic. See below.
 *
 * The shader itself — vertex and fragment, including the simplex noise and the
 * colour ramp — is byte-for-byte the published source. It is the artwork; there
 * is no reason to touch it and every reason not to.
 *
 * WHY THE GATES EXIST
 *
 * This runs on the screen where a voter types their own name, in a hall, on
 * whatever hardware the school owns. So:
 *
 *   1. It never mounts without WebGL. The same check the paper backdrop uses.
 *      Without it, a machine with no WebGL runs the whole setup, fails inside
 *      ogl, and leaves a dead canvas over the check-in desk.
 *   2. It never mounts under `prefers-reduced-motion`. A continuously moving
 *      field behind a text input is exactly what that setting is for.
 *   3. It stops when the tab is hidden. A kiosk left open overnight should not
 *      spend the night running a fragment shader.
 *
 * And it is decoration in the strict sense used everywhere else here:
 * `aria-hidden`, `pointer-events: none`, never in the tab order, and the check-in
 * form is complete and usable with it absent. Guardrail: "Decoration never
 * delays input and never gates a click."
 */

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \\
  int index = 0;                                            \\
  for (int i = 0; i < 2; i++) {                               \\
     ColorStop currentColor = colors[i];                    \\
     bool isInBetween = currentColor.position <= factor;    \\
     index = int(mix(float(index), float(i), float(isInBetween))); \\
  }                                                         \\
  ColorStop currentColor = colors[index];                   \\
  ColorStop nextColor = colors[index + 1];                  \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

export interface AuroraProps {
  /** Three hex colours, left to right across the viewport. */
  colorStops?: [string, string, string];
  /** Higher moves faster. */
  speed?: number;
  /** How softly the aurora meets the page. */
  blend?: number;
  /** Height intensity. */
  amplitude?: number;
}

export function Aurora({
  colorStops = ['#1B4D9B', '#DE2B1F', '#FFC20E'],
  speed = 0.35,
  blend = 0.55,
  amplitude = 0.9,
}: AuroraProps) {
  const propsRef = useRef({ colorStops, speed, blend, amplitude });
  propsRef.current = { colorStops, speed, blend, amplitude };

  const ctnDom = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const ctn = ctnDom.current;
    if (!ctn || !visible) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = 'transparent';

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const toRgb = (hex: string): [number, number, number] => {
      const c = new Color(hex);
      return [c.r, c.g, c.b];
    };

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uColorStops: { value: colorStops.map(toRgb) },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uBlend: { value: blend },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    ctn.appendChild(gl.canvas);

    function resize() {
      if (!ctn) return;
      renderer.setSize(ctn.offsetWidth, ctn.offsetHeight);
      program.uniforms.uResolution.value = [ctn.offsetWidth, ctn.offsetHeight];
    }
    window.addEventListener('resize', resize);
    resize();

    let animateId = 0;
    const update = (t: number) => {
      animateId = requestAnimationFrame(update);
      const current = propsRef.current;
      program.uniforms.uTime.value = t * 0.01 * current.speed * 0.1;
      program.uniforms.uAmplitude.value = current.amplitude;
      program.uniforms.uBlend.value = current.blend;
      program.uniforms.uColorStops.value = current.colorStops.map(toRgb);
      renderer.render({ scene: mesh });
    };
    animateId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animateId);
      window.removeEventListener('resize', resize);
      if (gl.canvas.parentNode === ctn) ctn.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // colorStops is read through propsRef every frame; re-running on a new
    // array identity would tear the context down on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amplitude, blend, visible]);

  return <div ref={ctnDom} className="aurora-container" aria-hidden="true" />;
}
