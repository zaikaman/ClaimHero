import * as React from "react";
import { cn } from "../../lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
}

export function Progress({
  className,
  value = 0,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const boundedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      data-slot="progress"
      className={cn(
        "relative flex h-1.5 w-full items-center overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("h-full bg-primary transition-all duration-300 rounded-full", indicatorClassName)}
        style={{ width: `${boundedValue}%` }}
      />
    </div>
  );
}
