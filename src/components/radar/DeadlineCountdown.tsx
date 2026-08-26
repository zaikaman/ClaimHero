import React from "react";
import { Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { formatDeadlineRemaining, formatDate } from "../../lib/utils";

interface DeadlineCountdownProps {
  daysRemaining: number;
  statutoryDeadline: number;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
}

export const DeadlineCountdown: React.FC<DeadlineCountdownProps> = ({
  daysRemaining,
  statutoryDeadline,
  size = "md",
  showDetails = true,
}) => {
  const { text, isUrgent, isCritical } = formatDeadlineRemaining(daysRemaining);

  // Maximum standard ERISA window is 180 days
  const progressPercent = Math.min(100, Math.max(0, (daysRemaining / 180) * 100));

  const getColorClasses = () => {
    if (isCritical) {
      return {
        text: "text-rose-400",
        border: "border-rose-500/50",
        bg: "bg-rose-950/40",
        bar: "bg-gradient-to-r from-rose-600 to-rose-400",
        glow: "shadow-rose-glow",
      };
    }
    if (isUrgent) {
      return {
        text: "text-amber-400",
        border: "border-amber-500/50",
        bg: "bg-amber-950/40",
        bar: "bg-gradient-to-r from-amber-600 to-amber-400",
        glow: "shadow-amber-glow",
      };
    }
    return {
      text: "text-emerald-400",
      border: "border-emerald-500/50",
      bg: "bg-emerald-950/40",
      bar: "bg-gradient-to-r from-emerald-600 to-emerald-400",
      glow: "shadow-emerald-glow",
    };
  };

  const colors = getColorClasses();

  if (size === "sm") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border ${colors.bg} ${colors.border} ${colors.text} text-[11px] font-mono font-bold`}
      >
        {isCritical ? (
          <ShieldAlert className="h-3 w-3 animate-pulse" />
        ) : isUrgent ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        <span>{daysRemaining}d Left</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${colors.bg} ${colors.border} space-y-3 transition-all ${
        isCritical ? "animate-pulse shadow-rose-glow" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border ${colors.border} bg-slate-950`}>
            {isCritical ? (
              <ShieldAlert className={`h-4 w-4 ${colors.text}`} />
            ) : isUrgent ? (
              <AlertTriangle className={`h-4 w-4 ${colors.text}`} />
            ) : (
              <Clock className={`h-4 w-4 ${colors.text}`} />
            )}
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block tracking-wider">
              ERISA Statutory Clock
            </span>
            <span className={`text-xs font-mono font-bold ${colors.text}`}>{text}</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-lg font-mono font-black text-white">{daysRemaining}</span>
          <span className="text-[10px] font-mono text-slate-500 block">/ 180 Days</span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="space-y-1">
        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {showDetails && (
        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-400 border-t border-slate-800/80">
          <span>Deadline: {formatDate(statutoryDeadline)}</span>
          <span className="text-slate-500">29 CFR § 2560.503-1</span>
        </div>
      )}
    </div>
  );
};
