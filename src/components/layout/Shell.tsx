import React, { Suspense, useState, useCallback } from "react";
import { Header } from "./Header";
import { Sidebar, NavigationView } from "./Sidebar";
import { Claim } from "../../types";
import { ShortcutsHelpDialog } from "../common/ShortcutsHelpDialog";
import { isInputFocused } from "../../lib/shortcuts";

const LazySilk = React.lazy(() => import("../ui/Silk").then((m) => ({ default: m.Silk })));

interface ShellProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  claims?: Claim[];
  selectedClaim?: Claim | null;
  onSelectClaim?: (claimId: string) => void;
  onOpenIngestion: () => void;
  onDeleteCase?: (claimId: string) => Promise<unknown>;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenShortcutsHelp?: () => void;
  totalDisputedAmount?: number;
  totalWonAmount?: number;
  winRate?: number;
  criticalDeadlinesCount?: number;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  currentView,
  onSelectView,
  claims = [],
  selectedClaim,
  onSelectClaim,
  onOpenIngestion,
  onDeleteCase,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenCommandPalette,
  onOpenShortcutsHelp,
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
  children,
}) => {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  const handleOpenShortcuts = useCallback(() => {
    if (onOpenShortcutsHelp) {
      onOpenShortcutsHelp();
    } else {
      setIsShortcutsOpen(true);
    }
  }, [onOpenShortcutsHelp]);

  // Keyboard shortcut: '?' opens shortcuts reference when not focused on an input
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !isInputFocused()) {
        e.preventDefault();
        handleOpenShortcuts();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenShortcuts]);

  return (
    <div className="relative flex h-screen w-full flex-col bg-background text-foreground antialiased overflow-hidden">
      {/* Ambient Silk Shader Dynamic Canvas Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
        <div className="absolute -top-[10%] -left-[10%] w-[120vw] h-[120vh] opacity-45 dark:opacity-35 transition-opacity duration-700">
          <Suspense fallback={<div className="w-full h-full bg-background" />}>
            <LazySilk
              speed={10}
              scale={0.9}
              color="#59677b"
              noiseIntensity={1}
              rotation={0}
            />
          </Suspense>
        </div>
        {/* Subtle gradient vignette to preserve high contrast and readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/85" />
      </div>

      {/* Top Header */}
      <Header
        onSelectView={onSelectView}
        onOpenIngestion={onOpenIngestion}
        onToggleSidebar={onToggleSidebar}
        onOpenCommandPalette={onOpenCommandPalette}
        totalDisputedAmount={totalDisputedAmount}
        totalWonAmount={totalWonAmount}
        winRate={winRate}
        criticalDeadlinesCount={criticalDeadlinesCount}
      />

      {/* Main Workspace Layout */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <Sidebar
          currentView={currentView}
          onSelectView={onSelectView}
          claims={claims}
          selectedClaim={selectedClaim}
          onSelectClaim={onSelectClaim}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          onOpenIngestion={onOpenIngestion}
          onDeleteCase={onDeleteCase}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl min-h-full flex flex-col">{children}</div>
        </main>
      </div>

      {/* Precision Medical Console Status & Shortcuts Footer */}
      <footer className="relative z-20 h-7 shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-md px-4 flex items-center justify-between text-[11px] text-muted-foreground select-none font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-foreground/80">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Sentinel Engine Active</span>
          </div>
          <span className="text-border/80 hidden sm:inline">•</span>
          <div className="hidden sm:flex items-center gap-3 text-muted-foreground">
            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
              >
                <kbd className="px-1 py-0.2 rounded bg-muted/70 text-[10px] border border-border/60">⌘K</kbd> Palette
              </button>
            )}
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
              >
                <kbd className="px-1 py-0.2 rounded bg-muted/70 text-[10px] border border-border/60">⌘B</kbd> Sidebar
              </button>
            )}
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 rounded bg-muted/70 text-[10px] border border-border/60">⌘J</kbd> Copilot
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenShortcuts}
            className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
          >
            <kbd className="px-1 py-0.2 rounded bg-muted/70 text-[10px] border border-border/60">?</kbd> Shortcuts
          </button>
        </div>
      </footer>

      <ShortcutsHelpDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};

