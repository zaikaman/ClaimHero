import React from "react";
import { Header } from "./Header";
import { Sidebar, NavigationView } from "./Sidebar";
import { Claim } from "../../types";
import { Silk } from "../ui/Silk";

interface ShellProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  claims?: Claim[];
  selectedClaim?: Claim | null;
  onSelectClaim?: (claimId: string) => void;
  onOpenIngestion: () => void;
  onDeleteCase?: (claimId: string) => Promise<any>;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
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
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
  children,
}) => {
  return (
    <div className="relative flex h-screen w-full flex-col bg-background text-foreground antialiased overflow-hidden">
      {/* Ambient Silk Shader Dynamic Canvas Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
        <div className="absolute -top-[10%] -left-[10%] w-[120vw] h-[120vh] opacity-45 dark:opacity-35 transition-opacity duration-700">
          <Silk
            speed={10}
            scale={0.9}
            color="#59677b"
            noiseIntensity={1}
            rotation={0}
          />
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
          <div className="mx-auto max-w-7xl h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
};
