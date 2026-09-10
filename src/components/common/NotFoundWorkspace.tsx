import React from "react";
import { ArrowRight, House, WarningCircle } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface NotFoundWorkspaceProps {
  pathname?: string;
  onNavigateToRadar: () => void;
  onNavigateHome: () => void;
}

export const NotFoundWorkspace: React.FC<NotFoundWorkspaceProps> = ({
  pathname,
  onNavigateToRadar,
  onNavigateHome,
}) => {
  const currentPath =
    pathname || (typeof window !== "undefined" ? window.location.pathname : "");

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center select-none animate-fadeIn">
      <div className="max-w-md w-full p-8 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl flex flex-col items-center space-y-6">
        <div className="size-16 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-amber-400 shadow-inner">
          <WarningCircle className="size-8" weight="bold" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="text-[11px] font-mono border-amber-500/30 text-amber-400 bg-amber-500/5">
              HTTP 404
            </Badge>
            <span className="text-xs font-mono text-muted-foreground">Sentinel Core</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
            Workspace Route Not Found
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The requested deep link or route does not match any known Sentinel workspace or clinical module.
          </p>
        </div>

        {currentPath && (
          <div className="w-full px-3 py-2 rounded-lg bg-background/80 border border-border/60 font-mono text-xs text-muted-foreground truncate text-left">
            <span className="text-primary mr-1.5 font-semibold">GET</span>
            <span>{currentPath}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
          <Button
            onClick={onNavigateToRadar}
            className="w-full sm:w-1/2 h-9 text-xs gap-2 cursor-pointer font-medium"
          >
            <span>Case Radar</span>
            <ArrowRight className="size-3.5" />
          </Button>
          <Button
            onClick={onNavigateHome}
            variant="outline"
            className="w-full sm:w-1/2 h-9 text-xs gap-2 cursor-pointer border-border/70"
          >
            <House className="size-3.5" />
            <span>Return Home</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
