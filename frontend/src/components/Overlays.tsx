import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject
} from 'react';
import { Button, IconButton } from './Button';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  tone?: 'default' | 'destructive';
  size?: 'confirm' | 'form' | 'rich';
  initialFocus?: 'primary' | 'secondary' | 'content';
  primaryActionRef?: RefObject<HTMLElement | null>;
  secondaryActionRef?: RefObject<HTMLElement | null>;
}

interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  width?: 'default' | 'wide';
}

interface PopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
}

interface BannerProps {
  title: string;
  detail: string;
  badge?: string;
  tone?: 'brand' | 'info' | 'warning' | 'critical';
  action?: ReactNode;
  onDismiss?: () => void;
  ariaLabel?: string;
}

interface ToastItem {
  id: string;
  title: string;
  detail?: string;
  tone?: 'info' | 'success' | 'warning' | 'critical';
  action?: ReactNode;
}

interface ToastViewportProps {
  toasts: ToastItem[];
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  dismissible = true,
  tone = 'default',
  size = 'confirm',
  initialFocus = 'primary',
  primaryActionRef,
  secondaryActionRef
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useOverlayLifecycle({
    open,
    containerRef: contentRef,
    onClose,
    dismissible,
    initialFocusRef: focusTargetForDialog(initialFocus, primaryActionRef, secondaryActionRef, contentRef)
  });

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="overlay-root" aria-live="polite">
      <div
        className="overlay-scrim"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && dismissible) {
            onClose();
          }
        }}
      >
        <section
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className={`dialog dialog-size-${size} dialog-tone-${tone}`}
        >
          {dismissible ? (
            <div className="dialog-close-row">
              <IconButton label="Close dialog" icon={<X size={18} />} onClick={onClose} />
            </div>
          ) : null}
          <div className="dialog-body">
            <header className="dialog-header">
              <h2 id={titleId}>{title}</h2>
              {description ? <p id={descriptionId}>{description}</p> : null}
            </header>
            {children ? <div className="dialog-content">{children}</div> : null}
            {footer ? <footer className="dialog-footer">{footer}</footer> : null}
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, title, description, children, footer, onClose, dismissible = true, width = 'default' }: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useOverlayLifecycle({
    open,
    containerRef: contentRef,
    onClose,
    dismissible,
    initialFocusRef: contentRef
  });

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="overlay-root" aria-live="polite">
      <div
        className="overlay-scrim overlay-scrim-drawer"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && dismissible) {
            onClose();
          }
        }}
      >
        <aside
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className={`drawer drawer-width-${width}`}
        >
          <div className="drawer-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p id={descriptionId}>{description}</p> : null}
            </div>
            {dismissible ? <IconButton label="Close drawer" icon={<X size={18} />} onClick={onClose} /> : null}
          </div>
          <div className="drawer-content">{children}</div>
          {footer ? <footer className="drawer-footer">{footer}</footer> : null}
        </aside>
      </div>
    </div>,
    document.body
  );
}

export function PopoverSurface({ open, anchorRef, onClose, children, ariaLabel }: PopoverProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const position = useMemo(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      return { top: 16, left: 16 };
    }
    return {
      top: rect.bottom + 8 + window.scrollY,
      left: Math.max(16, rect.left + window.scrollX)
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (contentRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={contentRef}
      className="popover-surface"
      role="dialog"
      aria-label={ariaLabel}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {children}
    </div>,
    document.body
  );
}

export function Banner({ title, detail, badge, tone = 'info', action, onDismiss, ariaLabel }: BannerProps) {
  return (
    <section className={`banner banner-tone-${tone}`} role="region" aria-label={ariaLabel ?? title}>
      <div className="banner-copy">
        {badge ? <p className="banner-badge">{badge}</p> : null}
        <h2 className="banner-title">{title}</h2>
        <p>{detail}</p>
      </div>
      <div className="banner-actions">
        {action}
        {onDismiss ? (
          <Button variant="ghost" size="compact" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function ToastViewport({ toasts }: ToastViewportProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-tone-${toast.tone ?? 'info'}`} role={toast.tone === 'critical' ? 'alert' : 'status'}>
          <strong>{toast.title}</strong>
          {toast.detail ? <p>{toast.detail}</p> : null}
          {toast.action ? <div className="toast-action">{toast.action}</div> : null}
        </div>
      ))}
    </div>
  );
}

interface OverlayLifecycleOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  dismissible: boolean;
  initialFocusRef: RefObject<HTMLElement | null>;
}

function useOverlayLifecycle({ open, containerRef, onClose, dismissible, initialFocusRef }: OverlayLifecycleOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const appRoot = document.getElementById('root');
    if (appRoot) {
      appRoot.setAttribute('aria-hidden', 'true');
      appRoot.setAttribute('inert', '');
    }
    document.body.style.overflow = 'hidden';

    const focusTarget = initialFocusRef.current ?? firstFocusable(containerRef.current);
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = getFocusable(containerRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;
      const currentIndex = focusable.indexOf(activeElement ?? focusable[0]);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      if (appRoot) {
        appRoot.removeAttribute('aria-hidden');
        appRoot.removeAttribute('inert');
      }
      previousFocusRef.current?.focus();
    };
  }, [containerRef, dismissible, initialFocusRef, onClose, open]);
}

function focusTargetForDialog(
  initialFocus: DialogProps['initialFocus'],
  primaryActionRef?: RefObject<HTMLElement | null>,
  secondaryActionRef?: RefObject<HTMLElement | null>,
  contentRef?: RefObject<HTMLElement | null>
) {
  if (initialFocus === 'secondary' && secondaryActionRef) {
    return secondaryActionRef;
  }
  if (initialFocus === 'content' && contentRef) {
    return contentRef;
  }
  return primaryActionRef ?? contentRef ?? { current: null };
}

function firstFocusable(container: HTMLElement | null) {
  return getFocusable(container)[0] ?? null;
}

function getFocusable(container: HTMLElement | null) {
  if (!container) {
    return [];
  }
  const candidates = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(candidates).filter((candidate) => !candidate.hasAttribute('aria-hidden'));
}
