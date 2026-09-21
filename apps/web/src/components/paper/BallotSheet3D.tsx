import { useEffect, useRef, useState } from 'react';
import { drawBallotPrint, PRINT_HEIGHT, PRINT_WIDTH } from './ballotPrint';
import { useReducedMotion } from '@/lib/useReducedMotion';

export interface BallotSheet3DProps {
  title: string;
  subtitle: string;
  footer: string;
  /** Fires once the sheet is on screen, so the fallback can fade out. */
  onReady?: () => void;
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2  uPointer;
  uniform float uPointerStrength;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying float vHeight;

  // Height of the sheet at a point in its own plane.
  // Paper at rest is never flat: it holds a slow undulation, and its corners
  // lift more than its middle because that is where the stiffness runs out.
  float sheetHeight(vec2 p, float t) {
    float h  = sin(p.x * 2.10 + t * 0.35) * 0.030;
          h += sin(p.y * 1.70 - t * 0.28) * 0.024;
          h += sin((p.x + p.y) * 3.30 + t * 0.50) * 0.010;

    float corner = p.x * p.x + p.y * p.y;
    h *= 0.34 + corner * 0.95;

    // The pointer lifts the paper nearest it, as a hand would.
    float d = distance(p, uPointer);
    h += uPointerStrength * exp(-d * d * 2.2) * 0.14;
    return h;
  }

  void main() {
    vUv = uv;
    vec3 p = position;

    float h = sheetHeight(p.xy, uTime);
    vHeight = h;
    p.z += h;

    // Normal by finite difference: cheaper and steadier than any analytic
    // derivative of the sum above, and the sheet is smooth enough for it.
    float e = 0.035;
    float hx = sheetHeight(p.xy + vec2(e, 0.0), uTime);
    float hy = sheetHeight(p.xy + vec2(0.0, e), uTime);
    vec3 tangentX = normalize(vec3(e, 0.0, hx - h));
    vec3 tangentY = normalize(vec3(0.0, e, hy - h));
    vNormal = normalize(cross(tangentX, tangentY));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uPrint;
  uniform float uTime;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying float vHeight;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 base = texture2D(uPrint, vUv).rgb;

    // Paper fibre: fine, low-contrast, and slightly warm-biased so it reads as
    // pulp rather than as video noise.
    float fibre = hash(floor(vUv * 1400.0));
    base *= 0.975 + fibre * 0.05;
    base -= vec3(0.004, 0.006, 0.010) * hash(floor(vUv * 300.0));

    vec3 lightDir = normalize(vec3(-0.42, 0.58, 0.70));
    vec3 n = normalize(vNormal);

    // Wrap lighting. Real paper is thin enough to transmit light, so it never
    // goes fully dark on the side facing away.
    float diffuse = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);

    // A dry, broad sheen — uncoated stock, not gloss.
    vec3 view = vec3(0.0, 0.0, 1.0);
    float sheen = pow(max(dot(reflect(-lightDir, n), view), 0.0), 16.0) * 0.05;

    // Troughs gather a little shadow.
    float occlusion = 1.0 - clamp(-vHeight * 3.4, 0.0, 0.22);

    vec3 colour = base * (0.64 + diffuse * 0.46) * occlusion + sheen;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/**
 * The ballot sheet, in three dimensions.
 *
 * Strictly decorative, and strictly optional. It is lazily imported so Three.js
 * never enters the main bundle, it is not loaded at all when the voter prefers
 * reduced motion or the device has no WebGL, and the welcome screen is fully
 * usable — CTA included — before and without it. A kiosk with a weak GPU still
 * votes.
 */
export function BallotSheet3D({ title, subtitle, footer, onReady }: BallotSheet3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reducedMotion || failed) return;
    const host = hostRef.current;
    if (!host) return;

    // No WebGL, no 3D. The fallback sheet is a complete experience on its own.
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
        setFailed(true);
        return;
      }
    } catch {
      setFailed(true);
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import('three');
      // Fonts must be resolved before the print is rasterised, or the texture
      // bakes in the fallback typeface permanently.
      await document.fonts?.ready?.catch?.(() => undefined);
      if (disposed || !hostRef.current) return;

      const printCanvas = document.createElement('canvas');
      drawBallotPrint(printCanvas, { title, subtitle, footer });

      const texture = new THREE.CanvasTexture(printCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.needsUpdate = true;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

      const aspect = PRINT_WIDTH / PRINT_HEIGHT;
      const planeHeight = 1.82;
      const geometry = new THREE.PlaneGeometry(planeHeight * aspect, planeHeight, 140, 100);

      const uniforms = {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, -2) },
        uPointerStrength: { value: 0 },
        uPrint: { value: texture },
      };

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
      });

      const sheet = new THREE.Mesh(geometry, material);
      sheet.rotation.x = -0.1;
      sheet.rotation.y = 0.05;
      scene.add(sheet);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      hostRef.current.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';

      const resize = () => {
        const host_ = hostRef.current;
        if (!host_) return;
        const w = host_.clientWidth;
        const h = host_.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Pull back until the whole sheet fits, whatever the viewport shape.
        const fitByHeight = planeHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);
        const fitByWidth = (planeHeight * aspect) / 2 / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
        camera.position.z = Math.max(fitByHeight, fitByWidth) * 1.12;
        camera.updateProjectionMatrix();
      };

      const observer = new ResizeObserver(resize);
      observer.observe(hostRef.current);
      resize();

      let targetStrength = 0;
      const onPointerMove = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        uniforms.uPointer.value.set(x * (planeHeight * aspect) * 0.5, y * planeHeight * 0.5);
        targetStrength = 1;
      };
      const onPointerLeave = () => {
        targetStrength = 0;
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerleave', onPointerLeave);

      let frame = 0;
      let running = true;
      const clock = new THREE.Clock();

      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        if (!running) return;
        uniforms.uTime.value = clock.getElapsedTime();
        // Ease the lift so the paper settles rather than snapping.
        uniforms.uPointerStrength.value +=
          (targetStrength - uniforms.uPointerStrength.value) * 0.06;
        renderer.render(scene, camera);
      };
      tick();

      // A background tab must not keep a GPU busy in a school hall.
      const onVisibility = () => {
        running = document.visibilityState === 'visible';
        if (running) clock.getDelta();
      };
      document.addEventListener('visibilitychange', onVisibility);

      onReady?.();

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerleave', onPointerLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        geometry.dispose();
        material.dispose();
        texture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [title, subtitle, footer, reducedMotion, failed, onReady]);

  if (reducedMotion || failed) return null;

  return <div ref={hostRef} aria-hidden="true" className="absolute inset-0" />;
}
