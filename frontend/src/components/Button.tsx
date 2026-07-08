import { LoaderCircle } from 'lucide-react';
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'destructive-quiet' | 'link' | 'icon';
export type ButtonSize = 'compact' | 'default' | 'hero';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export interface ButtonProps extends ButtonBaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  style?: CSSProperties;
}

export interface ButtonLinkProps extends ButtonBaseProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'style'> {
  style?: CSSProperties;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'default',
    isLoading = false,
    loadingLabel,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  const label = isLoading && loadingLabel ? loadingLabel : children;

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      <ButtonContent
        variant={variant}
        isLoading={isLoading}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
      >
        {label}
      </ButtonContent>
    </button>
  );
});

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'link', size = 'default', leadingIcon, trailingIcon, fullWidth = false, className, children, ...props },
  ref
) {
  return (
    <a {...props} ref={ref} className={buttonClassName({ variant, size, fullWidth, className })}>
      <ButtonContent variant={variant} isLoading={false} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </a>
  );
});

interface IconButtonProps extends Omit<ButtonProps, 'variant' | 'children'> {
  label: string;
  icon: ReactNode;
}

export function IconButton({ label, icon, title, ...props }: IconButtonProps) {
  return (
    <Button
      {...props}
      variant="icon"
      aria-label={label}
      title={title ?? label}
      leadingIcon={icon}
    />
  );
}

interface ButtonClassNameOptions {
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth: boolean;
  className?: string;
}

export function buttonClassName({ variant, size, fullWidth, className }: ButtonClassNameOptions) {
  return compact([
    'button',
    `button-variant-${variant}`,
    `button-size-${size}`,
    fullWidth ? 'button-full-width' : '',
    className ?? ''
  ]).join(' ');
}

interface ButtonContentProps {
  variant: ButtonVariant;
  isLoading: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
}

function ButtonContent({ variant, isLoading, leadingIcon, trailingIcon, children }: ButtonContentProps) {
  const icon = isLoading ? <LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> : leadingIcon;
  const isIconOnly = variant === 'icon' && !children;

  return (
    <>
      {icon ? <span className="button-leading-icon" aria-hidden="true">{icon}</span> : null}
      {!isIconOnly ? <span className="button-label">{children}</span> : null}
      {!isLoading && trailingIcon ? <span className="button-trailing-icon" aria-hidden="true">{trailingIcon}</span> : null}
    </>
  );
}

function compact(values: string[]) {
  return values.filter(Boolean);
}
