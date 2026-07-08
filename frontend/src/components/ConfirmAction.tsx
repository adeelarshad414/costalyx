import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Overlays';

interface ConfirmActionProps {
  actionLabel: string;
  consequence: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  progressLabel?: string;
  tone?: 'default' | 'destructive';
  title?: string;
  confirmLabel?: string;
  requiredConfirmationText?: string;
  children?: ReactNode;
}

export function ConfirmAction({
  actionLabel,
  consequence,
  onConfirm,
  disabled = false,
  progressLabel = 'Working...',
  tone = 'default',
  title,
  confirmLabel,
  requiredConfirmationText,
  children
}: ConfirmActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const secondaryActionRef = useRef<HTMLButtonElement | null>(null);
  const resolvedConfirmLabel = useMemo(() => confirmLabel ?? `Confirm ${actionLabel.toLowerCase()}`, [actionLabel, confirmLabel]);
  const canConfirm = !requiredConfirmationText || typedValue === requiredConfirmationText;
  const dialogTitle = title ?? `Confirm ${actionLabel}`;

  return (
    <div className="confirm-action">
      <Button variant={tone === 'destructive' ? 'destructive-quiet' : 'secondary'} onClick={() => setIsConfirming(true)} disabled={disabled || isConfirming || isSubmitting}>
        {children ?? actionLabel}
      </Button>
      <Dialog
        open={isConfirming}
        title={dialogTitle}
        description={consequence}
        onClose={() => {
          setIsConfirming(false);
          setTypedValue('');
        }}
        dismissible={tone !== 'destructive'}
        tone={tone}
        size="confirm"
        initialFocus={tone === 'destructive' ? 'secondary' : 'primary'}
        primaryActionRef={primaryActionRef}
        secondaryActionRef={secondaryActionRef}
        footer={
          <>
            <Button
              ref={secondaryActionRef}
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => {
                setIsConfirming(false);
                setTypedValue('');
              }}
            >
              Cancel
            </Button>
            <Button
              ref={primaryActionRef}
              variant={tone === 'destructive' ? 'destructive' : 'primary'}
              isLoading={isSubmitting}
              loadingLabel={progressLabel}
              disabled={!canConfirm}
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  await onConfirm();
                  setIsConfirming(false);
                  setTypedValue('');
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {resolvedConfirmLabel}
            </Button>
          </>
        }
      >
        {requiredConfirmationText ? (
          <label className="field-row confirm-action-input">
            <span>Type {requiredConfirmationText} to continue</span>
            <input value={typedValue} onChange={(event) => setTypedValue(event.target.value)} />
          </label>
        ) : null}
      </Dialog>
    </div>
  );
}
