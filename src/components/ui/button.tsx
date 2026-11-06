import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "filled" | "tonal" | "outlined" | "text" | "elevated";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  filled:
    "bg-primary text-on-primary border-[3px] border-outline shadow-level1 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-level2 active:translate-x-0 active:translate-y-0 active:shadow-level1",
  tonal:
    "bg-secondary-container text-on-secondary-container border-[3px] border-outline shadow-level1 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-level2 active:translate-x-0 active:translate-y-0 active:shadow-level1",
  outlined:
    "border-[3px] border-outline bg-surface text-on-surface hover:bg-primary-container hover:text-on-primary-container",
  text: "text-on-surface hover:bg-primary/20",
  elevated:
    "bg-surface text-on-surface border-[3px] border-outline shadow-level1 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-level2 active:translate-x-0 active:translate-y-0 active:shadow-level1",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-label-large rounded-radius-sm",
  md: "h-10 px-6 text-label-large rounded-radius-md",
  lg: "h-12 px-8 text-label-large rounded-radius-md",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "filled", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-bold transition-all duration-100 cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-0 focus-visible:border-outline",
          "disabled:opacity-50 disabled:pointer-events-none",
          "state-layer",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
