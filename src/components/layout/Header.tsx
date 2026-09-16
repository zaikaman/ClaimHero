import React from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import {
  Sidebar,
  MagnifyingGlass,
  PlusCircle,
  GithubLogo,
  SignIn,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useSoundEffects } from "../../hooks/useSoundEffects";
import { useDetailMode } from "../../hooks/useDetailMode";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { formatCurrency } from "../../lib/utils";
import { NavigationView } from "./Sidebar";
import { DetailModeToggle } from "../common/DetailModeToggle";

interface HeaderProps {
  onSelectView?: (view: NavigationView) => void;
  onOpenIngestion: () => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  totalDisputedAmount: number;
  totalWonAmount: number;
  winRate?: number;
  criticalDeadlinesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onSelectView,
  onOpenIngestion,
  onToggleSidebar,
  onOpenCommandPalette,
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  criticalDeadlinesCount = 0,
}) => {
  const { isAuthenticated } = useCurrentUser();
  const { isMuted, toggleMute, playSound } = useSoundEffects();
  const { isDetailed } = useDetailMode();

  const handleToggleAudio = () => {
    const nextActive = toggleMute();
    if (nextActive) {
      playSound("tactile_click");
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/60 backdrop-blur-xl print:hidden">
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
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 backdrop-blur-sm px-3 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors w-56 sm:w-72"
            title={isDetailed ? "Search claims, CPT, or ask Sentinel (⌘K / Ctrl+K)" : "Search your cases or ask for help (⌘K / Ctrl+K)"}
          >
            <MagnifyingGlass className="size-3.5" />
            <span className="flex-1 text-left truncate">{isDetailed ? "Search claims, CPT, or ask Sentinel..." : "Search your cases or ask for help..."}</span>
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
              <span>{isDetailed ? "Pipeline:" : "At stake:"}</span>
              <strong className="text-foreground font-mono">{formatCurrency(totalDisputedAmount)}</strong>
            </div>
            <Separator orientation="vertical" className="h-3" />
            <div className="flex items-center gap-1.5">
              <span>{isDetailed ? "Recovered:" : "Saved:"}</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(totalWonAmount)}
              </strong>
            </div>
            {criticalDeadlinesCount > 0 && (
              <>
                <Separator orientation="vertical" className="h-3" />
                <button
                  onClick={() => {
                    playSound("deadline_alert");
                    onSelectView?.("radar");
                  }}
                  className="flex items-center gap-1.5 text-destructive font-semibold hover:opacity-80 transition-opacity cursor-pointer text-xs"
                  title={isDetailed ? "Critical statutory deadline alarms (click to view and play alert tone)" : "Cases running out of time — click to view"}
                  aria-label={`${criticalDeadlinesCount} ${isDetailed ? "urgent alarms" : "cases need attention"}`}
                >
                  <ShieldWarning className="size-3.5 animate-pulse" />
                  <span>{criticalDeadlinesCount} {isDetailed ? "Urgent Alarms" : "Needs attention"}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <DetailModeToggle compact className="inline-flex" />
            {/* Quick Ingest Button */}
            <Button
              size="sm"
              onClick={onOpenIngestion}
              className="gap-1.5 text-xs h-8 shadow-xs"
            >
              <PlusCircle className="size-3.5" />
              <span className="hidden sm:inline">{isDetailed ? "Ingest Denial" : "Add denial"}</span>
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

            {/* Acoustic Feedback Toggle */}
            <button
              onClick={handleToggleAudio}
              className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isMuted ? "Sound off (click to enable)" : "Sound on (click to mute)"}
              aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
            >
              {isMuted ? (
                <SpeakerSimpleSlash className="size-4 text-muted-foreground/60" />
              ) : (
                <SpeakerSimpleHigh className="size-4 text-emerald-500 dark:text-emerald-400" />
              )}
            </button>

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
