import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('keeps the accessible name clean when it is disabled with a reason', async () => {
    render(
      <Button id="continue" disabled disabledReason="Choose a candidate to continue.">
        Continue
      </Button>,
    );

    // Regression guard: the reason used to be a CHILD of the button, so the
    // accessible name became "Continue Choose a candidate to continue." —
    // announced in full on every focus.
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Choose a candidate to continue.');
  });

  it('does not reference a description when it is enabled', () => {
    render(
      <Button disabled={false} disabledReason="not shown">
        Continue
      </Button>,
    );
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby');
  });

  it('keeps decorative arrows out of the accessible name', () => {
    render(
      <Button>
        Continue <span aria-hidden="true">→</span>
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('does not fire while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Submit
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button).catch(() => undefined);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('meets the minimum touch target', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).toHaveStyle({ minHeight: 'var(--hit)' });
  });
});
