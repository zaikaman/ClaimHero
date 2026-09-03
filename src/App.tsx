import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/layout/Shell";
import { NavigationView } from "./components/layout/Sidebar";

import { CaseRadar } from "./components/radar/CaseRadar";
import { IngestionModal } from "./components/radar/IngestionModal";
import { EvidenceMatrix } from "./components/evidence/EvidenceMatrix";
import { AppealStudio } from "./components/studio/AppealStudio";
import { P2PDefenseStudio } from "./components/p2p/P2PDefenseStudio";
import { FinancialLiabilityCalculator } from "./components/calculator/FinancialLiabilityCalculator";
import { AgentMailDrawer } from "./components/communications/AgentMailDrawer";
import { AuditTimeline } from "./components/communications/AuditTimeline";
import { AnalyticsMetrics } from "./components/analytics/AnalyticsMetrics";
import { CommandDialog } from "./components/common/CommandDialog";
import { CasePickerEmptyState } from "./components/common/CasePickerEmptyState";
import { useClaims } from "./hooks/useClaims";
import { useEvidence } from "./hooks/useEvidence";
import { useCommunications } from "./hooks/useCommunications";
import { useRouterView } from "./hooks/useRouterView";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { CinematicHero } from "./components/landing/CinematicHero";
import { AuthPage } from "./components/auth/AuthPage";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { OnboardingChecklist } from "./components/onboarding/OnboardingChecklist";
import { SentinelChatbot } from "./components/chat/SentinelChatbot";
import { SettingsPage } from "./components/settings/SettingsPage";
import { BrandIcon, BrandWordmark } from "./components/common/BrandLogo";
import { CircleNotch } from "@phosphor-icons/react";

export default function App() {
  const { currentView, setCurrentView } = useRouterView();
  const [isIngestionOpen, setIsIngestionOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  const {
    claims,
    isLoading,
    portfolioStats,
    isLoadingPortfolioStats,
    selectedClaim,
    selectedClaimId,
    setSelectedClaimId,
    includeDemo,
    setIncludeDemo,
    stats,
    uploadAndParseDocument,
    parseDocumentText,
    deleteCase,
  } = useClaims({});

  const {
    evidences,
    isLoadingEvidences,
    crawlPolicy,
    crawlPubMed,
    crawlFda,
    crawlCustomUrl,
    crawlMultiSourceHub,
    deleteEvidence,
    computeOverturnScore,
    runFullPipeline,
  } = useEvidence(selectedClaim);

  const {
    threads,
    messages,
    auditLogs,
    isLoadingCommunications,
    isLoadingAudit,
    sendMessage,
    dispatchAppeal,
    syncInboxes,
    isSyncingInboxes,
  } = useCommunications(selectedClaim);

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

  const handleIngestionSuccess = (claimId: string, directView?: string) => {
    setIncludeDemo(true);
    setSelectedClaimId(claimId);
    setCurrentView((directView as NavigationView) || "evidence");
  };

  const { isAuthenticated, isAuthLoading } = useCurrentUser();

  // Automatic redirect only if user is actively on the login page while authenticated
  useEffect(() => {
    if (currentView === "login" && isAuthenticated) {
      setCurrentView("radar");
    }
  }, [currentView, isAuthenticated, setCurrentView]);

  // Open Sentinel Setup Guide (Onboarding) for new users on initial login
  useEffect(() => {
    if (isAuthenticated && typeof window !== "undefined") {
      const completed = localStorage.getItem("claimhero_onboarding_completed");
      if (!completed) {
        setIsOnboardingOpen(true);
      }
    }
  }, [isAuthenticated]);

  if (currentView === "landing") {
    return (
      <CinematicHero
        onEnterConsole={(view) => {
          if (!isAuthenticated) {
            setCurrentView("login");
          } else {
            setCurrentView(view || "radar");
          }
        }}
      />
    );
  }

  if (currentView === "login") {
    return (
      <AuthPage
        onNavigate={setCurrentView}
        onSuccess={() => setCurrentView("radar")}
      />
    );
  }

  // Protected Routes Guard (radar, evidence, studio, communications, analytics, audit)
  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <BrandIcon size="xl" />
          <div className="flex flex-col items-center gap-1.5">
            <BrandWordmark size="md" />
            <span className="text-xs font-mono text-muted-foreground">Verifying session...</span>
          </div>
          <CircleNotch className="size-4 animate-spin text-muted-foreground mt-1" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthPage
        onNavigate={setCurrentView}
        onSuccess={() => setCurrentView(currentView || "radar")}
      />
    );
  }

  return (
    <Shell
      currentView={currentView}
      onSelectView={setCurrentView}
      claims={claims}
      selectedClaim={selectedClaim}
      onSelectClaim={setSelectedClaimId}
      onOpenIngestion={handleOpenIngestion}
      onDeleteCase={deleteCase}
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebar={handleToggleSidebar}
      onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      totalDisputedAmount={stats.activeDisputedAmount + stats.overturnedWonAmount}
      totalWonAmount={stats.overturnedWonAmount}
      winRate={stats.averageWinScore}
      criticalDeadlinesCount={stats.criticalDeadlinesCount}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center space-y-3 flex-col">
          <CircleNotch className="size-6 text-foreground animate-spin" />
          <span className="text-xs font-mono text-muted-foreground">
            Connecting to Sentinel Engine...
          </span>
        </div>
      ) : (
        <>
          {/* 1. Case Ingestion Radar View (Platform) */}
          {currentView === "radar" && (
            <CaseRadar
              claims={claims}
              selectedClaimId={selectedClaimId}
              onSelectClaim={setSelectedClaimId}
              onOpenIngestion={handleOpenIngestion}
              onNavigateView={setCurrentView}
              onDeleteCase={deleteCase}
              onRunAutonomousPipeline={runFullPipeline}
              includeDemo={includeDemo}
              onToggleIncludeDemo={() => setIncludeDemo((prev) => !prev)}
            />
          )}

          {/* 2. Clinical Policy Evidence Matrix & Inspector (Active Case Workspace) */}
          {currentView === "evidence" &&
            (selectedClaim ? (
              <EvidenceMatrix
                claim={selectedClaim}
                evidences={evidences}
                isLoadingEvidences={isLoadingEvidences}
                onCrawlPolicy={crawlPolicy}
                onCrawlPubMed={crawlPubMed}
                onCrawlFDA={crawlFda}
                onCrawlCustomUrl={crawlCustomUrl}
                onCrawlMultiSource={crawlMultiSourceHub}
                onDeleteEvidence={deleteEvidence}
                onComputeScore={computeOverturnScore}
                onNavigateToStudio={() => setCurrentView("studio")}
                onNavigateView={setCurrentView}
                onRunAutonomousPipeline={runFullPipeline}
              />
            ) : (
              <CasePickerEmptyState
                viewType="evidence"
                claims={claims}
                onSelectClaim={setSelectedClaimId}
                onOpenIngestion={handleOpenIngestion}
                onNavigateToRadar={() => setCurrentView("radar")}
              />
            ))}

          {/* 3. Collaborative Appeal Studio (Active Case Workspace) */}
          {currentView === "studio" &&
            (selectedClaim ? (
              <AppealStudio
                claim={selectedClaim}
                evidences={evidences}
                onNavigateToDispatch={() => setCurrentView("communications")}
                onNavigateToEvidence={() => setCurrentView("evidence")}
                onNavigateView={setCurrentView}
                onRunAutonomousPipeline={runFullPipeline}
              />
            ) : (
              <CasePickerEmptyState
                viewType="studio"
                claims={claims}
                onSelectClaim={setSelectedClaimId}
                onOpenIngestion={handleOpenIngestion}
                onNavigateToRadar={() => setCurrentView("radar")}
              />
            ))}

          {/* 4. Physician Peer-to-Peer (P2P) Defense Tele-Script Generator (Active Case Workspace) */}
          {currentView === "p2p" &&
            (selectedClaim ? (
              <P2PDefenseStudio
                claim={selectedClaim}
                onNavigateView={setCurrentView}
              />
            ) : (
              <CasePickerEmptyState
                viewType="studio"
                claims={claims}
                onSelectClaim={setSelectedClaimId}
                onOpenIngestion={handleOpenIngestion}
                onNavigateToRadar={() => setCurrentView("radar")}
              />
            ))}

          {/* 5. Financial Liability & Statutory ERISA Penalty Calculator (Active Case Workspace) */}
          {currentView === "calculator" &&
            (selectedClaim ? (
              <FinancialLiabilityCalculator
                claim={selectedClaim}
                onNavigateView={setCurrentView}
              />
            ) : (
              <CasePickerEmptyState
                viewType="studio"
                claims={claims}
                onSelectClaim={setSelectedClaimId}
                onOpenIngestion={handleOpenIngestion}
                onNavigateToRadar={() => setCurrentView("radar")}
              />
            ))}

          {/* 6. Dedicated AgentMail Claim Inbox (Active Case Workspace) */}
          {currentView === "communications" &&
            (selectedClaim ? (
              <AgentMailDrawer
                claim={selectedClaim}
                threads={threads}
                messages={messages}
                isLoading={isLoadingCommunications}
                onSendMessage={sendMessage}
                onDispatchAppeal={dispatchAppeal}
                onNavigateView={setCurrentView}
                onRunAutonomousPipeline={runFullPipeline}
                onSyncInboxes={syncInboxes}
                isSyncingInboxes={isSyncingInboxes}
              />
            ) : (
              <CasePickerEmptyState
                viewType="communications"
                claims={claims}
                onSelectClaim={setSelectedClaimId}
                onOpenIngestion={handleOpenIngestion}
                onNavigateToRadar={() => setCurrentView("radar")}
              />
            ))}

          {/* 5. Portfolio Recovery & Overturn Analytics (Platform) */}
          {currentView === "analytics" && (
            <AnalyticsMetrics
              stats={portfolioStats}
              isLoading={isLoadingPortfolioStats}
              onSelectPayerFilter={() => {
                setCurrentView("radar");
              }}
              onNavigateToRadar={() => setCurrentView("radar")}
            />
          )}

          {/* 6. Immutable Case Audit Timeline (Platform) */}
          {currentView === "audit" && (
            <AuditTimeline
              claim={selectedClaim}
              logs={auditLogs}
              isLoading={isLoadingAudit}
            />
          )}

          {/* 7. Sentinel Operational & Advocate Settings */}
          {currentView === "settings" && (
            <SettingsPage
              onNavigateToRadar={() => setCurrentView("radar")}
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
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onDeleteCase={deleteCase}
      />

      {/* Interactive 3-Step Sentinel Setup Wizard (Onboarding) */}
      <OnboardingWizard
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onUploadFile={uploadAndParseDocument}
        onParseText={parseDocumentText}
        onOpenIngestionModal={handleOpenIngestion}
        onSuccess={handleIngestionSuccess}
      />

      {/* Floating HUD Sentinel Readiness Checklist */}
      <OnboardingChecklist
        currentView={currentView}
        onNavigate={setCurrentView}
        claims={claims}
        onOpenIngestion={handleOpenIngestion}
      />

      {/* Floating Autonomous Sentinel Copilot AI Chatbot (⌘J / Ctrl+J) */}
      <SentinelChatbot
        selectedClaim={selectedClaim}
        currentView={currentView}
      />
    </Shell>
  );
}

