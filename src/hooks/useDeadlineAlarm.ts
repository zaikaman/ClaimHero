import { useState, useEffect, useMemo } from "react";
import { Claim, ClaimStatus } from "../types";

export type UrgencyTier = "overdue" | "emergency" | "critical" | "urgent" | "normal" | "resolved";

export interface DeadlineAlarmTarget {
  _id?: string;
  claimNumber?: string;
  status?: ClaimStatus | string;
  statutoryDeadline: number;
  daysRemaining?: number;
  appealFilingDeadlineDays?: number;
}

export interface LiveCountdown {
  diffMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isOverdue: boolean;
  isDueToday: boolean;
  isEmergency: boolean;
  isCritical: boolean;
  isUrgent: boolean;
  urgencyTier: UrgencyTier;
  formattedCountdown: string;
  progressPercent: number;
  shouldAlarm: boolean;
}

export interface PortfolioDeadlineStats {
  totalClaims: number;
  activeClaimsCount: number;
  criticalCount: number;
  overdueCount: number;
  urgentCount: number;
  hasActiveAlarm: boolean;
  nearestDeadlineClaim: Claim | DeadlineAlarmTarget | null;
  nearestDaysRemaining: number | null;
  summaryText: string;
}

export interface UseDeadlineAlarmOptions {
  refreshIntervalMs?: number;
  onCriticalAlarm?: (target: DeadlineAlarmTarget) => void;
}

const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * Pure calculation function for live deadline countdown.
 */
export function calculateLiveCountdown(
  statutoryDeadline: number,
  now: number = Date.now(),
  options?: {
    status?: string;
    appealFilingDeadlineDays?: number;
  }
): LiveCountdown {
  const isWon = options?.status === "won";
  const isLost = options?.status === "lost";
  const isResolved = isWon || isLost;

  const totalWindowDays =
    typeof options?.appealFilingDeadlineDays === "number" && options.appealFilingDeadlineDays > 0
      ? options.appealFilingDeadlineDays
      : 180;

  if (isWon) {
    return {
      diffMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isOverdue: false,
      isDueToday: false,
      isEmergency: false,
      isCritical: false,
      isUrgent: false,
      urgencyTier: "resolved",
      formattedCountdown: "Case Resolved & Overturned",
      progressPercent: 100,
      shouldAlarm: false,
    };
  }

  const diffMs = statutoryDeadline - now;
  const isOverdue = diffMs < 0;
  const absDiff = Math.abs(diffMs);

  const days = Math.floor(absDiff / ONE_DAY_MS);
  const hours = Math.floor((absDiff % ONE_DAY_MS) / ONE_HOUR_MS);
  const minutes = Math.floor((absDiff % ONE_HOUR_MS) / ONE_MINUTE_MS);
  const seconds = Math.floor((absDiff % ONE_MINUTE_MS) / ONE_SECOND_MS);

  // Exact calendar days calculation matching backend
  const calendarDaysRemaining = isOverdue
    ? Math.floor(diffMs / ONE_DAY_MS)
    : Math.ceil(diffMs / ONE_DAY_MS);

  const isDueToday = calendarDaysRemaining === 0;
  const isEmergency = !isOverdue && calendarDaysRemaining <= 3;
  const isCritical = !isOverdue && calendarDaysRemaining <= 14;
  const isUrgent = !isOverdue && calendarDaysRemaining <= 45;

  let urgencyTier: UrgencyTier;
  if (isResolved) {
    urgencyTier = "resolved";
  } else if (isOverdue) {
    urgencyTier = "overdue";
  } else if (isEmergency) {
    urgencyTier = "emergency";
  } else if (isCritical) {
    urgencyTier = "critical";
  } else if (isUrgent) {
    urgencyTier = "urgent";
  } else {
    urgencyTier = "normal";
  }

  // Format human-readable string
  let formattedCountdown: string;
  if (isOverdue) {
    formattedCountdown = `${days}d ${hours}h overdue (Statutory Bar)`;
  } else if (isDueToday) {
    formattedCountdown = `Due Today: ${hours}h ${minutes}m ${seconds}s left`;
  } else if (isEmergency) {
    formattedCountdown = `${days}d ${hours}h ${minutes}m (Emergency)`;
  } else if (isCritical) {
    formattedCountdown = `${days}d ${hours}h ${minutes}m (Critical)`;
  } else {
    formattedCountdown = `${days}d ${hours}h remaining`;
  }

  const progressPercent = isOverdue
    ? 0
    : Math.min(100, Math.max(0, (calendarDaysRemaining / totalWindowDays) * 100));

  const shouldAlarm = !isResolved && (isOverdue || isCritical);

  return {
    diffMs,
    days: calendarDaysRemaining,
    hours,
    minutes,
    seconds,
    isOverdue,
    isDueToday,
    isEmergency,
    isCritical,
    isUrgent,
    urgencyTier,
    formattedCountdown,
    progressPercent,
    shouldAlarm,
  };
}

/**
 * Aggregates deadline stats across an array of claims.
 */
export function calculatePortfolioDeadlineStats(
  claims: (Claim | DeadlineAlarmTarget)[],
  now: number = Date.now()
): PortfolioDeadlineStats {
  let activeClaimsCount = 0;
  let criticalCount = 0;
  let overdueCount = 0;
  let urgentCount = 0;
  let nearestDeadlineClaim: Claim | DeadlineAlarmTarget | null = null;
  let minDiff = Infinity;

  for (const c of claims) {
    const isClosed = c.status === "won" || c.status === "lost";
    if (isClosed) continue;

    activeClaimsCount++;
    const countdown = calculateLiveCountdown(c.statutoryDeadline, now, {
      status: c.status,
      appealFilingDeadlineDays: c.appealFilingDeadlineDays,
    });

    if (countdown.isOverdue) {
      overdueCount++;
    } else if (countdown.isCritical) {
      criticalCount++;
    } else if (countdown.isUrgent) {
      urgentCount++;
    }

    if (countdown.diffMs < minDiff) {
      minDiff = countdown.diffMs;
      nearestDeadlineClaim = c;
    }
  }

  const hasActiveAlarm = overdueCount > 0 || criticalCount > 0;
  const nearestDaysRemaining =
    nearestDeadlineClaim !== null
      ? calculateLiveCountdown(nearestDeadlineClaim.statutoryDeadline, now).days
      : null;

  let summaryText: string;
  if (overdueCount > 0 && criticalCount > 0) {
    summaryText = `${overdueCount} case(s) overdue; ${criticalCount} in critical statutory window (<=14d)`;
  } else if (overdueCount > 0) {
    summaryText = `${overdueCount} case(s) past statutory deadline bar`;
  } else if (criticalCount > 0) {
    summaryText = `${criticalCount} case(s) approaching statutory deadline (<=14d)`;
  } else if (activeClaimsCount > 0) {
    summaryText = `All ${activeClaimsCount} active claims within timely filing window`;
  } else {
    summaryText = "No active statutory clocks pending";
  }

  return {
    totalClaims: claims.length,
    activeClaimsCount,
    criticalCount,
    overdueCount,
    urgentCount,
    hasActiveAlarm,
    nearestDeadlineClaim,
    nearestDaysRemaining,
    summaryText,
  };
}

/**
 * Reactive Real-Time Deadline Alarm Hook
 *
 * Implements the real-time countdown & statutory alert calculation promised in
 * PRODUCT.md and the ClaimHero architectural blueprint.
 *
 * Can be invoked in two modes:
 * 1. Single Claim: `useDeadlineAlarm(claim)` -> Returns real-time countdown down to the second.
 * 2. Portfolio: `useDeadlineAlarm(claims)` -> Returns live portfolio alarm metrics & nearest deadline.
 */
export function useDeadlineAlarm(
  targetOrList?: DeadlineAlarmTarget | (Claim | DeadlineAlarmTarget)[] | null,
  options?: UseDeadlineAlarmOptions
) {
  const [now, setNow] = useState<number>(() => Date.now());
  const intervalMs = options?.refreshIntervalMs ?? 1000;

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  const isArray = Array.isArray(targetOrList);

  // Single target countdown
  const singleTarget = useMemo(() => {
    if (!targetOrList || isArray) return null;
    return targetOrList as DeadlineAlarmTarget;
  }, [targetOrList, isArray]);

  const countdown = useMemo<LiveCountdown | null>(() => {
    if (!singleTarget) return null;
    return calculateLiveCountdown(singleTarget.statutoryDeadline, now, {
      status: singleTarget.status,
      appealFilingDeadlineDays: singleTarget.appealFilingDeadlineDays,
    });
  }, [singleTarget, now]);

  // Collection stats
  const collectionList = useMemo(() => {
    if (!isArray || !targetOrList) return [];
    return targetOrList as (Claim | DeadlineAlarmTarget)[];
  }, [isArray, targetOrList]);

  const portfolioStats = useMemo<PortfolioDeadlineStats>(() => {
    return calculatePortfolioDeadlineStats(collectionList, now);
  }, [collectionList, now]);

  // Optional alarm callback
  useEffect(() => {
    if (countdown?.shouldAlarm && singleTarget && options?.onCriticalAlarm) {
      options.onCriticalAlarm(singleTarget);
    }
  }, [countdown?.shouldAlarm, singleTarget, options]);

  return {
    now,
    countdown,
    portfolioStats,
    isOverdue: countdown?.isOverdue ?? portfolioStats.overdueCount > 0,
    isCritical: countdown?.isCritical ?? portfolioStats.criticalCount > 0,
    hasActiveAlarm: countdown?.shouldAlarm ?? portfolioStats.hasActiveAlarm,
  };
}
