import * as React from "react";
import { cn } from "../../lib/utils";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive" | "warning" | "success";
}

function Alert({
  className,
  variant = "default",
  ...props
}: AlertProps) {
  const variantStyles = {
    default: "bg-card text-card-foreground border-border",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20 dark:text-amber-400",
    success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  };

  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        "relative w-full rounded-xl border p-3.5 text-xs [&>svg]:size-4 [&>svg]:shrink-0 flex items-start gap-2.5",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("font-medium text-xs leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-xs text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
