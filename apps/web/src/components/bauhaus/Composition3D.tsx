import { useEffect, useRef, useState } from 'react';
import type * as THREE_NS from 'three';
import { useReducedMotion } from '@/lib/useReducedMotion';

export interface Composition3DProps {
  /** Fires once the scene is on screen, so the static artwork can fade out. */
  onReady?: () => void;
}

/**
 * The composition, built in space.
 *
 * Elementary forms — cube, disc, prism, half-cylinder — in the Bauhaus
 * primaries, under an ORTHOGRAPHIC camera. That is the whole idea: an
 * axonometric projection with no perspective convergence is exactly how the
 * Bauhaus and the Constructivists drew objects, and it keeps the image reading
 * as a poster rather than as a render.
 *
 * Shading is quantised to three flat bands and each solid is wrapped in an
 * inverted-hull black outline, so the result matches the heavy keylines of the
 * 2D interface. There is no smooth shading, no specular highlight and no
 * shadow: Bauhaus surfaces are flat.
 *
 * STRICTLY DECORATIVE, and strictly optional. Dynamically imported so Three.js
 * never enters the application bundle, skipped entirely under reduced motion or
 * a failed WebGL probe, and layered over `CompositionSVG` — which is the real,
 * complete artwork. A kiosk with a weak GPU still votes.
 */

const VERTEX = /* glsl */ `
  varying vec3 vViewPosition;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vViewPosition;

  void main() {
    // Flat facets from screen-space derivatives: every face reads as one plane,
    // whatever the geometry's own normals say.
    vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    vec3 lightDir = normalize(vec3(-0.45, 0.72, 0.52));

    float lambert = dot(n, lightDir) * 0.5 + 0.5;
    // Three bands, hard steps. Poster printing, not a light simulation.
    float band = floor(clamp(lambert, 0.0, 0.999) * 3.0) / 2.0;

    gl_FragColor = vec4(uColor * (0.62 + band * 0.38), 1.0);
  }
`;

interface Piece {
  form: 'cube' | 'disc' | 'prism' | 'half';
  colour: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  spin: number;
}

/** An asymmetric arrangement, weighted left, cropped by the frame. */
const PIECES: Piece[] = [
  { form: 'disc', colour: 0x1b4d9b, position: [-1.5, 0.1, 0], rotation: [0, 0, 0], scale: 1.25, spin: 0.09 },
  { form: 'cube', colour: 0xde2b1f, position: [0.75, 0.95, -0.4], rotation: [0.4, 0.7, 0], scale: 0.95, spin: -0.13 },
  { form: 'prism', colour: 0xffc20e, position: [1.75, -0.85, 0.3], rotation: [0, 0.3, 0.2], scale: 1.0, spin: 0.16 },
  { form: 'half', colour: 0x1e7a4c, position: [-1.95, -1.15, 0.5], rotation: [0, 0, 0], scale: 1.05, spin: -0.07 },
  { form: 'cube', colour: 0x141414, position: [1.95, 1.35, 0.6], rotation: [0.6, 0.2, 0.4], scale: 0.42, spin: 0.2 },
  { form: 'disc', colour: 0xffffff, position: [0.15, -1.25, 0.8], rotation: [0, 0, 0], scale: 0.52, spin: -0.18 },
];

export function Composition3D({ onReady }: Composition3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reducedMotion || failed) return;
    const host = hostRef.current;
    if (!host) return;

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
      if (disposed || !hostRef.current) return;

      const scene = new THREE.Scene();
      // Orthographic: no perspective convergence. The axonometric view.
      const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
      camera.position.set(3.6, 3.0, 6);
      camera.lookAt(0, 0, 0);

      const geometryFor = (form: Piece['form']): THREE_NS.BufferGeometry => {
        switch (form) {
          case 'cube':
            return new THREE.BoxGeometry(1.35, 1.35, 1.35);
          case 'disc':
            return new THREE.CylinderGeometry(0.95, 0.95, 0.3, 48);
          case 'prism':
            return new THREE.CylinderGeometry(0.95, 0.95, 0.34, 3);
          case 'half':
            return new THREE.CylinderGeometry(1.0, 1.0, 0.32, 32, 1, false, 0, Math.PI);
        }
      };

      const group = new THREE.Group();
      const disposables: { dispose(): void }[] = [];

      for (const piece of PIECES) {
        const geometry = geometryFor(piece.form);
        disposables.push(geometry);

        const material = new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms: { uColor: { value: new THREE.Color(piece.colour) } },
        });
        disposables.push(material);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...piece.position);
        mesh.rotation.set(...piece.rotation);
        mesh.scale.setScalar(piece.scale);
        // Discs and prisms are born lying down; stand them up to face the camera.
        if (piece.form !== 'cube') mesh.rotation.x += Math.PI / 2;

        // Inverted-hull outline: a slightly larger backface-only copy in black,
        // which is how the 2D keylines are carried into three dimensions.
        const outlineMaterial = new THREE.MeshBasicMaterial({
          color: 0x141414,
          side: THREE.BackSide,
        });
        disposables.push(outlineMaterial);
        const outline = new THREE.Mesh(geometry, outlineMaterial);
        outline.scale.setScalar(1.055);
        mesh.add(outline);

        mesh.userData['spin'] = piece.spin;
        group.add(mesh);
      }
      scene.add(group);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      hostRef.current.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, {
        width: '100%',
        height: '100%',
        display: 'block',
      });

      const resize = () => {
        const element = hostRef.current;
        if (!element) return;
        const w = element.clientWidth;
        const h = element.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        // Keep the composition framed whatever the viewport shape.
        const frustum = 3.4;
        const aspect = w / h;
        camera.left = -frustum * aspect;
        camera.right = frustum * aspect;
        camera.top = frustum;
        camera.bottom = -frustum;
        camera.updateProjectionMatrix();
      };

      const observer = new ResizeObserver(resize);
      observer.observe(hostRef.current);
      resize();

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointerMove = (event: PointerEvent) => {
        pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = -((event.clientY / window.innerHeight) * 2 - 1);
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });

      let frame = 0;
      let running = true;
      const clock = new THREE.Clock();

      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        if (!running) return;

        const t = clock.getElapsedTime();
        pointer.x += (pointer.tx - pointer.x) * 0.045;
        pointer.y += (pointer.ty - pointer.y) * 0.045;

        // Parallax, not orbit: the composition leans, it does not tumble.
        group.rotation.y = pointer.x * 0.26 + Math.sin(t * 0.12) * 0.05;
        group.rotation.x = pointer.y * -0.18 + Math.cos(t * 0.1) * 0.04;

        for (const child of group.children) {
          child.rotation.z += (child.userData['spin'] as number) * 0.004;
        }

        renderer.render(scene, camera);
      };
      tick();

      const onVisibility = () => {
        running = document.visibilityState === 'visible';
      };
      document.addEventListener('visibilitychange', onVisibility);

      onReady?.();

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('visibilitychange', onVisibility);
        for (const item of disposables) item.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [reducedMotion, failed, onReady]);

  if (reducedMotion || failed) return null;

  return <div ref={hostRef} aria-hidden="true" className="absolute inset-0" />;
}
