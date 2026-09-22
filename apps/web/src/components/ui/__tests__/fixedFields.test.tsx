import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../Button';
import { CandidateCard } from '@/components/election/CandidateCard';
import { contrastRatio, inkOn, accessibleField, AA_BODY } from '@/lib/color';

/**
 * Type on a FIXED colour field must not follow the page's ink.
 *
 * This is the one rule the dark ground broke everywhere, and it broke silently.
 *
 * `--color-ink` is the page's foreground and it INVERTS: black on paper, cream
 * at night. `--bh-yellow` does not invert — it is the same yellow on both
 * grounds. So any element that pairs them is correct on exactly one ground by
 * coincidence. Measured in Chrome before this was fixed, the primary button
 * was cream-on-yellow at 1.39:1 at night: Start voting, Continue, That's me,
 * Confirm & Submit Vote, Cast my vote. Every forward action in the app.
 *
 * The same class of bug was ALREADY SHIPPING on paper and nobody had measured
 * it: the selected candidate's name sat at 3.92:1 because the default accent
 * was the string 'var(--bh-red)', which `roleFor` cannot read, so the whole
 * ink-on-field machinery was skipped and it fell back to the page ink.
 *
 * The existing contrast.test.ts could not catch either one. It asserts TOKENS
 * against each other; these are failures of which token was used where.
 */
describe('type on a fixed colour field', () => {
  it('gives the primary button a fixed ink, not the page ink', () => {
    render(<Button variant="primary">Continue</Button>);
    const button = screen.getByRole('button', { name: 'Continue' });

    // Stated on the element, so it cannot be inverted by a change of ground.
    expect(button.style.color).toBe('var(--color-ink-fixed)');
  });

  it('does NOT force that ink on a disabled primary, which has its own field', () => {
    // An inline style outranks the `:disabled` rule in the stylesheet. Left
    // unscoped it painted fixed black onto the dark sunk field: 1.09:1.
    render(
      <Button variant="primary" disabled disabledReason="x">
        Continue
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Continue' }).style.color).toBe('');
  });

  it('is black, and black is the right answer on every primary we use as a field', () => {
    // --color-ink-fixed is #141414. Checked against the one fixed field it
    // actually sits on rather than asserted in the abstract.
    expect(inkOn('#FFC20E')).toBe('#141414');
  });

  it('passes the accent to the candidate card as a literal roleFor can read', () => {
    const candidate = { id: 'c1', name: 'A Candidate', positionId: 'p', active: true };
    const { container } = render(
      <CandidateCard
        candidate={candidate}
        index={0}
        selected
        onSelect={() => {}}
        tabbable
        onKeyDown={() => {}}
      />,
    );

    const card = container.querySelector<HTMLElement>('[data-candidate-card]')!;
    const field = card.style.getPropertyValue('--field');
    const onField = card.style.getPropertyValue('--on-field');

    // A var() here means roleFor was never given a colour it could correct.
    expect(field).not.toContain('var(');
    expect(onField).not.toContain('var(');
    expect(contrastRatio(onField, field)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('proves the premise: on the raw red only ONE of the two inks works', () => {
    // Black is 3.92:1 here and white is 4.70:1, so the choice is not cosmetic
    // and it is not the page's ink. Falling back to --color-ink picked black on
    // paper — the failing one — purely because black is what paper happens to
    // use. inkOn() picks by measurement instead.
    expect(contrastRatio('#141414', '#DE2B1F')).toBeLessThan(AA_BODY);
    expect(contrastRatio('#FFFFFF', '#DE2B1F')).toBeGreaterThanOrEqual(AA_BODY);
    expect(inkOn('#DE2B1F')).toBe('#FFFFFF');

    const corrected = accessibleField('#DE2B1F');
    expect(contrastRatio(corrected.ink, corrected.field)).toBeGreaterThanOrEqual(AA_BODY);
  });
});
