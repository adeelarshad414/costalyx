import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ConfirmAction } from './ConfirmAction';

describe('ConfirmAction', () => {
  it('requires an explicit confirmation with the consequence named before invoking the action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmAction
        actionLabel="Send statement"
        consequence="This emails the approved statement to Finance Partner and records delivery evidence."
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Send statement' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Confirm Send statement' })).toHaveTextContent(
      'This emails the approved statement to Finance Partner and records delivery evidence.'
    );

    await user.click(screen.getByRole('button', { name: 'Confirm send statement' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog and returns it to the trigger when a dismissible confirm closes', async () => {
    const user = userEvent.setup();

    render(
      <ConfirmAction
        actionLabel="Approve statement"
        consequence="This records approval and unlocks statement delivery."
        onConfirm={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Approve statement' });
    await user.click(trigger);

    const confirmButton = screen.getByRole('button', { name: 'Confirm approve statement' });
    expect(confirmButton).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Confirm Approve statement' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps destructive dialogs open on escape and focuses the safe secondary action first', async () => {
    const user = userEvent.setup();

    render(
      <ConfirmAction
        actionLabel="Delete connection"
        consequence="This removes the validated cloud connection and its onboarding artifacts."
        tone="destructive"
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete connection' }));

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Confirm Delete connection' })).toBeInTheDocument();
  });
});
