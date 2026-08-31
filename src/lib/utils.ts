import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CLAIM_STATUS_CONFIG, ClaimStatus } from "./constants";
import { RiskLevel } from "../types";

/**
 * Merge Tailwind classes cleanly without conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format numerical dollar amounts into standard US healthcare currency strings
 * e.g. 24500 -> "$24,500.00"
 */
export function formatCurrency(
  amount: number,
  options?: { hideCentsIfWhole?: boolean; minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const minDigits = options?.minimumFractionDigits ?? (options?.hideCentsIfWhole && Number.isInteger(amount) ? 0 : 2);
  const maxDigits = options?.maximumFractionDigits ?? (options?.hideCentsIfWhole && Number.isInteger(amount) ? 0 : 2);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

/**
 * Format timestamps into human-readable medical record dates
 */
export function formatDate(timestampOrDateString: number | string): string {
  const date =
    typeof timestampOrDateString === "number"
      ? new Date(timestampOrDateString)
      : new Date(timestampOrDateString);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Format datetime with hours and minutes
 */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

/**
 * Format statutory deadline countdown
 */
export function formatDeadlineRemaining(days: number): {
  text: string;
  badgeClass: string;
  isUrgent: boolean;
  isCritical: boolean;
} {
  if (days <= 0) {
    return {
      text: "Deadline Expired",
      badgeClass: "bg-rose-950/80 text-rose-300 border-rose-600/60",
      isUrgent: true,
      isCritical: true,
    };
  }

  if (days <= 14) {
    return {
      text: `${days}d Remaining (Urgent)`,
      badgeClass: "bg-rose-950/60 text-rose-400 border-rose-500/50 shadow-crimson-glow",
      isUrgent: true,
      isCritical: true,
    };
  }

  if (days <= 45) {
    return {
      text: `${days}d Remaining`,
      badgeClass: "bg-amber-950/60 text-amber-400 border-amber-500/50",
      isUrgent: false,
      isCritical: false,
    };
  }

  return {
    text: `${days}d Statutory Clock`,
    badgeClass: "bg-slate-800/60 text-slate-300 border-slate-700",
    isUrgent: false,
    isCritical: false,
  };
}

/**
 * Get visual styling configuration for a claim status
 */
export function getStatusConfig(status: ClaimStatus | string) {
  return (
    CLAIM_STATUS_CONFIG[status as ClaimStatus] || {
      label: status,
      color: "text-slate-400",
      bg: "bg-slate-800/60",
      border: "border-slate-700",
      glow: "shadow-none",
    }
  );
}

/**
 * Get visual styling configuration for AI win risk level
 */
export function getRiskBadgeConfig(riskLevel?: RiskLevel | string) {
  switch (riskLevel) {
    case "high_confidence":
      return {
        label: "High Win Probability",
        color: "text-emerald-300",
        bg: "bg-emerald-950/60",
        border: "border-emerald-500/50",
        glow: "shadow-emerald-glow",
      };
    case "moderate":
      return {
        label: "Moderate Contestation",
        color: "text-amber-300",
        bg: "bg-amber-950/60",
        border: "border-amber-500/50",
        glow: "shadow-amber-glow",
      };
    case "complex_litigation":
      return {
        label: "Complex ERISA Litigation",
        color: "text-rose-300",
        bg: "bg-rose-950/60",
        border: "border-rose-500/50",
        glow: "shadow-crimson-glow",
      };
    default:
      return {
        label: "Evaluating...",
        color: "text-cyan-300",
        bg: "bg-cyan-950/40",
        border: "border-cyan-500/30",
        glow: "shadow-none",
      };
  }
}

/**
 * Get color gradient for win probability score (0-100)
 */
export function getScoreColor(score: number): {
  text: string;
  border: string;
  glow: string;
  bgGradient: string;
} {
  if (score >= 80) {
    return {
      text: "text-emerald-400",
      border: "border-emerald-500/60",
      glow: "shadow-emerald-glow",
      bgGradient: "from-emerald-500/20 to-teal-500/10",
    };
  }
  if (score >= 50) {
    return {
      text: "text-amber-400",
      border: "border-amber-500/60",
      glow: "shadow-amber-glow",
      bgGradient: "from-amber-500/20 to-orange-500/10",
    };
  }
  return {
    text: "text-rose-400",
    border: "border-rose-500/60",
    glow: "shadow-crimson-glow",
    bgGradient: "from-rose-500/20 to-red-500/10",
  };
}

/**
 * Strips raw markdown formatting characters (such as **, *, __, `) from strings
 * to ensure clean plain-text presentation in the UI without unrendered markdown tokens.
 */
export function stripMarkdownFormatting(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
