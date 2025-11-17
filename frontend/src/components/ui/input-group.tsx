import * as React from 'react';
import { cn } from '@/lib/utils';

const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-2xl border border-input bg-background/95 px-2 py-1 shadow-sm transition focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        className
      )}
      {...props}
    />
  )
);
InputGroup.displayName = 'InputGroup';

const InputGroupSlot = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-1.5 text-muted-foreground', className)} {...props} />
  )
);
InputGroupSlot.displayName = 'InputGroupSlot';

export { InputGroup, InputGroupSlot };

