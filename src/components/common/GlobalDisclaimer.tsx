import React from "react";
import { ShieldWarning, Info } from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

interface GlobalDisclaimerProps {
  variant?: "banner" | "card" | "inline" | "footer";
  className?: string;
}

export const GlobalDisclaimer: React.FC<GlobalDisclaimerProps> = ({
  variant = "banner",
  className,
}) => {
  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
        <Info className="size-3.5 shrink-0 text-muted-foreground/80" />
        <span>
          Administrative decision-support workspace. Human review required before submission. Not legal or medical advice.
        </span>
      </div>
    );
  }

  if (variant === "footer") {
    return (
      <div
        className={cn(
          "w-full py-3 px-4 text-center border-t border-border/40 bg-background/50 text-[11px] text-muted-foreground leading-relaxed",
          className
        )}
      >
        <p className="max-w-4xl mx-auto">
          <strong className="font-semibold text-foreground/80">Notice:</strong> ClaimHero is an administrative evidence organization workspace for healthcare appeal preparation. ClaimHero does not provide legal advice, medical advice, clinical diagnosis, or treatment plans. All appeal briefs, physician statements, and insurer communications require independent human review and approval prior to transmission.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground flex items-start gap-2.5",
        className
      )}
    >
      <ShieldWarning className="size-4 shrink-0 text-amber-500 mt-0.5" />
      <div className="space-y-0.5 min-w-0">
        <p className="font-semibold text-foreground text-[11.5px]">
          Administrative Appeal Workspace &bull; Human Review Required
        </p>
        <p className="text-[11px] text-muted-foreground">
          ClaimHero assists denial teams and patients by evaluating documentation completeness and published coverage guidelines. ClaimHero does not provide legal or medical advice and does not guarantee that denials will be overturned. All appeal packets require verified human review before dispatch.
        </p>
      </div>
    </div>
  );
};
