import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-mono font-medium transition-colors border select-none',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-border bg-secondary text-secondary-foreground',
        outline:
          'border-border bg-white text-muted-foreground',
        supporting:
          'border-emerald-200/90 bg-emerald-50 text-emerald-800',
        contradicting:
          'border-amber-200/90 bg-amber-50 text-amber-900',
        dissent:
          'border-amber-200/90 bg-amber-50 text-amber-900',
        destructive:
          'border-rose-200/90 bg-rose-50 text-rose-800',
        neutral:
          'border-stone-200 bg-stone-100 text-stone-700',
        highlight:
          'border-sky-200/90 bg-sky-50 text-sky-800',
        warning:
          'border-amber-200/90 bg-amber-50 text-amber-900',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
