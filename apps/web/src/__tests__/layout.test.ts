// @vitest-environment node
//
// Layout invariants, checked at the source.
//
// These exist because of a real failure: the page used `px-4 py-6 sm:px-6
// sm:py-10` — 24px at the sides against 40px top and bottom — while the welcome
// panel sized itself with `calc(100vh - 3rem)`, a 48px allowance against 80px of
// actual padding. The frame was uneven AND overflowed by 32px, which ate the
// bottom margin.
//
// jsdom does not apply Tailwind, so pixel measurement is not available here.
// What IS checkable is the shape of the mistake: asymmetric padding on the page
// frame, and a viewport calc that has to be kept in sync with it by hand.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const screens = readdirSync(fileURLToPath(new URL('../screens', import.meta.url))).filter((f) =>
  f.endsWith('.tsx'),
);

describe('the page frame', () => {
  const app = read('App.tsx');
  // The outermost element of the render tree.
  const wrapper = app.match(/<div className="([^"]*min-h-screen[^"]*)"/)?.[1] ?? '';

  it('exists and fills the viewport', () => {
    expect(wrapper, 'could not find the page wrapper').not.toBe('');
    expect(wrapper).toMatch(/\bmin-h-screen\b/);
  });

  it('pads equally on all four sides', () => {
    // A symmetric `p-*` utility, at every breakpoint it defines.
    const symmetric = [...wrapper.matchAll(/(?:^|\s)(?:[a-z]+:)?p-(\d+)/g)];
    expect(symmetric.length, `padding utilities in "${wrapper}"`).toBeGreaterThan(0);

    // …and no axis-specific padding, which is how the sides and the top drifted
    // apart in the first place.
    expect(wrapper, 'page frame uses px-/py-, which can go out of step').not.toMatch(
      /(?:^|\s)(?:[a-z]+:)?p[xy]-/,
    );
  });

  it('lets the content grow instead of sizing it against the viewport', () => {
    expect(app).toMatch(/<main[^>]*className="[^"]*flex-1/);
  });
});

describe('no screen sizes itself against the viewport by hand', () => {
  it.each(screens)('%s uses flex, not a viewport calc', (file) => {
    const source = read(`screens/${file}`);
    expect(
      source,
      `${file} sizes itself with a viewport calc. That has to be kept in sync ` +
        `with the page padding by hand, and it was not. Use flex-1 instead.`,
    ).not.toMatch(/calc\(\s*100[dsl]?vh/);
  });
});
