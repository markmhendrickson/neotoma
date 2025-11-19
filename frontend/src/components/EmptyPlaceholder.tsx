import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyPlaceholderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function EmptyPlaceholderBase({ className, children, ...props }: EmptyPlaceholderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-8 py-12 text-center shadow-sm',
        className
      )}
      {...props}
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">{children}</div>
    </div>
  );
}

interface EmptyPlaceholderSectionProps {
  children?: ReactNode;
}

function EmptyPlaceholderIcon({ children }: EmptyPlaceholderSectionProps) {
  if (!children) return null;
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
      {children}
    </div>
  );
}

function EmptyPlaceholderTitle({ children }: EmptyPlaceholderSectionProps) {
  if (!children) return null;
  return <h2 className="text-2xl font-semibold tracking-tight text-foreground">{children}</h2>;
}

function EmptyPlaceholderDescription({ children }: EmptyPlaceholderSectionProps) {
  if (!children) return null;
  return <div className="text-base leading-relaxed text-muted-foreground">{children}</div>;
}

function EmptyPlaceholderActions({ children }: EmptyPlaceholderSectionProps) {
  if (!children) return null;
  return <div className="flex flex-col items-center gap-4">{children}</div>;
}

export const EmptyPlaceholder = Object.assign(EmptyPlaceholderBase, {
  Icon: EmptyPlaceholderIcon,
  Title: EmptyPlaceholderTitle,
  Description: EmptyPlaceholderDescription,
  Actions: EmptyPlaceholderActions,
});



