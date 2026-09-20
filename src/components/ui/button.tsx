import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98] cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700',
        destructive:
          'bg-rose-600 text-white shadow-sm hover:bg-rose-500 active:bg-rose-700',
        outline:
          'border border-border bg-card/60 text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-muted-foreground/30',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        ghost:
          'text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/80',
        link:
          'text-primary underline-offset-4 hover:underline active:scale-100',
        subtle:
          'bg-muted/70 text-foreground hover:bg-muted active:bg-muted/90 border border-border/50',
      },
      size: {
        default: 'h-9 px-4 py-2 text-sm',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6 text-base font-semibold',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
