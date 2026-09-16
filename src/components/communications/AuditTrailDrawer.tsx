import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X, Circle, ShieldCheck, Lightning, Cpu } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Claim, AuditLog, PipelineActivity } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import { AuditTimeline } from "./AuditTimeline";
import { PipelineTimeline } from "./PipelineTimeline";

export interface AuditTrailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  claim?: Claim | null;
  logs: AuditLog[];
  isLoading?: boolean;
  initialTab?: "audit" | "pipeline";
  pipelineActivities?: PipelineActivity[];
  isLoadingPipeline?: boolean;
}

export const AuditTrailDrawer: React.FC<AuditTrailDrawerProps> = ({
  isOpen,
  onClose,
  claim,
  logs,
  isLoading = false,
  initialTab = "audit",
  pipelineActivities: propsActivities,
  isLoadingPipeline = false,
}) => {
  const [activeTab, setActiveTab] = useState<"audit" | "pipeline">(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Query pipeline activities for the claim if not passed in props
  const queriedActivities = useQuery(
    api.pipelineActivities.listByClaim,
    !propsActivities && claim?._id && isOpen ? { claimId: claim._id as Id<"claims"> } : "skip"
  ) as PipelineActivity[] | undefined;

  const queriedRecentActivities = useQuery(
    api.pipelineActivities.listRecent,
    !propsActivities && !claim?._id && isOpen ? { limit: 50 } : "skip"
  ) as PipelineActivity[] | undefined;

  const activities = propsActivities ?? (claim?._id ? queriedActivities : queriedRecentActivities) ?? [];
  const isLoadingActivities =
    isLoadingPipeline ||
    (!propsActivities &&
      isOpen &&
      (claim?._id ? queriedActivities === undefined : queriedRecentActivities === undefined));

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const drawerRef = useRef<HTMLDivElement>(null);
  const isMouseDownOnBackdrop = useRef(false);

  // Focus the drawer container on open for immediate keyboard navigation
  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      drawerRef.current?.focus();
    }
  }, [isOpen]);

  // Handle escape key to close drawer, ensuring cleanup and preventing event leak
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }
    const originalOverflow = typeof document !== "undefined" ? document.body.style.overflow : "";
    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
      if (typeof document !== "undefined") {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && isMouseDownOnBackdrop.current) {
      onClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Case Audit Trail"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end animate-fadeIn"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="w-full max-w-xl bg-background border-l border-border/80 h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-card/95 backdrop-blur-md px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              {activeTab === "pipeline" ? (
                <Cpu className="size-4.5" weight="bold" />
              ) : (
                <Clock className="size-4.5" weight="bold" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground font-sans truncate">
                  {activeTab === "pipeline" ? "Workflow Observability Timeline" : "Case Audit Timeline"}
                </h2>
                {claim && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    #{claim.claimNumber}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {claim
                  ? `${claim.patient?.name || "Patient"} • ${claim.patient?.insurancePayer || "Insurer"}`
                  : activeTab === "pipeline"
                  ? "Live autonomous workflow telemetry stream"
                  : "Live portfolio statutory audit trail"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-mono text-cyan-300">
              <ShieldCheck className="size-3 text-cyan-400" weight="fill" />
              <span>SHA-256 Chain</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-mono text-emerald-400">
              <Circle className="size-2 fill-emerald-400 text-emerald-400 animate-pulse" weight="fill" />
              <span>Live Sync</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close Audit Trail (Esc)"
              aria-label="Close Audit Trail"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* View Switcher: Statutory Audit vs. Pipeline Timeline */}
        <div className="px-5 pt-3 pb-2.5 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-card/80 border border-border/60 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
                activeTab === "audit"
                  ? "bg-primary/15 text-primary border border-primary/30 font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              )}
              aria-label="View Statutory Audit Trail"
            >
              <Clock className="size-3.5" weight={activeTab === "audit" ? "bold" : "regular"} />
              <span>Statutory Audit</span>
              <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 h-4 border-border/60">
                {logs.length}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("pipeline")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
                activeTab === "pipeline"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              )}
              aria-label="View Pipeline Timeline"
            >
              <Lightning className="size-3.5 text-amber-400" weight="fill" />
              <span>Pipeline Timeline</span>
              {activities && activities.length > 0 && (
                <Badge
                  variant="outline"
                  className="font-mono text-[9px] px-1.5 py-0 h-4 border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                >
                  {activities.length}
                </Badge>
              )}
            </button>
          </div>

          <div className="text-[11px] font-mono text-muted-foreground hidden sm:flex items-center gap-1.5">
            {activeTab === "pipeline" ? (
              <>
                <span className="inline-block size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>Workflow Observability</span>
              </>
            ) : (
              <>
                <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
                <span>ERISA 29 CFR § 2560.503-1</span>
              </>
            )}
          </div>
        </div>

        {/* Drawer Body with Timeline */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "audit" ? (
            <AuditTimeline
              claim={claim}
              logs={logs}
              isLoading={isLoading}
              isDrawer={true}
            />
          ) : (
            <PipelineTimeline
              claim={claim}
              activities={activities}
              isLoading={isLoadingActivities}
              isDrawer={true}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
