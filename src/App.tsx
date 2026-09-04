import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Shell } from "./components/layout/Shell";
import { NavigationView } from "./components/layout/Sidebar";
import { CommandDialog } from "./components/common/CommandDialog";
import { CasePickerEmptyState } from "./components/common/CasePickerEmptyState";
import { useClaims } from "./hooks/useClaims";
import { useEvidence } from "./hooks/useEvidence";
import { useCommunications } from "./hooks/useCommunications";
import { useRouterView } from "./hooks/useRouterView";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { BrandIcon, BrandWordmark } from "./components/common/BrandLogo";
import { CircleNotch } from "@phosphor-icons/react";
import { Toaster } from "sonner";

// Lazy-load heavy views and standalone feature workspaces
const CaseRadar = lazy(() => import("./components/radar/CaseRadar").then((m) => ({ default: m.CaseRadar })));
const IngestionModal = lazy(() => import("./components/radar/IngestionModal").then((m) => ({ default: m.IngestionModal })));
const EvidenceMatrix = lazy(() => import("./components/evidence/EvidenceMatrix").then((m) => ({ default: m.EvidenceMatrix })));
const AppealStudio = lazy(() => import("./components/studio/AppealStudio").then((m) => ({ default: m.AppealStudio })));
const P2PDefenseStudio = lazy(() => import("./components/p2p/P2PDefenseStudio").then((m) => ({ default: m.P2PDefenseStudio })));
const FinancialLiabilityCalculator = lazy(() => import("./components/calculator/FinancialLiabilityCalculator").then((m) => ({ default: m.FinancialLiabilityCalculator })));
const AgentMailDrawer = lazy(() => import("./components/communications/AgentMailDrawer").then((m) => ({ default: m.AgentMailDrawer })));
const AuditTimeline = lazy(() => import("./components/communications/AuditTimeline").then((m) => ({ default: m.AuditTimeline })));
const AnalyticsMetrics = lazy(() => import("./components/analytics/AnalyticsMetrics").then((m) => ({ default: m.AnalyticsMetrics })));
const SettingsPage = lazy(() => import("./components/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const CinematicHero = lazy(() => import("./components/landing/CinematicHero").then((m) => ({ default: m.CinematicHero })));
const AuthPage = lazy(() => import("./components/auth/AuthPage").then((m) => ({ default: m.AuthPage })));
const OnboardingWizard = lazy(() => import("./components/onboarding/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })));
const OnboardingChecklist = lazy(() => import("./components/onboarding/OnboardingChecklist").then((m) => ({ default: m.OnboardingChecklist })));
const SentinelChatbot = lazy(() => import("./components/chat/SentinelChatbot").then((m) => ({ default: m.SentinelChatbot })));

function ViewLoadingFallback({ message = "Connecting to Sentinel Engine..." }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center space-y-3 flex-col animate-pulse">
      <CircleNotch className="size-6 text-foreground animate-spin" />
      <span className="text-xs font-mono text-muted-foreground">{message}</span>
    </div>
  );
}

export default function App() {
  const { currentView, setCurrentView } = useRouterView();
  const [isIngestionOpen, setIsIngestionOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [pendingTargetView, setPendingTargetView] = useState<NavigationView | null>(null);

  const { isAuthenticated, isAuthLoading, user } = useCurrentUser();
  const isDashboardActive = isAuthenticated && currentView !== "landing" && currentView !== "login";

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
  } = useClaims({ enabled: isDashboardActive });

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
  } = useEvidence(selectedClaim, { enabled: isDashboardActive });

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
  } = useCommunications(selectedClaim, { activeView: currentView, enabled: isDashboardActive });

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

  // Automatic redirect only if user is actively on the login page while authenticated
  useEffect(() => {
    if (currentView === "login" && isAuthenticated) {
      const nextView = pendingTargetView || "radar";
      setPendingTargetView(null);
      setCurrentView(nextView);
    }
  }, [currentView, isAuthenticated, pendingTargetView, setCurrentView]);

  // Open Sentinel Setup Guide (Onboarding) for new users on initial login
  useEffect(() => {
    if (isAuthenticated && typeof window !== "undefined") {
      const userKey = user?._id ? `claimhero_onboarding_completed_${user._id}` : "claimhero_onboarding_completed";
      const completed = localStorage.getItem(userKey) || localStorage.getItem("claimhero_onboarding_completed");
      if (!completed) {
        setIsOnboardingOpen(true);
      }
    }
  }, [isAuthenticated, user?._id]);

  if (currentView === "landing") {
    return (
      <Suspense fallback={<div className="h-screen w-screen bg-black" />}>
        <CinematicHero
          onEnterConsole={(view) => {
            if (!isAuthenticated) {
              setPendingTargetView((view as NavigationView) || "radar");
              setCurrentView("login");
            } else {
              setCurrentView((view as NavigationView) || "radar");
            }
          }}
        />
        <Toaster position="bottom-right" richColors theme="dark" closeButton />
      </Suspense>
    );
  }

  if (currentView === "login") {
    return (
      <Suspense fallback={<div className="h-screen w-screen bg-black" />}>
        <AuthPage
          onNavigate={setCurrentView}
          onSuccess={() => {
            const nextView = pendingTargetView || "radar";
            setPendingTargetView(null);
            setCurrentView(nextView);
          }}
        />
        <Toaster position="bottom-right" richColors theme="dark" closeButton />
      </Suspense>
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
      <Suspense fallback={<div className="h-screen w-screen bg-black" />}>
        <AuthPage
          onNavigate={setCurrentView}
          onSuccess={() => {
            const nextView = pendingTargetView || currentView || "radar";
            setPendingTargetView(null);
            setCurrentView(nextView);
          }}
        />
        <Toaster position="bottom-right" richColors theme="dark" closeButton />
      </Suspense>
    );
  }

  return (
    <>
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
          <ViewLoadingFallback message="Connecting to Sentinel Engine..." />
        ) : (
          <Suspense fallback={<ViewLoadingFallback message="Loading Sentinel Workspace..." />}>
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
              ) : selectedClaimId ? (
                <ViewLoadingFallback message="Opening case dossier & clinical policy matrix..." />
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
              ) : selectedClaimId ? (
                <ViewLoadingFallback message="Opening appeal synthesis workspace..." />
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
              ) : selectedClaimId ? (
                <ViewLoadingFallback message="Preparing Physician Peer-to-Peer tele-script..." />
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
              ) : selectedClaimId ? (
                <ViewLoadingFallback message="Calculating financial ERISA statutory damages..." />
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
              ) : selectedClaimId ? (
                <ViewLoadingFallback message="Connecting to secure AgentMail payer inbox..." />
              ) : (
                <CasePickerEmptyState
                  viewType="communications"
                  claims={claims}
                  onSelectClaim={setSelectedClaimId}
                  onOpenIngestion={handleOpenIngestion}
                  onNavigateToRadar={() => setCurrentView("radar")}
                />
              ))}

            {/* 7. Portfolio Recovery & Overturn Analytics (Platform) */}
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

            {/* 8. Immutable Case Audit Timeline (Platform) */}
            {currentView === "audit" && (
              <AuditTimeline
                claim={selectedClaim}
                logs={auditLogs}
                isLoading={isLoadingAudit}
              />
            )}

            {/* 9. Sentinel Operational & Advocate Settings */}
            {currentView === "settings" && (
              <SettingsPage
                onNavigateToRadar={() => setCurrentView("radar")}
              />
            )}
          </Suspense>
        )}

        {/* Real Ingestion Modal (File Upload + Text Paste + Presets + AgentMail) */}
        <Suspense fallback={null}>
          <IngestionModal
            isOpen={isIngestionOpen}
            onClose={() => setIsIngestionOpen(false)}
            onUploadFile={uploadAndParseDocument}
            onParseText={parseDocumentText}
            onSuccess={handleIngestionSuccess}
          />
        </Suspense>

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
        <Suspense fallback={null}>
          <OnboardingWizard
            isOpen={isOnboardingOpen}
            onClose={() => setIsOnboardingOpen(false)}
            onUploadFile={uploadAndParseDocument}
            onParseText={parseDocumentText}
            onOpenIngestionModal={handleOpenIngestion}
            onSuccess={handleIngestionSuccess}
          />
        </Suspense>

        {/* Floating HUD Sentinel Readiness Checklist */}
        <Suspense fallback={null}>
          <OnboardingChecklist
            currentView={currentView}
            onNavigate={setCurrentView}
            claims={claims}
            onOpenIngestion={handleOpenIngestion}
          />
        </Suspense>

        {/* Floating Autonomous Sentinel Copilot AI Chatbot (⌘J / Ctrl+J) */}
        <Suspense fallback={null}>
          <SentinelChatbot
            selectedClaim={selectedClaim}
            currentView={currentView}
          />
        </Suspense>
      </Shell>
      <Toaster position="bottom-right" richColors theme="dark" closeButton />
    </>
  );
}

