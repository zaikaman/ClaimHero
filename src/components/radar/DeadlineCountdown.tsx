import React from "react";
import { Clock, Warning, ShieldWarning, CheckCircle } from "@phosphor-icons/react";
import { formatDeadlineRemaining, formatDate, cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";

interface DeadlineCountdownProps {
  daysRemaining: number;
  statutoryDeadline: number;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  isWon?: boolean;
}

export const DeadlineCountdown: React.FC<DeadlineCountdownProps> = ({
  daysRemaining,
  statutoryDeadline,
  size = "md",
  showDetails = true,
  isWon = false,
}) => {
  const { text, isUrgent, isCritical } = formatDeadlineRemaining(daysRemaining);

  // Maximum standard ERISA window is 180 days
  const progressPercent = isWon ? 100 : Math.min(100, Math.max(0, (daysRemaining / 180) * 100));

  if (size === "sm") {
    if (isWon) {
      return (
        <Badge
          variant="outline"
          className="font-mono text-[10px] gap-1 px-2 py-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 shadow-2xs font-semibold"
        >
          <CheckCircle className="size-3 text-emerald-500" />
          <span>Case Resolved</span>
        </Badge>
      );
    }

    return (
      <Badge
        variant={isCritical ? "destructive" : "outline"}
        className={cn(
          "font-mono text-[10px] gap-1 px-2 py-0.5",
          isUrgent && !isCritical && "border-amber-500/50 text-amber-500 dark:text-amber-400"
        )}
      >
        {isCritical ? (
          <ShieldWarning className="size-3 animate-pulse" />
        ) : isUrgent ? (
          <Warning className="size-3" />
        ) : (
          <Clock className="size-3" />
        )}
        <span>{daysRemaining}d left</span>
      </Badge>
    );
  }

  if (isWon) {
    return (
      <div
        className="rounded-xl border border-emerald-500/30 p-3.5 space-y-2.5 transition-all bg-emerald-500/5 backdrop-blur-xl text-card-foreground shadow-sm shadow-emerald-500/5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-500">
              <CheckCircle className="size-3.5" />
            </div>
            <div>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block font-mono">
                Adjudication Status
              </span>
              <span className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                Claim Overturned & Won
              </span>
            </div>
          </div>

          <div className="text-right font-mono">
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">100%</span>
            <span className="text-[10px] text-muted-foreground block">Recovered</span>
          </div>
        </div>

        <Progress
          value={100}
          className="h-1.5 bg-emerald-500/20"
          indicatorClassName="bg-emerald-500"
        />

        {showDetails && (
          <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-muted-foreground border-t border-border/50">
            <span>Final Determination: Overturned</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Statutory Clock Closed</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 space-y-2.5 transition-all bg-card/50 backdrop-blur-xl text-card-foreground shadow-sm shadow-black/20",
        isCritical
          ? "border-destructive/40 bg-destructive/10"
          : isUrgent
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-white/[0.08]"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-lg border",
              isCritical
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : isUrgent
                ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                : "border-border bg-muted text-muted-foreground"
            )}
          >
            {isCritical ? (
              <ShieldWarning className="size-3.5" />
            ) : isUrgent ? (
              <Warning className="size-3.5" />
            ) : (
              <Clock className="size-3.5" />
            )}
          </div>
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
              ERISA Statutory Clock
            </span>
            <span
              className={cn(
                "text-xs font-semibold font-mono",
                isCritical
                  ? "text-destructive"
                  : isUrgent
                  ? "text-amber-500 dark:text-amber-400"
                  : "text-foreground"
              )}
            >
              {text}
            </span>
          </div>
        </div>

        <div className="text-right font-mono">
          <span className="text-base font-bold text-foreground">{daysRemaining}</span>
          <span className="text-[10px] text-muted-foreground block">/ 180 Days</span>
        </div>
      </div>

      <Progress
        value={progressPercent}
        className="h-1.5"
        indicatorClassName={
          isCritical
            ? "bg-destructive"
            : isUrgent
            ? "bg-amber-500"
            : "bg-primary"
        }
      />

      {showDetails && (
        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-muted-foreground border-t border-border/50">
          <span>Deadline: {formatDate(statutoryDeadline)}</span>
          <span>29 CFR § 2560.503-1</span>
        </div>
      )}
    </div>
  );
};
