import React from "react";
import { Header } from "./Header";
import { Sidebar, NavigationView } from "./Sidebar";
import { Claim } from "../../types";

interface ShellProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  claims?: Claim[];
  selectedClaim?: Claim | null;
  onSelectClaim?: (claimId: string) => void;
  onOpenIngestion: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
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
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenCommandPalette,
  isDark = true,
  onToggleTheme,
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
  children,
}) => {
  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground antialiased overflow-hidden">
      {/* Top Header */}
      <Header
        onSelectView={onSelectView}
        onOpenIngestion={onOpenIngestion}
        onToggleSidebar={onToggleSidebar}
        onOpenCommandPalette={onOpenCommandPalette}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        totalDisputedAmount={totalDisputedAmount}
        totalWonAmount={totalWonAmount}
        winRate={winRate}
        criticalDeadlinesCount={criticalDeadlinesCount}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentView={currentView}
          onSelectView={onSelectView}
          claims={claims}
          selectedClaim={selectedClaim}
          onSelectClaim={onSelectClaim}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          onOpenIngestion={onOpenIngestion}
          isDark={isDark}
          onToggleTheme={onToggleTheme}
        />

        <main className="flex-1 overflow-y-auto bg-background/50 p-4 md:p-6">
          <div className="mx-auto max-w-7xl h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
};
