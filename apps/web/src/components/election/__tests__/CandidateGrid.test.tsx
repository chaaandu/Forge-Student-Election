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
const slotClasses = (n: number): string[] => {
  const { container } = render(
    <CandidateGrid candidates={candidates(n)} onSelect={() => {}} labelledBy="h" />,
  );
  return [...container.querySelectorAll<HTMLElement>('[data-candidate-slot]')].map(
    (el) => el.className,
  );
};

const styleBlock = (n: number): string => {
  const { container } = render(
    <CandidateGrid candidates={candidates(n)} onSelect={() => {}} labelledBy="h" />,
  );
  // Each card injects its own <style> too, so take them all.
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
  it('gives a card the same width whether there are 2, 3 or 4 candidates', () => {
    const two = slotClasses(2);
    const three = slotClasses(3);
    const four = slotClasses(4);

    for (const set of [two, three, four]) {
      expect(new Set(set).size, 'cards within one position differ').toBe(1);
    }
    expect(two[0]).toBe(three[0]);
    expect(three[0]).toBe(four[0]);
  });

  it('caps the width, so a short field cannot stretch into a tall page', () => {
    const css = styleBlock(2);
    expect(css).toMatch(/\.bh-slot\s*\{[^}]*clamp\(/);
    // The old behaviour: a fractional track that grew to fill the row.
    expect(css).not.toContain('1fr');
    // The same rule regardless of how many candidates stand.
    expect(styleBlock(4)).toContain('.bh-slot { width: clamp(158px, 19vw, 200px); }');
  });

  it('centres a short field rather than stretching it', () => {
    const { container } = render(
      <CandidateGrid candidates={candidates(2)} onSelect={() => {}} labelledBy="h" />,
    );
    expect(container.querySelector('[role="radiogroup"]')?.className).toContain('justify-center');
  });

  it('still exposes one radio per candidate', () => {
    const { container } = render(
      <CandidateGrid candidates={candidates(4)} onSelect={() => {}} labelledBy="h" />,
    );
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(4);
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
