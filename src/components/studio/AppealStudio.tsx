import React, { useState } from "react";
import {
  FileText,
  Sparkles,
  Loader2,
  Check,
  Eye,
  Edit3,
  Stethoscope,
  Printer,
} from "lucide-react";
import { Claim, ClinicalEvidence, AppealLevel } from "../../types";
import { useAppealStudio } from "../../hooks/useAppealStudio";
import { CitationSidebar } from "./CitationSidebar";
import { ExportDrawer } from "./ExportDrawer";

interface AppealStudioProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  onNavigateToDispatch?: () => void;
  onNavigateToEvidence?: () => void;
}

export const AppealStudio: React.FC<AppealStudioProps> = ({
  claim,
  evidences,
  onNavigateToDispatch,
}) => {
  const {
    appeal,
    markdownContent,
    setMarkdownContent,
    appealLevel,
    setAppealLevel,
    physicianNotes,
    setPhysicianNotes,
    isSynthesizing,
    isSaving,
    saveStatus,
    synthesizeAppeal,
    insertTextAtCursor,
  } = useAppealStudio(claim);

  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "split">("split");
  const [showNotesDrawer, setShowNotesDrawer] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  const handleRunSynthesis = async () => {
    setSynthesisError(null);
    try {
      await synthesizeAppeal(appealLevel, physicianNotes);
    } catch (err: any) {
      setSynthesisError(err?.message || "Failed to synthesize appeal brief with OpenAI.");
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Studio Header Toolbar */}
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-glass-panel shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <FileText className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-sans">
                  Collaborative Appeal Studio
                </h2>
                <span className="rounded-md border border-cyan-500/40 bg-cyan-950/60 px-2 py-0.5 text-[10px] font-mono text-cyan-300 font-bold uppercase">
                  Claim #{claim.claimNumber}
                </span>
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving to Convex...</span>
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <Check className="h-3 w-3" />
                    <span>Synced (v{appeal?.version || 1})</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Patient: <span className="text-slate-200 font-semibold">{claim.patient?.name}</span> • Payer:{" "}
                <span className="text-cyan-300">{claim.patient?.insurancePayer}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Appeal Level Selector */}
            <select
              value={appealLevel}
              onChange={(e) => setAppealLevel(e.target.value as AppealLevel)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none font-mono"
            >
              <option value="level_1_internal">Level 1: Internal Appeal (ERISA 180d)</option>
              <option value="level_2_grievance">Level 2: Formal Grievance Review</option>
              <option value="level_3_external_state_review">Level 3: External State Commissioner Review</option>
            </select>

            {/* Treating Physician Notes Toggle */}
            <button
              onClick={() => setShowNotesDrawer(!showNotesDrawer)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                showNotesDrawer || physicianNotes
                  ? "border-amber-500/50 bg-amber-950/30 text-amber-300"
                  : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
              }`}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              <span>Physician Notes {physicianNotes ? "✓" : ""}</span>
            </button>

            {/* Synthesize Appeal with gpt-5-nano */}
            <button
              onClick={handleRunSynthesis}
              disabled={isSynthesizing || isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSynthesizing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-950" />
                  <span>Synthesizing with gpt-5-nano...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 fill-slate-950" />
                  <span>Synthesize Brief</span>
                </>
              )}
            </button>

            {/* Export & Preview Trigger */}
            <button
              onClick={() => setIsExportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-850 hover:text-white transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export Dossier</span>
            </button>
          </div>
        </div>

        {/* Synthesis Error Alert */}
        {synthesisError && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-300">
            {synthesisError}
          </div>
        )}

        {/* Optional Physician Notes Panel */}
        {showNotesDrawer && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-mono text-amber-300">
              <span className="flex items-center gap-1.5 font-bold">
                <Stethoscope className="h-3.5 w-3.5" />
                Treating Physician Clinical Addendum & Conservative Therapy Record
              </span>
              <button
                onClick={() => setShowNotesDrawer(false)}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Hide
              </button>
            </div>
            <textarea
              rows={3}
              value={physicianNotes}
              onChange={(e) => setPhysicianNotes(e.target.value)}
              placeholder="Paste specific physician clinical addendum, e.g.: Patient completed 14 weeks of formal physical therapy with Dr. Miller and underwent right knee cortisone injection on 03/10/2026 with no functional relief..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:border-amber-400 focus:outline-none font-sans"
            />
          </div>
        )}
      </div>

      {/* Main Studio Dual Pane Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-hidden">
        {/* Left 8 Cols: Markdown Editor & Live Preview */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-glass-panel">
          {/* Sub-view Viewport Switcher */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900/60 shrink-0">
            <div className="flex items-center gap-1 text-xs font-mono">
              <button
                onClick={() => setActiveTab("edit")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeTab === "edit" ? "bg-cyan-950 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Editor Only</span>
              </button>
              <button
                onClick={() => setActiveTab("split")}
                className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeTab === "split" ? "bg-cyan-950 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Split View</span>
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeTab === "preview" ? "bg-cyan-950 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Formatted Preview</span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-500">
              {markdownContent.length} chars • {markdownContent.split(/\s+/).filter(Boolean).length} words
            </div>
          </div>

          {/* Editor & Preview Panes */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
            {/* Editor Pane */}
            {(activeTab === "edit" || activeTab === "split") && (
              <div className={`h-full overflow-hidden p-3 ${activeTab === "split" ? "border-r border-slate-800" : "col-span-2"}`}>
                <textarea
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  placeholder="The full appeal brief will appear here once synthesized, or you can begin writing manually..."
                  className="w-full h-full bg-transparent text-slate-200 text-xs font-mono resize-none focus:outline-none leading-relaxed p-2"
                />
              </div>
            )}

            {/* Rendered Markdown Preview Pane */}
            {(activeTab === "preview" || activeTab === "split") && (
              <div className={`h-full overflow-y-auto p-4 bg-slate-900/30 ${activeTab === "preview" ? "col-span-2" : ""}`}>
                {markdownContent ? (
                  <div className="prose prose-invert max-w-none text-xs leading-relaxed font-sans space-y-3 whitespace-pre-line text-slate-300">
                    {markdownContent}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                    <Sparkles className="h-8 w-8 text-cyan-400/60" />
                    <div className="text-xs font-semibold text-slate-300">No Appeal Brief Draft Yet</div>
                    <p className="text-[11px] text-slate-500 max-w-xs">
                      Click &quot;Synthesize Brief&quot; above to have gpt-5-nano automatically generate a multi-page ERISA & clinical appeal packet citing all policy clauses.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Cols: Citation & Footnote Sidebar */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 overflow-y-auto shadow-glass-panel">
          <CitationSidebar evidences={evidences} onInsertSnippet={insertTextAtCursor} />
        </div>
      </div>

      {/* Export & Print Preview Drawer Modal */}
      <ExportDrawer
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        claim={claim}
        appeal={appeal}
        markdownContent={markdownContent}
        onProceedToDispatch={() => {
          setIsExportOpen(false);
          if (onNavigateToDispatch) onNavigateToDispatch();
        }}
      />
    </div>
  );
};
