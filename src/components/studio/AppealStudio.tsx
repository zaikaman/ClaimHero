import React, { useState } from "react";
import {
  FileText,
  Sparkle,
  CircleNotch,
  Check,
  Eye,
  PencilSimpleLine,
  Stethoscope,
  Printer,
  ArrowRight,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, AppealLevel } from "../../types";
import { useAppealStudio } from "../../hooks/useAppealStudio";
import { CitationSidebar } from "./CitationSidebar";
import { ExportDrawer } from "./ExportDrawer";
import { AppealBriefRenderer } from "./AppealBriefRenderer";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Textarea } from "../ui/textarea";

interface AppealStudioProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  onNavigateToDispatch?: () => void;
  onNavigateToEvidence?: () => void;
  onNavigateView?: (view: FlowView) => void;
  onRunAutonomousPipeline?: (claimId?: string) => Promise<any>;
}

export const AppealStudio: React.FC<AppealStudioProps> = ({
  claim,
  evidences,
  onNavigateToDispatch,
  onNavigateToEvidence,
  onNavigateView,
  onRunAutonomousPipeline,
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
      setSynthesisError(
        err?.message || "Failed to synthesize appeal brief with OpenAI."
      );
    }
  };

  return (
    <div className="space-y-3 animate-fadeIn pb-16 min-h-[calc(100vh-6.5rem)] flex flex-col">
      {/* 4-Step Guided Sentinel Stepper */}
      <SentinelFlowStepper
        claim={claim}
        currentView="studio"
        onNavigateView={(v) => {
          if (onNavigateView) onNavigateView(v);
          else if (v === "evidence" && onNavigateToEvidence) onNavigateToEvidence();
          else if (v === "communications" && onNavigateToDispatch) onNavigateToDispatch();
        }}
        evidencesCount={evidences.length}
        hasDraftedBrief={Boolean(markdownContent.trim())}
        isProcessing={isSynthesizing}
        processingLabel="Synthesizing Appeal Brief..."
        onRunAutonomousPipeline={
          onRunAutonomousPipeline ? () => onRunAutonomousPipeline(claim._id) : undefined
        }
      />

      {/* Studio Header Toolbar */}
      <Card className="p-3.5 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <FileText className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground font-sans">
                  Collaborative Appeal Studio
                </h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Claim #{claim.claimNumber}
                </Badge>
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground animate-pulse">
                    <CircleNotch className="size-3 animate-spin" />
                    <span>Saving...</span>
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" />
                    <span>Synced (v{appeal?.version || 1})</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Patient: <span className="text-foreground font-medium">{claim.patient?.name}</span> • Payer:{" "}
                <span className="text-foreground font-medium">{claim.patient?.insurancePayer}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Appeal Level Selector */}
            <select
              value={appealLevel}
              onChange={(e) => setAppealLevel(e.target.value as AppealLevel)}
              className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans h-8"
            >
              <option value="level_1_internal">Level 1: Internal Appeal (ERISA 180d)</option>
              <option value="level_2_grievance">Level 2: Formal Grievance Review</option>
              <option value="level_3_external_state_review">Level 3: External State Commissioner Review</option>
            </select>

            {/* Treating Physician Notes Toggle */}
            <Button
              variant={showNotesDrawer || physicianNotes ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowNotesDrawer(!showNotesDrawer)}
              className="gap-1.5"
            >
              <Stethoscope className="size-3.5" />
              <span>Physician Notes{physicianNotes ? " (Added)" : ""}</span>
            </Button>

            {/* Synthesize Appeal with gpt-5-nano */}
            <Button
              size="sm"
              onClick={handleRunSynthesis}
              disabled={isSynthesizing || isSaving}
              className="gap-1.5"
            >
              {isSynthesizing ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkle className="size-3.5" />
                  <span>Synthesize Brief</span>
                </>
              )}
            </Button>

            {/* Export & Preview Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="gap-1.5"
            >
              <Printer className="size-3.5" />
              <span>Export Dossier</span>
            </Button>
          </div>
        </div>

        {/* Synthesis Error Alert */}
        {synthesisError && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{synthesisError}</AlertDescription>
          </Alert>
        )}

        {/* Optional Physician Notes Panel */}
        {showNotesDrawer && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-xs text-foreground">
              <span className="flex items-center gap-1.5 font-semibold">
                <Stethoscope className="size-3.5 text-muted-foreground" />
                Treating Physician Clinical Addendum & Conservative Therapy Record
              </span>
              <button
                onClick={() => setShowNotesDrawer(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Hide
              </button>
            </div>
            <Textarea
              rows={3}
              value={physicianNotes}
              onChange={(e) => setPhysicianNotes(e.target.value)}
              placeholder="Paste physician clinical notes, e.g.: Patient completed 14 weeks of formal physical therapy with Dr. Miller and underwent right knee cortisone injection on 03/10/2026 with no functional relief..."
              className="bg-background text-xs"
            />
          </div>
        )}
      </Card>

      {/* Main Studio Dual Pane Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 overflow-hidden">
        {/* Left 8 Cols: Markdown Editor & Live Preview */}
        <Card className="lg:col-span-8 flex flex-col overflow-hidden p-0">
          {/* Sub-view Viewport Switcher */}
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5 bg-muted/30 shrink-0">
            <div className="flex items-center gap-1">
              <Button
                variant={activeTab === "edit" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActiveTab("edit")}
                className="gap-1"
              >
                <PencilSimpleLine className="size-3" />
                <span>Editor</span>
              </Button>
              <Button
                variant={activeTab === "split" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActiveTab("split")}
                className="hidden md:inline-flex"
              >
                <span>Split View</span>
              </Button>
              <Button
                variant={activeTab === "preview" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActiveTab("preview")}
                className="gap-1"
              >
                <Eye className="size-3" />
                <span>Preview</span>
              </Button>
            </div>

            <div className="text-[11px] font-mono text-muted-foreground">
              {markdownContent.length} chars • {markdownContent.split(/\s+/).filter(Boolean).length} words
            </div>
          </div>

          {/* Editor & Preview Panes */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
            {/* Editor Pane */}
            {(activeTab === "edit" || activeTab === "split") && (
              <div
                className={`h-full overflow-hidden p-3 ${
                  activeTab === "split" ? "border-r border-border" : "col-span-2"
                }`}
              >
                <textarea
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  placeholder="The appeal brief will appear here once synthesized, or write manually..."
                  className="w-full h-full bg-transparent text-foreground text-xs font-mono resize-none focus:outline-none leading-relaxed p-1 placeholder:text-muted-foreground"
                />
              </div>
            )}

            {/* Rendered Markdown Preview Pane */}
            {(activeTab === "preview" || activeTab === "split") && (
              <div
                className={`h-full overflow-y-auto p-4 sm:p-5 bg-background/50 ${
                  activeTab === "preview" ? "col-span-2" : ""
                }`}
              >
                {markdownContent ? (
                  <div className="max-w-3xl mx-auto rounded-xl border border-border/80 bg-card/60 p-5 sm:p-6 shadow-sm">
                    <AppealBriefRenderer content={markdownContent} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3 text-muted-foreground my-auto">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Sparkle className="size-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <div className="text-sm font-semibold text-foreground">
                        Ready to Synthesize ERISA Appeal Brief
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Generate a formal cited appeal brief referencing {evidences.length} clinical policy clauses and 29 CFR § 2560.503-1 federal requirements.
                      </p>
                    </div>

                    <Button
                      onClick={handleRunSynthesis}
                      disabled={isSynthesizing}
                      className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md mt-2"
                    >
                      {isSynthesizing ? (
                        <>
                          <CircleNotch className="size-3.5 animate-spin" />
                          <span>Synthesizing Brief with gpt-5-nano...</span>
                        </>
                      ) : (
                        <>
                          <Sparkle className="size-3.5" />
                          <span>1-Click Synthesize Appeal Brief</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Right 4 Cols: Citation Sidebar */}
        <Card className="lg:col-span-4 p-4 overflow-y-auto">
          <CitationSidebar
            evidences={evidences}
          />
        </Card>
      </div>

      {/* Sticky Bottom Next-Step Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur-md p-3 px-4 sm:px-8 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs hidden sm:inline-flex">
            Step 3 of 4: Appeal Brief
          </Badge>
          <span className="text-xs text-muted-foreground">
            {markdownContent
              ? `${markdownContent.split(/\s+/).filter(Boolean).length} words • ERISA 29 CFR § 2560.503-1 Cited`
              : "Synthesize the appeal brief before dispatching to insurer"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExportOpen(true)}
            className="gap-1.5 text-xs h-8 hidden sm:inline-flex"
          >
            <Printer className="size-3.5" />
            <span>Export PDF Dossier</span>
          </Button>

          <Button
            onClick={() => {
              if (onNavigateToDispatch) onNavigateToDispatch();
            }}
            className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md hover:shadow-lg transition-all h-8"
          >
            <span>Next: Dispatch via Dedicated AgentMail</span>
            <ArrowRight className="size-3.5" />
          </Button>
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
