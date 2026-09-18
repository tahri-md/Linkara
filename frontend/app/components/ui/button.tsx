"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(101,198,53,0.2)] hover:bg-[#78d64c] hover:shadow-[0_8px_20px_rgba(101,198,53,0.3)] active:bg-[#55ad2b]",

        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:border-primary/60 hover:bg-primary/10 hover:text-primary hover:shadow-[0_6px_16px_rgba(101,198,53,0.12)]",

        outline:
          "border border-border bg-transparent text-foreground hover:border-primary hover:bg-primary/10 hover:text-primary hover:shadow-[0_6px_16px_rgba(101,198,53,0.1)]",

        ghost:
          "text-foreground hover:bg-primary/10 hover:text-primary",

        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",

        link:
          "text-primary underline-offset-4 hover:underline hover:text-primary/80",
      },

      size: {
        default: "h-10 px-4 py-2",

        sm: "h-9 rounded-md px-3",

        lg: "h-11 rounded-md px-8",

        icon: "h-10 w-10",
      },
    },

    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(
          buttonVariants({
            variant,
            size,
          }),
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
