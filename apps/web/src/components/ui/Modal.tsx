'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  initialFocus?: (event: Event) => void;
  contentClassName?: string;
}

export default function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocus,
  contentClassName = '',
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-dialog__overlay" />
        <Dialog.Content
          className={`ui-dialog__content ui-dialog__content--${size} ${contentClassName}`}
          onOpenAutoFocus={initialFocus}
        >
          <header className="ui-dialog__header">
            <div className="ui-dialog__heading">
              <Dialog.Title className="ui-dialog__title">{title}</Dialog.Title>
              {description && <Dialog.Description className="ui-dialog__description">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="ui-dialog__close" aria-label="关闭弹窗" title="关闭">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Dialog.Close>
          </header>
          <div className="ui-dialog__body">{children}</div>
          {footer && <footer className="ui-dialog__footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
