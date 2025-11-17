import * as React from 'react';
import { cn } from '@/lib/utils';

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}, ref) => (
  <div
    ref={ref}
    role="separator"
    aria-orientation={orientation}
    aria-hidden={decorative ? 'true' : undefined}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };

