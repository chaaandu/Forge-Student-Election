// @vitest-environment node
//
// Structural checks on the derived ballot document.
//
// These exist because of a real failure: a patch deleted the `#hint` element
// but left `hintEl.style.opacity = '1'` in the authored animation loop. Since
// requestAnimationFrame is the loop's first statement, it kept rescheduling
// while everything after the throw — drag, rotation, float, render — silently
// never ran. The sheet painted once during the intro and froze.
//
// Nothing in the test suite caught it, because the document parsed, served and
// contained all the right strings. It only shows up at runtime, and WebGL
// cannot run in CI. So these assert the things that would have failed instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const html = readFileSync(
  fileURLToPath(new URL('../../../public/paper/mesa-elections.html', import.meta.url)),
  'utf8',
);

const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
const app = scripts[1] ?? '';
/**
 * Parsed, not regexed. The scripts are stripped first so jsdom does not have to
 * chew through 600 KB of minified three.js and a megabyte of inlined base64 —
 * only the markup matters here, and jsdom does not execute scripts by default
 * anyway.
 */
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');
const { document } = new JSDOM(markup).window;

describe('the document is internally consistent', () => {
  it('every element the script reaches for actually resolves', () => {
    const wanted = [...app.matchAll(/getElementById\(['"]([a-zA-Z0-9_-]+)['"]\)/g)].map(
      (m) => m[1]!,
    );

    expect(wanted.length).toBeGreaterThan(0);
    for (const id of wanted) {
      expect(
        document.getElementById(id),
        `script calls getElementById('${id}') but it resolves to null — ` +
          `any property access on it throws, and inside the animation loop that ` +
          `silently stops everything after it`,
      ).not.toBeNull();
    }
  });

  it('every element the script queries actually resolves', () => {
    const selectors = [...app.matchAll(/querySelector(?:All)?\(['"]([^'"]+)['"]\)/g)].map(
      (m) => m[1]!,
    );
    for (const selector of selectors) {
      expect(document.querySelector(selector), `script queries "${selector}" and gets null`).not.toBeNull();
    }
  });

  it('keeps the canvas the renderer binds to', () => {
    expect(document.getElementById('gl')?.tagName).toBe('CANVAS');
  });

  it('keeps the hint node, emptied rather than deleted', () => {
    // The loop writes hintEl.style every frame; the node must survive even
    // though its text must not.
    const hint = document.getElementById('hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent?.trim()).toBe('');
    expect(hint?.getAttribute('style')).toContain('display:none');
    expect(html).not.toMatch(/Drag<\/b> to turn/);
    expect(html).not.toMatch(/Hover<\/b> to light/);
  });

  it('keeps the per-frame float and the drag handling intact', () => {
    // The symptoms of the bug were "it does not float" and "it does not drag",
    // because both live after the throwing line.
    expect(app).toContain('group.position.y = Math.sin(t*0.36)*0.06*idle');
    expect(app).toContain('group.position.x = sheetOffsetX + Math.sin(t*0.21)*0.05*idle');
    expect(app).toContain('group.rotation.y = dragYaw');
    expect(app).toContain('renderer.render(');
  });

  it('runs the animation loop', () => {
    expect(app).toContain('requestAnimationFrame(frame)');
    expect(app).toMatch(/function frame\(\)/);
  });
});
