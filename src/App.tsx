import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/layout/Shell";

import { CaseRadar } from "./components/radar/CaseRadar";
import { IngestionModal } from "./components/radar/IngestionModal";
import { EvidenceMatrix } from "./components/evidence/EvidenceMatrix";
import { AppealStudio } from "./components/studio/AppealStudio";
import { AgentMailDrawer } from "./components/communications/AgentMailDrawer";
import { AuditTimeline } from "./components/communications/AuditTimeline";
import { AnalyticsMetrics } from "./components/analytics/AnalyticsMetrics";
import { CommandDialog } from "./components/common/CommandDialog";
import { useClaims } from "./hooks/useClaims";
import { useEvidence } from "./hooks/useEvidence";
import { useCommunications } from "./hooks/useCommunications";
import { useRouterView } from "./hooks/useRouterView";
import { CinematicHero } from "./components/landing/CinematicHero";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";

export default function App() {
  const { currentView, setCurrentView } = useRouterView();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payerFilter, setPayerFilter] = useState<string>("all");
  const [isIngestionOpen, setIsIngestionOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });

  const {
    claims,
    isLoading,
    portfolioStats,
    isLoadingPortfolioStats,
    selectedClaim,
    selectedClaimId,
    setSelectedClaimId,
    stats,
    claimCountsByStatus,
    uploadAndParseDocument,
    parseDocumentText,
  } = useClaims({
    statusFilter,
    payerFilter,
  });

  const {
    evidences,
    isLoadingEvidences,
    crawlPolicy,
    computeOverturnScore,
  } = useEvidence(selectedClaim);

  const {
    threads,
    messages,
    auditLogs,
    isLoadingCommunications,
    isLoadingAudit,
    sendMessage,
    dispatchAppeal,
  } = useCommunications(selectedClaim);

  const handleToggleTheme = useCallback(() => {
    const root = document.documentElement;
    if (root.classList.contains("dark")) {
      root.classList.remove("dark");
      setIsDark(false);
    } else {
      root.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K, Cmd+B / Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleOpenIngestion = () => {
    setIsIngestionOpen(true);
  };

  const handleIngestionSuccess = (claimId: string) => {
    setSelectedClaimId(claimId);
    setCurrentView("radar");
  };

  if (currentView === "landing") {
    return (
      <CinematicHero
        onEnterConsole={(view) => setCurrentView(view || "radar")}
      />
    );
  }

  return (
    <Shell
      currentView={currentView}
      onSelectView={setCurrentView}
      selectedStatusFilter={statusFilter}
      onSelectStatusFilter={setStatusFilter}
      selectedPayerFilter={payerFilter}
      onSelectPayerFilter={setPayerFilter}
      onOpenIngestion={handleOpenIngestion}
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebar={handleToggleSidebar}
      onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      isDark={isDark}
      onToggleTheme={handleToggleTheme}
      totalDisputedAmount={stats.activeDisputedAmount + stats.overturnedWonAmount}
      totalWonAmount={stats.overturnedWonAmount}
      winRate={stats.averageWinScore}
      criticalDeadlinesCount={stats.criticalDeadlinesCount}
      claimCountsByStatus={claimCountsByStatus}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center space-y-3 flex-col">
          <Loader2 className="size-6 text-foreground animate-spin" />
          <span className="text-xs font-mono text-muted-foreground">
            Connecting to Convex Cloud Database...
          </span>
        </div>
      ) : (
        <>
          {/* 1. Case Ingestion Radar View */}
          {currentView === "radar" && (
            <CaseRadar
              claims={claims}
              selectedClaimId={selectedClaimId}
              onSelectClaim={setSelectedClaimId}
              onOpenIngestion={handleOpenIngestion}
              onNavigateView={setCurrentView}
            />
          )}

          {/* 2. Clinical Policy Evidence Matrix & Inspector */}
          {currentView === "evidence" &&
            (selectedClaim ? (
              <EvidenceMatrix
                claim={selectedClaim}
                evidences={evidences}
                isLoadingEvidences={isLoadingEvidences}
                onCrawlPolicy={crawlPolicy}
                onComputeScore={computeOverturnScore}
                onNavigateToStudio={() => setCurrentView("studio")}
              />
            ) : (
              <Card className="p-12 text-center items-center justify-center space-y-3 bg-muted/20 border-dashed">
                <div className="text-sm font-semibold text-foreground">
                  No Claim Selected
                </div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Please select a claim from the Case Radar Feed to inspect its Clinical Policy Bulletin evidence and calculate its win probability.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentView("radar")}
                  className="gap-1"
                >
                  <span>Go to Case Radar</span>
                  <ArrowRight className="size-3" />
                </Button>
              </Card>
            ))}

          {/* 3. Collaborative Appeal Studio */}
          {currentView === "studio" &&
            (selectedClaim ? (
              <AppealStudio
                claim={selectedClaim}
                evidences={evidences}
                onNavigateToDispatch={() => setCurrentView("communications")}
                onNavigateToEvidence={() => setCurrentView("evidence")}
              />
            ) : (
              <Card className="p-12 text-center items-center justify-center space-y-3 bg-muted/20 border-dashed">
                <div className="text-sm font-semibold text-foreground">
                  No Claim Selected
                </div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Please select a claim from the Case Radar Feed to synthesize and collaboratively edit an ERISA appeal brief.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentView("radar")}
                  className="gap-1"
                >
                  <span>Go to Case Radar</span>
                  <ArrowRight className="size-3" />
                </Button>
              </Card>
            ))}

          {/* 4. Dedicated AgentMail Claim Inbox */}
          {currentView === "communications" &&
            (selectedClaim ? (
              <AgentMailDrawer
                claim={selectedClaim}
                threads={threads}
                messages={messages}
                isLoading={isLoadingCommunications}
                onSendMessage={sendMessage}
                onDispatchAppeal={dispatchAppeal}
              />
            ) : (
              <Card className="p-12 text-center items-center justify-center space-y-3 bg-muted/20 border-dashed">
                <div className="text-sm font-semibold text-foreground">
                  No Claim Selected
                </div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Please select a claim from the Case Radar to view its dedicated AgentMail inbox and transmission history.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentView("radar")}
                  className="gap-1"
                >
                  <span>Go to Case Radar</span>
                  <ArrowRight className="size-3" />
                </Button>
              </Card>
            ))}

          {/* 5. Portfolio Recovery & Overturn Analytics */}
          {currentView === "analytics" && (
            <AnalyticsMetrics
              stats={portfolioStats}
              isLoading={isLoadingPortfolioStats}
              onSelectPayerFilter={(payer) => {
                setPayerFilter(payer);
                setCurrentView("radar");
              }}
              onNavigateToRadar={() => setCurrentView("radar")}
            />
          )}

          {/* 6. Immutable Case Audit Timeline */}
          {currentView === "audit" && (
            <AuditTimeline
              claim={selectedClaim}
              logs={auditLogs}
              isLoading={isLoadingAudit}
            />
          )}
        </>
      )}

      {/* Real Ingestion Modal (File Upload + Text Paste + Presets + AgentMail) */}
      <IngestionModal
        isOpen={isIngestionOpen}
        onClose={() => setIsIngestionOpen(false)}
        onUploadFile={uploadAndParseDocument}
        onParseText={parseDocumentText}
        onSuccess={handleIngestionSuccess}
      />

      {/* Global Interactive Command Palette (⌘K / Ctrl+K) */}
      <CommandDialog
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        claims={claims}
        onSelectClaim={setSelectedClaimId}
        onNavigateView={setCurrentView}
        onOpenIngestion={handleOpenIngestion}
        onToggleTheme={handleToggleTheme}
        isDark={isDark}
      />
    </Shell>
  );
}
