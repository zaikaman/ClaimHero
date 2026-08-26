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
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
  claimCountsByStatus,
  children,
}) => {
  return (
    <div className="flex h-screen w-full flex-col bg-[#0b0f17] text-slate-100 antialiased overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-300">
      {/* Top Fixed Header */}
      <Header
        onOpenIngestion={onOpenIngestion}
        totalDisputedAmount={totalDisputedAmount}
        totalWonAmount={totalWonAmount}
        winRate={winRate}
        criticalDeadlinesCount={criticalDeadlinesCount}
      />

      {/* Main Workspace: Sidebar + Dynamic Main Pane */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentView={currentView}
          onSelectView={onSelectView}
          selectedStatusFilter={selectedStatusFilter}
          onSelectStatusFilter={onSelectStatusFilter}
          selectedPayerFilter={selectedPayerFilter}
          onSelectPayerFilter={onSelectPayerFilter}
          claimCountsByStatus={claimCountsByStatus}
        />

        <main className="flex-1 overflow-y-auto bg-[#0b0f17]/60 bg-grid-pattern p-4 lg:p-6">
          <div className="mx-auto max-w-7xl h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
};
