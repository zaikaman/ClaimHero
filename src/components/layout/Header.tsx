import React from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import {
  Sidebar,
  MagnifyingGlass,
  PlusCircle,
  GithubLogo,
  Pulse,
  SignIn,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { formatCurrency } from "../../lib/utils";
import { NavigationView } from "./Sidebar";

interface HeaderProps {
  onSelectView?: (view: NavigationView) => void;
  onOpenIngestion: () => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  totalDisputedAmount: number;
  totalWonAmount: number;
  winRate: number;
  criticalDeadlinesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onSelectView,
  onOpenIngestion,
  onToggleSidebar,
  onOpenCommandPalette,
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
}) => {
  const { isAuthenticated } = useCurrentUser();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/60 backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between px-4 lg:px-6">
        {/* Left: Sidebar trigger, separator & search input */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleSidebar}
            className="text-muted-foreground hover:text-foreground"
            title="Toggle sidebar (⌘B / Ctrl+B)"
          >
            <Sidebar className="size-4" />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1 border-border/50" />
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 backdrop-blur-sm px-3 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors w-48 sm:w-64"
            title="Quick search across claims and actions (⌘K / Ctrl+K)"
          >
            <MagnifyingGlass className="size-3.5" />
            <span className="flex-1 text-left">Search claims, CPT, payers...</span>
            <kbd className="pointer-events-none hidden sm:inline-flex h-4 items-center gap-0.5 rounded border border-border/60 bg-muted/60 px-1.5 font-mono text-[9px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Center/Right: Live metrics & actions */}
        <div className="flex items-center gap-2">
          {/* Subtle Live Stats on Header */}
          <div className="hidden xl:flex items-center gap-3 text-xs text-muted-foreground pr-2">
            <div className="flex items-center gap-1.5">
              <span>Pipeline:</span>
              <strong className="text-foreground font-mono">{formatCurrency(totalDisputedAmount)}</strong>
            </div>
            <Separator orientation="vertical" className="h-3" />
            <div className="flex items-center gap-1.5">
              <span>Recovered:</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(totalWonAmount)} ({winRate}%)
              </strong>
            </div>
            {criticalDeadlinesCount > 0 && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <div className="flex items-center gap-1 text-destructive font-semibold">
                  <span>{criticalDeadlinesCount} Urgent Alarms</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground font-mono mr-1">
              <Pulse className="size-3 text-foreground" />
              <span>Clinical Intelligence</span>
              <span className="size-1.5 rounded-full bg-emerald-500"></span>
            </div>

            {/* Quick Ingest Button */}
            <Button
              size="sm"
              onClick={onOpenIngestion}
              className="gap-1.5 text-xs h-8 shadow-xs"
            >
              <PlusCircle className="size-3.5" />
              <span className="hidden sm:inline">Ingest Denial</span>
            </Button>

            {/* GitHub Repo */}
            <a
              href="https://github.com/zaikaman/ClaimHero"
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="GitHub Repository"
            >
              <GithubLogo className="size-4" />
            </a>

            {/* Sign In Link (when unauthenticated) */}
            {!isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectView?.("login")}
                className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground"
                title="Sign In / Create Account"
              >
                <SignIn className="size-3.5" />
                <span className="hidden sm:inline">Sign In</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
