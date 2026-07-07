import { useId, useState, type ReactNode } from 'react';

interface ConfirmActionProps {
  actionLabel: string;
  consequence: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  children?: ReactNode;
}

export function ConfirmAction({ actionLabel, consequence, onConfirm, disabled = false, children }: ConfirmActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const consequenceId = useId();
  const confirmLabel = `Confirm ${actionLabel.toLowerCase()}`;

  return (
    <div className="confirm-action">
      <button type="button" onClick={() => setIsConfirming(true)} disabled={disabled || isConfirming}>
        {children ?? actionLabel}
      </button>
      {isConfirming ? (
        <div className="confirm-action-panel" role="alertdialog" aria-label={`Confirm ${actionLabel}`} aria-describedby={consequenceId}>
          <p id={consequenceId}>{consequence}</p>
          <div className="confirm-action-buttons">
            <button type="button" className="secondary-button" onClick={() => setIsConfirming(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setIsConfirming(false);
                void onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
