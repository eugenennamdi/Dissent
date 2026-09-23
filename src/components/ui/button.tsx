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
          'bg-zinc-900 text-zinc-50 shadow-xs hover:bg-zinc-800 active:bg-zinc-950',
        destructive:
          'bg-rose-700 text-white shadow-xs hover:bg-rose-600 active:bg-rose-800',
        outline:
          'border border-border bg-white text-foreground shadow-xs hover:bg-zinc-50 hover:text-foreground hover:border-zinc-300',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-zinc-200/80 hover:text-foreground',
        ghost:
          'text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary/80',
        link:
          'text-foreground underline-offset-4 hover:underline active:scale-100 font-medium',
        subtle:
          'bg-secondary/80 text-foreground hover:bg-secondary active:bg-secondary/90 border border-border/70',
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
