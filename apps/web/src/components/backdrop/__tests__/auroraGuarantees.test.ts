// @vitest-environment node
//
// The properties that make a decoration safe on the screen where a voter types
// their own name. Read from source, in the node environment, because they live
// in CSS and in module structure — jsdom computes neither.
//
// All of them were verified in Chrome first: `pointer-events` resolves to
// `none`, hit-testing the centre of the name field returns the input itself,
// and the three gates were each exercised with the browser emulating the
// condition. These assertions stop them being undone later.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const backdrop = read('../AuroraBackdrop.tsx');
const aurora = read('../Aurora.tsx');
const css = read('../Aurora.css');

describe('the aurora, as shipped', () => {
  it('cannot intercept a tap, in the stylesheet and on the element', () => {
    expect(css).toMatch(/pointer-events:\s*none/);
    expect(backdrop).toContain('pointer-events-none');
  });

  it('is hidden from assistive technology', () => {
    expect(backdrop).toContain('aria-hidden="true"');
    expect(aurora).toContain('aria-hidden="true"');
  });

  it('sits behind the plate, never above it', () => {
    // z-0 on the backdrop against z-10 on the check-in panel wrapper.
    expect(backdrop).toContain('z-0');
    expect(read('../../../screens/CheckInScreen.tsx')).toContain('relative z-10');
  });

  it('checks all three gates before it renders anything', () => {
    expect(backdrop).toContain("GROUND !== 'night'");
    expect(backdrop).toContain('reducedMotion');
    expect(backdrop).toContain('supportsWebGL()');
  });

  it('is lazy, so ogl is never in the chunk that reaches the name field', () => {
    // Measured: a 50 KB separate chunk against +0.7 KB on the main bundle.
    expect(backdrop).toMatch(/lazy\(/);
    expect(backdrop).toMatch(/import\(['"]\.\/Aurora['"]\)/);
  });

  it('stops its frame loop when the tab is hidden', () => {
    expect(aurora).toContain('visibilitychange');
  });

  it('keeps the published shader rather than a retyped one', () => {
    // The two load-bearing pieces of the original.
    expect(aurora).toContain('float snoise(vec2 v)');
    expect(aurora).toContain('#define COLOR_RAMP');
  });

  it('records the Commons Clause, which is not plain MIT', () => {
    const notices = read('../../../../../../THIRD_PARTY_NOTICES.md');
    expect(notices).toContain('Commons Clause');
    // The file used to claim no React Bits code remained. It does now.
    expect(notices).not.toContain('No React Bits code remains in this repository');
  });

  it('records the guardrail it breaks, rather than contradicting the doc', () => {
    const doc = read('../../../../../../docs/design-direction.md');
    expect(doc).toContain('with one stated exception: the check-in aurora');
    expect(doc).toContain('## 5c. The check-in aurora');
  });
});
