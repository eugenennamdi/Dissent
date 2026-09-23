import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[120px] w-full rounded-md border border-input bg-card/60 px-3.5 py-3 text-sm font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400/40 focus-visible:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors leading-relaxed',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
