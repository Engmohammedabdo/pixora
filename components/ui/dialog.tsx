'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-modal bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const t = useTranslations('common');
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-modal grid grid-rows-[minmax(0,1fr)] w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] translate-x-[-50%] translate-y-[-50%] border bg-surface p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg',
          className
        )}
        {...props}
      >
        {/* The Close button must live outside the scrolling container: it is
            positioned absolute to its nearest scrollable ancestor, so if it shared
            that ancestor with the content, a tall dialog would scroll it off-screen.
            `gap-4` moves down onto this wrapper (as its own grid) so header/body/
            footer keep the same spacing they had as direct grid children before.
            The outer's implicit grid row defaults to auto-sizing to CONTENT (not
            to the container's max-height), so without `grid-rows-[minmax(0,1fr)]`
            forcing that row to shrink, this wrapper's `overflow-y-auto` never
            actually engages — content just paints past max-h-[85dvh] uncontained,
            unscrollable, and the Close button ends up positioned over it. Verified
            empirically: without the row-track fix, scrollHeight === clientHeight
            (no scrollbar) even though content clearly overflows the dialog. */}
        <div className="grid gap-4 min-h-0 overflow-y-auto">{children}</div>
        <DialogPrimitive.Close className="absolute end-2 top-2 flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-[var(--color-surface)] transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-2">
          <X className="h-4 w-4" />
          <span className="sr-only">{t('close')}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-start', className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-[var(--color-text-secondary)]', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
};
