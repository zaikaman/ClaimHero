import React, { useState, useMemo, useEffect } from "react";
import {
  Clock,
  Globe,
  TrendUp,
  Medal,
  FileText,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  Funnel,
  MagnifyingGlass,
  Cpu,
  Check,
  Compass,
  Icon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Claim, PipelineActivity } from "../../types";
import { formatDateTime, cn } from "../../lib/utils";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export interface PipelineTimelineProps {
  claim?: Claim | null;
  activities?: PipelineActivity[];
  isLoading?: boolean;
  isDrawer?: boolean;
}

export const STAGE_CONFIG: Record<
  string,
  {
    label: string;
    shortLabel: string;
    description: string;
    icon: Icon;
    badgeVariant: "default" | "secondary" | "outline";
    borderClass: string;
    bgClass: string;
    textClass: string;
  }
> = {
  run: {
    label: "Intake & Review",
    shortLabel: "Review",
    description: "Autonomous case checkpointing and prerequisite validation",
    icon: Compass,
    badgeVariant: "secondary",
    borderClass: "border-sky-500/30",
    bgClass: "bg-sky-500/10",
    textClass: "text-sky-400",
  },
  crawl: {
    label: "Policy Search & Crawl",
    shortLabel: "Policy Search",
    description: "Firecrawl live extraction of payer clinical policy bulletins",
    icon: Globe,
    badgeVariant: "secondary",
    borderClass: "border-cyan-500/30",
    bgClass: "bg-cyan-500/10",
    textClass: "text-cyan-400",
  },
  score: {
    label: "Win Scoring",
    shortLabel: "Win Scoring",
    description: "Multi-factor overturn likelihood calculation across clinical pillars",
    icon: TrendUp,
    badgeVariant: "default",
    borderClass: "border-purple-500/30",
    bgClass: "bg-purple-500/10",
    textClass: "text-purple-400",
  },
  precedents: {
    label: "Precedent Match",
    shortLabel: "Past Cases",
    description: "Vector search matching similar successfully overturned cases",
    icon: Medal,
    badgeVariant: "default",
    borderClass: "border-amber-500/30",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-400",
  },
  synthesis: {
    label: "Brief Drafting",
    shortLabel: "Brief Drafting",
    description: "Grounded ERISA and clinical appeal brief synthesis",
    icon: FileText,
    badgeVariant: "default",
    borderClass: "border-emerald-500/30",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-400",
  },
};

const PIPELINE_STAGE_KEYS = ["run", "crawl", "score", "precedents", "synthesis"] as const;

function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  if (safeMs < 1000) return `${safeMs}ms`;
  const totalSeconds = Math.round(safeMs / 1000);
  if (totalSeconds < 60) return `${(safeMs / 1000).toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const remainingSec = totalSeconds % 60;
  return `${mins}m ${remainingSec}s`;
}

function formatLatencyDelta(ms: number): string {
  if (ms <= 0) return "+0ms";
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(1)}s`;
}

export const PipelineTimeline: React.FC<PipelineTimelineProps> = ({
  claim,
  activities: propsActivities,
  isLoading: propsLoading = false,
  isDrawer = false,
}) => {
  // Query claim activities or portfolio recent activities when not passed in props
  const queriedClaimActivities = useQuery(
    api.pipelineActivities.listByClaim,
    !propsActivities && claim?._id ? { claimId: claim._id as Id<"claims"> } : "skip"
  ) as PipelineActivity[] | undefined;

  const queriedRecentActivities = useQuery(
    api.pipelineActivities.listRecent,
    !propsActivities && !claim?._id ? { limit: 50 } : "skip"
  ) as PipelineActivity[] | undefined;

  const activities = useMemo(() => {
    if (propsActivities) return propsActivities;
    if (claim?._id) return queriedClaimActivities ?? [];
    return queriedRecentActivities ?? [];
  }, [propsActivities, claim?._id, queriedClaimActivities, queriedRecentActivities]);

  const isLoading =
    propsLoading ||
    (!propsActivities &&
      claim?._id &&
      queriedClaimActivities === undefined) ||
    (!propsActivities &&
      !claim?._id &&
      queriedRecentActivities === undefined);

  const [selectedRunId, setSelectedRunId] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [now, setNow] = useState<number>(() => Date.now());

  // Group events by runId
  const runGroups = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    const map = new Map<string, PipelineActivity[]>();
    activities.forEach((item) => {
      const runId = item.runId || "default";
      if (!map.has(runId)) {
        map.set(runId, []);
      }
      map.get(runId)!.push(item);
    });

    const groups = Array.from(map.entries()).map(([runId, events]) => {
      const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
      const startedAt = sorted[0].createdAt;
      const finishedAt = sorted[sorted.length - 1].createdAt;
      const lastEvent = sorted[sorted.length - 1];
      // A run is only running if its last event has status === "running" AND hasn't timed out (15 mins)
      const isStale = now - lastEvent.createdAt > 15 * 60 * 1000;
      const isRunning = lastEvent.status === "running" && !isStale;
      const hasError = sorted.some((e) => e.status === "error");
      const durationMs = finishedAt - startedAt;

      const stagesCompleted = new Set(sorted.map((e) => e.stage));

      return {
        runId,
        events: sorted,
        startedAt,
        finishedAt,
        durationMs,
        isRunning,
        hasError,
        stagesCompleted,
      };
    });

    // Sort runs descending by startedAt (newest first)
    return groups.sort((a, b) => b.startedAt - a.startedAt);
  }, [activities, now]);

  const runGroupMap = useMemo(() => {
    const map = new Map<string, (typeof runGroups)[number]>();
    runGroups.forEach((g) => map.set(g.runId, g));
    return map;
  }, [runGroups]);

  const latestRun = runGroups[0] ?? null;

  // Real-time ticking while any run is active
  const hasActiveRun = runGroups.some((g) => g.isRunning);
  useEffect(() => {
    if (!hasActiveRun) return;
    const interval = typeof window !== "undefined"
      ? window.setInterval(() => setNow(Date.now()), 1000)
      : setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (typeof window !== "undefined") {
        window.clearInterval(interval);
      } else {
        clearInterval(interval);
      }
    };
  }, [hasActiveRun]);

  // Reset selected run filter when switching claims
  useEffect(() => {
    setSelectedRunId("all");
  }, [claim?._id]);

  // Filtered event list
  const filteredEvents = useMemo(() => {
    let list = [...activities];

    if (selectedRunId !== "all") {
      list = list.filter((e) => e.runId === selectedRunId);
    }

    if (stageFilter !== "all") {
      list = list.filter((e) => e.stage === stageFilter);
    }

    if (statusFilter !== "all") {
      list = list.filter((e) => e.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.stage.toLowerCase().includes(q) ||
          e.runId.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, [activities, selectedRunId, stageFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-4 animate-fadeIn" role="region" aria-label="Workflow Observability Pipeline Timeline">
      {/* HUD Telemetry Banner */}
      <Card className="p-4 border-cyan-500/30 bg-gradient-to-br from-card via-card to-cyan-950/20 shadow-sm space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
              <Cpu className="size-4.5" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-foreground font-sans tracking-wide">
                  Autonomous Workflow Telemetry
                </h3>
                {latestRun?.isRunning ? (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] border-cyan-500/40 bg-cyan-500/10 text-cyan-300 gap-1"
                  >
                    <CircleNotch className="size-3 animate-spin text-cyan-400" />
                    <span>Active Run In-Flight</span>
                  </Badge>
                ) : latestRun?.hasError ? (
                  <Badge
                    variant="destructive"
                    className="font-mono text-[10px]"
                  >
                    Fault Recorded
                  </Badge>
                ) : activities.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  >
                    Execution Verified
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] border-muted-foreground/30 text-muted-foreground"
                  >
                    Ready for Ingestion
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {activities.length > 0
                  ? `${activities.length} telemetry event${activities.length === 1 ? "" : "s"} across ${runGroups.length} run${runGroups.length === 1 ? "" : "s"} • Firecrawl, Vector Match & Brief LLM Trace`
                  : "Continuous execution trace of Firecrawl, Vector Precedent Retrieval & LLM Brief Drafting"}
              </p>
            </div>
          </div>

          {/* Key Run Metrics Pill */}
          {latestRun && (
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/60 bg-muted/30 text-[11px] font-mono">
                <Clock className="size-3 text-cyan-400" />
                <span className="text-muted-foreground">Run Time:</span>
                <span className="font-semibold text-foreground">
                  {latestRun.isRunning
                    ? `${Math.max(0, Math.floor((now - latestRun.startedAt) / 1000))}s live`
                    : formatDuration(latestRun.durationMs)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 5-Stage Visualizer Stepper */}
        {latestRun && (
          <div className="pt-2 border-t border-border/50">
            <div className="text-[10px] font-mono text-muted-foreground mb-1.5 flex items-center justify-between">
              <span>Pipeline Stage Traversal (Latest Run)</span>
              <span className="text-cyan-400 font-mono">
                {latestRun.stagesCompleted.size}/5 stages reached
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {PIPELINE_STAGE_KEYS.map((stageKey) => {
                const meta = STAGE_CONFIG[stageKey];
                const StageIcon = meta.icon;
                const isTraversed = latestRun.stagesCompleted.has(stageKey);
                const stageEvents = latestRun.events.filter((e) => e.stage === stageKey);
                const hasStageError = stageEvents.some((e) => e.status === "error");
                const isStageComplete = stageEvents.some((e) => e.status === "completed");

                // Only actively running if the overall run is currently running,
                // this stage hasn't errored or completed, and the run's latest active event belongs to this stage.
                const isStageRunning =
                  latestRun.isRunning &&
                  !hasStageError &&
                  !isStageComplete &&
                  latestRun.events[latestRun.events.length - 1]?.stage === stageKey;

                return (
                  <div
                    key={stageKey}
                    className={cn(
                      "p-1.5 rounded-md border flex items-center gap-1.5 text-xs transition-colors",
                      hasStageError
                        ? "border-rose-500/40 bg-rose-950/20 text-rose-300"
                        : isStageRunning
                        ? "border-cyan-500/40 bg-cyan-950/30 text-cyan-300 ring-1 ring-cyan-500/30"
                        : isStageComplete || isTraversed
                        ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                        : "border-border/40 bg-muted/10 text-muted-foreground opacity-60"
                    )}
                  >
                    <span className="shrink-0">
                      {hasStageError ? (
                        <WarningCircle className="size-3 text-rose-400" />
                      ) : isStageRunning ? (
                        <CircleNotch className="size-3 animate-spin text-cyan-400" />
                      ) : isStageComplete || isTraversed ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <StageIcon className="size-3" />
                      )}
                    </span>
                    <span className="text-[11px] font-medium font-sans truncate">
                      {meta.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Observability Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <MagnifyingGlass className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search agent telemetry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7.5 pl-8 pr-2 text-xs font-sans bg-card/60 border-border/60"
              aria-label="Search telemetry messages"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Run Selector */}
          {runGroups.length > 1 && (
            <div className="flex items-center gap-1">
              <Select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="h-7.5 text-xs font-sans bg-card/60 border-border/60 max-w-[140px]"
                aria-label="Filter by execution run"
              >
                <option value="all">All Runs ({runGroups.length})</option>
                {runGroups.map((g, idx) => (
                  <option key={g.runId} value={g.runId}>
                    Run #{runGroups.length - idx} ({g.events.length} evs)
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Stage Selector */}
          <div className="flex items-center gap-1">
            <Funnel className="size-3 text-muted-foreground shrink-0" />
            <Select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-7.5 text-xs font-sans bg-card/60 border-border/60"
              aria-label="Filter events by stage"
            >
              <option value="all">All Stages</option>
              {PIPELINE_STAGE_KEYS.map((key) => {
                const meta = STAGE_CONFIG[key];
                const count = activities.filter((a) => a.stage === key).length;
                return (
                  <option key={key} value={key} disabled={count === 0}>
                    {meta.shortLabel} ({count})
                  </option>
                );
              })}
            </Select>
          </div>

          {/* Status Selector */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7.5 text-xs font-sans bg-card/60 border-border/60"
            aria-label="Filter events by status"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running / Started</option>
            <option value="error">Errors</option>
          </Select>
        </div>
      </div>

      {/* Timeline Stream Container */}
      <Card className={isDrawer ? "p-4 border-border/60 bg-card/60" : "p-6"}>
        {isLoading ? (
          <div className="space-y-4 py-3 animate-pulse" aria-busy="true">
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground pb-2">
              <CircleNotch className="size-4 animate-spin text-cyan-400" />
              <span>Streaming pipeline telemetry...</span>
            </div>
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="relative pl-6 space-y-2">
                <div className="absolute left-1.5 top-2 size-2.5 rounded-full bg-border" />
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-24 bg-muted/60 rounded" />
                    <div className="h-3 w-16 bg-muted/40 rounded" />
                  </div>
                  <div className="h-3.5 w-5/6 bg-muted/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted/30 border border-border/60 text-muted-foreground">
              <Cpu className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground font-sans">
                {activities.length > 0
                  ? "No telemetry events match your filter"
                  : "No autonomous pipeline activities recorded yet"}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono max-w-sm mx-auto pt-1 leading-relaxed">
                {activities.length > 0
                  ? "Reset your search or stage filter to inspect all recorded events."
                  : claim
                  ? `Telemetry streams automatically when the Sentinel pipeline executes for Claim #${claim.claimNumber}.`
                  : "Telemetry will populate as autonomous workflows process medical claims across the portfolio."}
              </p>
            </div>
            {activities.length > 0 && (
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setSelectedRunId("all");
                    setStageFilter("all");
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                  className="h-7 text-xs font-mono border-border/70 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Reset Filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border/70">
            {filteredEvents.map((event, idx) => {
              const meta = STAGE_CONFIG[event.stage] || STAGE_CONFIG.run;
              const StageIcon = meta.icon;
              const run = runGroupMap.get(event.runId || "default");
              const isRunActive = run?.isRunning ?? false;
              // An event is actively running ONLY if its parent run is currently in-flight
              // AND this event is the latest active head event in that run
              const isActivelyRunning =
                isRunActive &&
                run?.events[run.events.length - 1]?._id === event._id;

              const isError = event.status === "error";
              const isCompleted = event.status === "completed";

              // Calculate latency delta between consecutive steps in the same run
              const prevEvent = idx > 0 ? filteredEvents[idx - 1] : null;
              const hasPrevInSameRun = prevEvent && prevEvent.runId === event.runId;
              const deltaMs = hasPrevInSameRun ? event.createdAt - prevEvent.createdAt : 0;

              return (
                <div key={event._id} className="relative group">
                  {/* Timeline Node Dot */}
                  <div
                    className={cn(
                      "absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full border shadow-xs transition-colors",
                      isError
                        ? "border-rose-500/50 bg-rose-950/40 text-rose-400"
                        : isActivelyRunning
                        ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300 ring-2 ring-cyan-500/20"
                        : isCompleted
                        ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-400"
                        : "border-sky-500/40 bg-sky-950/20 text-sky-400"
                    )}
                  >
                    {isError ? (
                      <WarningCircle className="size-2.5 text-rose-400" />
                    ) : isActivelyRunning ? (
                      <CircleNotch className="size-2.5 animate-spin text-cyan-400" />
                    ) : isCompleted ? (
                      <CheckCircle className="size-2.5 text-emerald-400" />
                    ) : (
                      <StageIcon className="size-2.5" />
                    )}
                  </div>

                  {/* Event Card */}
                  <Card
                    className={cn(
                      "p-3 space-y-1.5 transition-colors",
                      isError
                        ? "border-rose-500/50 bg-rose-950/15"
                        : isActivelyRunning
                        ? "border-cyan-500/50 bg-cyan-950/15 ring-1 ring-cyan-500/20"
                        : "bg-card hover:bg-muted/20 border-border/60"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          size="sm"
                          className={cn(
                            "font-mono text-[10px] gap-1",
                            meta.borderClass,
                            meta.bgClass,
                            meta.textClass
                          )}
                        >
                          <StageIcon className="size-3" />
                          <span>{meta.label}</span>
                        </Badge>

                        {isActivelyRunning ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[9px] border-cyan-500/30 bg-cyan-500/10 text-cyan-300 gap-1"
                          >
                            <CircleNotch className="size-2.5 animate-spin" />
                            <span>In Progress</span>
                          </Badge>
                        ) : isError ? (
                          <Badge variant="destructive" className="font-mono text-[9px]">
                            Failed
                          </Badge>
                        ) : isCompleted ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[9px] border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          >
                            Completed
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="font-mono text-[9px] border-sky-500/30 bg-sky-500/10 text-sky-300"
                          >
                            Started
                          </Badge>
                        )}

                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                          {event.runId.slice(0, 14)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                        {hasPrevInSameRun && deltaMs > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-muted/40 text-foreground/80">
                            {formatLatencyDelta(deltaMs)}
                          </span>
                        )}
                        <span>{formatDateTime(event.createdAt)}</span>
                        <span>({formatAgo(event.createdAt, now)})</span>
                      </div>
                    </div>

                    <p className="text-xs text-foreground/90 leading-relaxed font-sans pt-0.5">
                      {event.message}
                    </p>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
