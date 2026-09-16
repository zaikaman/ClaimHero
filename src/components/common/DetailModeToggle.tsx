import React from "react";
import { GraduationCap } from "@phosphor-icons/react";
import { useDetailMode } from "../../hooks/useDetailMode";
import { cn } from "../../lib/utils";

interface DetailModeToggleProps {
  className?: string;
  compact?: boolean;
}

/**
 * Global Simple / Details switch.
 * Simple = everyday language. Details = expert labels
 * (CPT, CARC, CPB, ERISA cites, statutory posture).
 */
export const DetailModeToggle: React.FC<DetailModeToggleProps> = ({
  className,
  compact = false,
}) => {
  const { isDetailed, toggleDetailMode } = useDetailMode();

  return (
    <button
      type="button"
      onClick={toggleDetailMode}
      aria-pressed={isDetailed}
      aria-label={
        isDetailed
          ? "Showing expert detail. Switch to simple language."
          : "Showing simple language. Switch to expert detail."
      }
      title={
        isDetailed
          ? "Showing expert detail (codes, policy names, law cites). Click for simple language."
          : "Showing simple language. Click to reveal expert detail."
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer select-none",
        isDetailed
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/70 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60",
        className
      )}
    >
      <GraduationCap className="size-3.5 shrink-0" />
      {!compact && <span>{isDetailed ? "Details on" : "Simple"}</span>}
      <span
        className={cn(
          "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
          isDetailed ? "bg-primary/80" : "bg-muted"
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "size-3 rounded-full bg-white shadow transition-transform",
            isDetailed ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
};
