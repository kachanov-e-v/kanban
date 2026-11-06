import * as React from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-radius-lg bg-surface border border-outline",
        elevated ? "shadow-level2" : "shadow-level1",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
