import { useState } from "react";
import { Shell } from "./components/layout/Shell";
import { NavigationView } from "./components/layout/Sidebar";
import { CaseRadar } from "./components/radar/CaseRadar";
import { IngestionModal } from "./components/radar/IngestionModal";
import { EvidenceMatrix } from "./components/evidence/EvidenceMatrix";
import { AppealStudio } from "./components/studio/AppealStudio";
import { useClaims } from "./hooks/useClaims";
import { useEvidence } from "./hooks/useEvidence";
import {
  ArrowRight,
  Mail,
  Clock,
  Loader2,
} from "lucide-react";

export default function App() {
  const [currentView, setCurrentView] = useState<NavigationView>("radar");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payerFilter, setPayerFilter] = useState<string>("all");
  const [isIngestionOpen, setIsIngestionOpen] = useState<boolean>(false);

  const {
    claims,
    isLoading,
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

  const handleOpenIngestion = () => {
    setIsIngestionOpen(true);
  };

  const handleIngestionSuccess = (claimId: string) => {
    setSelectedClaimId(claimId);
    setCurrentView("radar");
  };

  return (
    <Shell
      currentView={currentView}
      onSelectView={setCurrentView}
      selectedStatusFilter={statusFilter}
      onSelectStatusFilter={setStatusFilter}
      selectedPayerFilter={payerFilter}
      onSelectPayerFilter={setPayerFilter}
      onOpenIngestion={handleOpenIngestion}
      totalDisputedAmount={stats.activeDisputedAmount + stats.overturnedWonAmount}
      totalWonAmount={stats.overturnedWonAmount}
      winRate={stats.averageWinScore}
      criticalDeadlinesCount={stats.criticalDeadlinesCount}
      claimCountsByStatus={claimCountsByStatus}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center space-y-3 flex-col">
          <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
          <span className="text-xs font-mono text-slate-400">
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
          {currentView === "evidence" && (
            selectedClaim ? (
              <EvidenceMatrix
                claim={selectedClaim}
                evidences={evidences}
                isLoadingEvidences={isLoadingEvidences}
                onCrawlPolicy={crawlPolicy}
                onComputeScore={computeOverturnScore}
                onNavigateToStudio={() => setCurrentView("studio")}
              />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
                <div className="text-sm font-semibold text-slate-300">No Claim Selected</div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Please select a claim from the Case Radar Feed to inspect its Clinical Policy Bulletin evidence and calculate its win probability.
                </p>
                <button
                  onClick={() => setCurrentView("radar")}
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                >
                  <span>Go to Case Radar</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          )}

          {/* 3. Collaborative Appeal Studio */}
          {currentView === "studio" && (
            selectedClaim ? (
              <AppealStudio
                claim={selectedClaim}
                evidences={evidences}
                onNavigateToDispatch={() => setCurrentView("communications")}
                onNavigateToEvidence={() => setCurrentView("evidence")}
              />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
                <div className="text-sm font-semibold text-slate-300">No Claim Selected</div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Please select a claim from the Case Radar Feed to synthesize and collaboratively edit an ERISA appeal brief.
                </p>
                <button
                  onClick={() => setCurrentView("radar")}
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                >
                  <span>Go to Case Radar</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          )}

          {/* 4. Dedicated AgentMail Claim Inbox */}
          {currentView === "communications" && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
              <div className="inline-flex p-3 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
                <Mail className="h-8 w-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Dedicated AgentMail Claim Inbox</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {selectedClaim ? (
                  <>
                    Assigned Claim Inbox:{" "}
                    <span className="text-cyan-300 font-mono font-semibold">
                      {selectedClaim.assignedAgentEmail}
                    </span>
                  </>
                ) : (
                  "Universal Ingestion Address: intake@claimhero.agentmail.com"
                )}
              </p>
              <button
                onClick={() => setCurrentView("radar")}
                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
              >
                <span>Back to Case Radar Feed</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 5. Immutable Case Audit Timeline */}
          {currentView === "audit" && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
              <div className="inline-flex p-3 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
                <Clock className="h-8 w-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Immutable Case Audit Timeline</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tracking chronological case milestones, optical extractions, policy scrapes, and dispatch receipts directly on Convex.
              </p>
              <button
                onClick={() => setCurrentView("radar")}
                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
              >
                <span>Back to Case Radar Feed</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
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
    </Shell>
  );
}
