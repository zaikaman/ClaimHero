import React from "react";
import { Header } from "./Header";
import { Sidebar, NavigationView } from "./Sidebar";

interface ShellProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  selectedStatusFilter: string;
  onSelectStatusFilter: (status: string) => void;
  selectedPayerFilter: string;
  onSelectPayerFilter: (payer: string) => void;
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
  claimCountsByStatus?: Record<string, number>;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  currentView,
  onSelectView,
  selectedStatusFilter,
  onSelectStatusFilter,
  selectedPayerFilter,
  onSelectPayerFilter,
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
  claimCountsByStatus,
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
          selectedStatusFilter={selectedStatusFilter}
          onSelectStatusFilter={onSelectStatusFilter}
          selectedPayerFilter={selectedPayerFilter}
          onSelectPayerFilter={onSelectPayerFilter}
          claimCountsByStatus={claimCountsByStatus}
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
