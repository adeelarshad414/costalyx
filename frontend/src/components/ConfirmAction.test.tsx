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
    expect(screen.getByRole('alertdialog', { name: 'Confirm Send statement' })).toHaveTextContent(
      'This emails the approved statement to Finance Partner and records delivery evidence.'
    );

    await user.click(screen.getByRole('button', { name: 'Confirm send statement' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
