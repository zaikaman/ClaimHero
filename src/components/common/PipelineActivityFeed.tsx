import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Lightning,
  FileMagnifyingGlass,
  TrendUp,
  Medal,
  FileText,
  CheckCircle,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { PipelineActivity } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

// Hide feeds from runs that finished over 15 minutes ago so old cases stay clean.
const RECENCY_WINDOW_MS = 15 * 60 * 1000;

const STAGE_META: Record<string, { icon: typeof Lightning; label: string }> = {
  run: { icon: Lightning, label: "Review" },
  crawl: { icon: FileMagnifyingGlass, label: "Policy search" },
  score: { icon: TrendUp, label: "Win scoring" },
  precedents: { icon: Medal, label: "Past cases" },
  synthesis: { icon: FileText, label: "Brief drafting" },
};

function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

interface PipelineActivityFeedProps {
  claimId: string;
}

export const PipelineActivityFeed: React.FC<PipelineActivityFeedProps> = ({ claimId }) => {
  const activities = useQuery(api.pipelineActivities.listByClaim, {
    claimId: claimId as Id<"claims">,
  }) as PipelineActivity[] | undefined;

  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  const latestRun = useMemo(() => {
    if (!activities || activities.length === 0) return null;
    const last = activities[activities.length - 1];
    if (Date.now() - last.createdAt > RECENCY_WINDOW_MS) return null;
    const runEvents = activities.filter((event) => event.runId === last.runId);
    if (runEvents.length === 0) return null;
    return {
      runId: last.runId,
      events: runEvents,
      startedAt: runEvents[0].createdAt,
      isRunning: runEvents[runEvents.length - 1].status === "running",
      hasError: runEvents.some((event) => event.status === "error"),
    };
  }, [activities]);

  // Tick elapsed / relative times while the run is live. Keyed on run id +
  // running flag only so streaming events don't restart the timer.
  const runKey = latestRun?.runId;
  const runActive = latestRun?.isRunning;
  useEffect(() => {
    if (!runActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runActive, runKey]);

  // Keep the newest thought in view as events stream in.
  const eventCount = latestRun?.events.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [eventCount, runKey]);

  // The feed only exists while a run is live. Once finished, the outcome is
  // already communicated by the score banner, the stepper states, and the
  // completion toast, so a lingering summary would just duplicate them.
  if (!latestRun || !latestRun.isRunning) return null;

  const elapsedSec = Math.max(0, Math.floor((now - latestRun.startedAt) / 1000));

  return (
    <Card className="p-3.5 border-primary/30 bg-card/80" role="status" aria-label="Live agent activity">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="text-xs font-semibold text-foreground truncate">
            Live agent activity
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
          {`${elapsedSec}s in`}
        </Badge>
      </div>

      <div ref={scrollRef} className="max-h-56 overflow-y-auto pt-2.5 pr-1">
        <ol className="space-y-0.5">
          {latestRun.events.map((event) => {
            const meta = STAGE_META[event.stage] || STAGE_META.run;
            const StageIcon = meta.icon;
            const isActive = event === latestRun.events[latestRun.events.length - 1];
            const isError = event.status === "error";
            return (
              <li key={event._id} className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border shrink-0",
                    isError
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                      : event.status === "completed"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : "border-primary/40 bg-primary/10 text-primary"
                  )}
                >
                  {isError ? (
                    <WarningCircle className="size-3.5" />
                  ) : event.status === "completed" && !isActive ? (
                    <CheckCircle className="size-3.5" />
                  ) : isActive ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <StageIcon className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-foreground/90">{event.message}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {meta.label} • {formatAgo(event.createdAt, now)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
};
