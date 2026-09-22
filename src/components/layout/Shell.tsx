import React, { Suspense, useState, useCallback } from "react";
import { Header } from "./Header";
import { Sidebar, NavigationView } from "./Sidebar";
import { Claim } from "../../types";
import { ShortcutsHelpDialog } from "../common/ShortcutsHelpDialog";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { SilkFallback } from "../ui/SilkFallback";
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
  onOpenSentinel?: () => void;
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
  onOpenSentinel,
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
  children,
}) => {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const handleToggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobileSidebarOpen((prev) => !prev);
    } else {
      onToggleSidebar?.();
    }
  }, [onToggleSidebar]);

  const handleCloseMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);

  // Close mobile sidebar when active view or selected case changes
  React.useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [currentView, selectedClaim?._id]);

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
    <div className="relative flex h-screen w-full flex-col bg-background text-foreground antialiased overflow-hidden print:h-auto print:overflow-visible">
      {/* Ambient Silk Shader Dynamic Canvas Background.
          The layer is viewport-sized (rotation is 0, so overscan would only
          burn fill rate) with a static gradient painted underneath: first
          paint is instant while the three.js chunk streams in, and the
          section can never go blank if WebGL fails on a weak GPU. */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none print:hidden">
        <div className="absolute inset-0 w-full h-full opacity-45 dark:opacity-35 transition-opacity duration-700">
          <SilkFallback className="absolute inset-0" />
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <LazySilk
                speed={10}
                scale={0.9}
                color="#59677b"
                noiseIntensity={1}
                rotation={0}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
        {/* Subtle gradient vignette to preserve high contrast and readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/85" />
      </div>

      {/* Top Header */}
      <Header
        onSelectView={onSelectView}
        onOpenIngestion={onOpenIngestion}
        onToggleSidebar={handleToggleSidebar}
        onOpenCommandPalette={onOpenCommandPalette}
        totalDisputedAmount={totalDisputedAmount}
        totalWonAmount={totalWonAmount}
        winRate={winRate}
        criticalDeadlinesCount={criticalDeadlinesCount}
      />

      {/* Main Workspace Layout */}
      <div className="relative z-10 flex flex-1 overflow-hidden print:overflow-visible print:block">
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
          onOpenSentinel={onOpenSentinel}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={handleCloseMobileSidebar}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 print:overflow-visible print:p-0">
          <div className="mx-auto max-w-7xl min-h-full flex flex-col">{children}</div>
        </main>
      </div>

      <ShortcutsHelpDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};

