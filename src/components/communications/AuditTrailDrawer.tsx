import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Clock, X, Circle } from "@phosphor-icons/react";
import { Claim, AuditLog } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { AuditTimeline } from "./AuditTimeline";

export interface AuditTrailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  claim?: Claim | null;
  logs: AuditLog[];
  isLoading?: boolean;
}

export const AuditTrailDrawer: React.FC<AuditTrailDrawerProps> = ({
  isOpen,
  onClose,
  claim,
  logs,
  isLoading = false,
}) => {
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
              <Clock className="size-4.5" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground font-sans truncate">
                  Case Audit Timeline
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
                  : "Live portfolio statutory audit trail"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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

        {/* Drawer Body with Timeline */}
        <div className="flex-1 overflow-y-auto p-5">
          <AuditTimeline
            claim={claim}
            logs={logs}
            isLoading={isLoading}
            isDrawer={true}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
