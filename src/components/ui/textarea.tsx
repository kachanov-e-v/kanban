import * as React from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="type-label-large text-on-surface-variant">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "min-h-[96px] w-full px-4 py-3 type-body-large rounded-radius-sm bg-surface border-[3px] border-outline text-on-surface placeholder:text-on-surface/50 resize-y",
            "transition-colors duration-100",
            "focus:outline-none focus:ring-0 focus:border-primary",
            error && "border-error focus:border-error",
            className,
          )}
          aria-invalid={!!error}
          {...props}
        />
        {error && (
          <p className="type-body-medium text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
