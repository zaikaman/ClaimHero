import * as React from "react";
import { cn } from "../../lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm" | "lg";
}

function Avatar({ className, size = "default", ...props }: AvatarProps) {
  const sizeStyles = {
    default: "size-8 text-xs",
    sm: "size-6 text-[10px]",
    lg: "size-10 text-sm",
  };

  return (
    <div
      data-slot="avatar"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-medium select-none",
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback };
