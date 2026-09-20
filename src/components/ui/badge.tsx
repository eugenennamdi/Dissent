import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-mono font-medium transition-colors border select-none',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary/20 text-primary-foreground border-primary/30',
        secondary:
          'border-border bg-secondary text-secondary-foreground',
        outline:
          'border-border text-muted-foreground',
        supporting:
          'border-emerald-500/30 bg-emerald-950/40 text-emerald-400',
        contradicting:
          'border-amber-500/30 bg-amber-950/40 text-amber-300',
        dissent:
          'border-amber-500/30 bg-amber-950/40 text-amber-300',
        destructive:
          'border-rose-500/40 bg-rose-950/50 text-rose-300',
        neutral:
          'border-neutral-800 bg-neutral-900/60 text-neutral-400',
        highlight:
          'border-sky-500/30 bg-sky-950/40 text-sky-300',
        warning:
          'border-amber-500/30 bg-amber-950/40 text-amber-300',
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
