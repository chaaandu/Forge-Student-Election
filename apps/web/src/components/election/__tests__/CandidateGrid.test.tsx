import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Candidate } from '@mesa/election-core';
import { CandidateGrid } from '../CandidateGrid';
import { BallotProgress } from '../BallotProgress';
import { opticalScale } from '@/components/bauhaus/Shape';
import type { Position } from '@mesa/election-core';

const candidates = (n: number): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Candidate ${i}`,
    positionId: 'p',
    active: true,
  }));

/**
 * The width lives in a stylesheet rule, not an inline style: jsdom's CSSOM
 * drops `clamp()` from inline styles, and a shared class is the better place
 * for it regardless.
 */
const grid = (n: number): HTMLElement => {
  const { container } = render(
    <CandidateGrid candidates={candidates(n)} onSelect={() => {}} labelledBy="h" />,
  );
  return container.querySelector<HTMLElement>('[role="radiogroup"]')!;
};

/**
 * The height lives in a stylesheet rule: jsdom's CSSOM drops `clamp()` from
 * inline styles, and a shared class is the better home for it regardless.
 */
const photoClasses = (n: number): string[] => {
  const { container } = render(
    <CandidateGrid candidates={candidates(n)} onSelect={() => {}} labelledBy="h" />,
  );
  return [...container.querySelectorAll<HTMLElement>('[data-photo]')].map((el) => el.className);
};

const css = (n: number): string => {
  const { container } = render(
    <CandidateGrid candidates={candidates(n)} onSelect={() => {}} labelledBy="h" />,
  );
  return [...container.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n');
};

/**
 * Every position plate must be the same height, whatever the field size.
 *
 * The grid used to share the row out between however many candidates there
 * were, so two candidates became two very wide cards — and because the portrait
 * is 4:5, a wider card is a taller card. The positions with the FEWEST
 * candidates produced the TALLEST pages, and the layout resized under the voter
 * at every step.
 */
describe('CandidateGrid keeps every position the same size', () => {
  it('fixes the photo height rather than its aspect ratio', () => {
    // This is the whole mechanism. With an aspect ratio, a wider card is a
    // taller card, so the positions with the FEWEST candidates produced the
    // TALLEST pages. A fixed height decouples the two.
    for (const n of [2, 3, 4]) {
      expect(css(n), `${n} candidates`).toMatch(/\.bh-photo\s*\{[^}]*height:/);
      expect(css(n), `${n} candidates still uses an aspect ratio`).not.toMatch(/aspect-ratio/);
    }
  });

  it('gives the photo the same height whether there are 2, 3 or 4 candidates', () => {
    const rule = /\.bh-photo\s*\{[^}]*\}/;
    const two = css(2).match(rule)?.[0];
    expect(two).toBeTruthy();
    expect(css(3).match(rule)?.[0]).toBe(two);
    expect(css(4).match(rule)?.[0]).toBe(two);
    expect(new Set(photoClasses(4)).size).toBe(1);
  });

  it('lets a short field widen into the plate instead of leaving it empty', () => {
    const columns = grid(2).style.gridTemplateColumns || grid(2).getAttribute('style') || '';
    expect(columns).toContain('auto-fit');
    // Capped, so two candidates widen but do not become letterboxes.
    expect(columns).toContain('300px');
  });

  it('centres the row', () => {
    expect(grid(2).className).toContain('justify-center');
  });

  it('still exposes one radio per candidate', () => {
    expect(grid(4).querySelectorAll('[role="radio"]')).toHaveLength(4);
  });
});

const steps = (n: number): Position[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    title: `Step ${i}`,
    order: i,
    kind: 'leadership' as const,
    eligibility: { voterTypes: ['student' as const] },
  }));

/**
 * The progress row used to cycle the four elementary forms. At equal bounding
 * boxes a semicircle carries 39% of a square's ink, so the row read as uneven —
 * and the variety told a voter nothing. Uniform boxes, marked in ink.
 */
describe('BallotProgress reads as one even row', () => {
  it('uses one box per step, all the same size', () => {
    const { container } = render(
      <BallotProgress steps={steps(6)} currentIndex={0} selections={{}} />,
    );
    const boxes = [...container.querySelectorAll<HTMLElement>('.bh-box')];

    expect(boxes).toHaveLength(6);
    // No shape variation: every box is the same element with the same geometry.
    expect(new Set(boxes.map((b) => b.tagName)).size).toBe(1);
    expect(container.querySelectorAll('svg[viewBox="0 0 32 32"]')).toHaveLength(0);
  });

  it('marks the steps that are answered', () => {
    const { container } = render(
      <BallotProgress steps={steps(4)} currentIndex={2} selections={{ s0: 'x', s1: 'y' }} />,
    );
    expect(container.querySelectorAll('.bh-box__mark')).toHaveLength(2);
  });

  it('shows the voter their own total, not the election total', () => {
    const { getByText } = render(
      <BallotProgress steps={steps(6)} currentIndex={0} selections={{}} />,
    );
    expect(getByText('1 of 6')).toBeInTheDocument();
  });
});

describe('Shape carries equal ink, not equal boxes', () => {
  it('scales each form to the area of a square', () => {
    expect(opticalScale('square')).toBeCloseTo(1, 5);
    expect(opticalScale('circle')).toBeCloseTo(1.128, 3);
    expect(opticalScale('triangle')).toBeCloseTo(1.414, 3);
    // The worst offender: a semicircle is 39% of its box.
    expect(opticalScale('arc')).toBeCloseTo(1.596, 3);
  });

  it('means a triangle and a square drawn at the same size cover the same ink', () => {
    const size = 20;
    const area = (form: 'square' | 'triangle' | 'circle' | 'arc', unit: number) =>
      ({ square: 1, circle: Math.PI / 4, triangle: 0.5, arc: Math.PI / 8 })[form] * unit ** 2;

    const square = area('square', size * opticalScale('square'));
    for (const form of ['circle', 'triangle', 'arc'] as const) {
      expect(area(form, size * opticalScale(form)), form).toBeCloseTo(square, 4);
    }
  });
});
