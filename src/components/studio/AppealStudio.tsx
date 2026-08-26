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
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, AppealLevel } from "../../types";
import { useAppealStudio } from "../../hooks/useAppealStudio";
import { CitationSidebar } from "./CitationSidebar";
import { ExportDrawer } from "./ExportDrawer";
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
      setSynthesisError(
        err?.message || "Failed to synthesize appeal brief with OpenAI."
      );
    }
  };

  return (
    <div className="space-y-3 animate-fadeIn h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Studio Header Toolbar */}
      <Card className="p-3.5 bg-card border-border shrink-0">
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
              <span>Physician Notes {physicianNotes ? "✓" : ""}</span>
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
        <Card className="lg:col-span-8 flex flex-col overflow-hidden p-0 bg-card border-border">
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
                className={`h-full overflow-y-auto p-4 bg-muted/10 ${
                  activeTab === "preview" ? "col-span-2" : ""
                }`}
              >
                {markdownContent ? (
                  <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed whitespace-pre-line text-foreground/90 font-sans">
                    {markdownContent}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-2 text-muted-foreground">
                    <Sparkle className="size-6 text-muted-foreground/60" />
                    <div className="text-xs font-medium text-foreground">No Brief Drafted Yet</div>
                    <p className="text-[11px] max-w-xs">
                      Click &quot;Synthesize Brief&quot; above to have gpt-5-nano generate an ERISA appeal brief citing policy clauses.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Right 4 Cols: Citation Sidebar */}
        <Card className="lg:col-span-4 p-4 overflow-y-auto bg-card border-border">
          <CitationSidebar
            evidences={evidences}
            onInsertSnippet={insertTextAtCursor}
          />
        </Card>
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
