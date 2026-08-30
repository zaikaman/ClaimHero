import React, { useState } from "react";
import {
  FileText,
  Sparkle,
  CircleNotch,
  Check,
  Eye,
  PencilSimpleLine,
  Stethoscope,
  IdentificationCard,
  EnvelopeSimple,
  Phone,
  Printer,
  ArrowRight,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, AppealLevel } from "../../types";
import { useAppealStudio } from "../../hooks/useAppealStudio";
import { usePrecedents } from "../../hooks/usePrecedents";
import { CitationSidebar } from "./CitationSidebar";
import { ExportDrawer } from "./ExportDrawer";
import { AppealBriefRenderer } from "./AppealBriefRenderer";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

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
    senderName,
    setSenderName,
    senderCredentials,
    setSenderCredentials,
    senderEmail,
    setSenderEmail,
    senderPhone,
    setSenderPhone,
    isSynthesizing,
    isSaving,
    saveStatus,
    synthesizeAppeal,
    insertTextAtCursor,
  } = useAppealStudio(claim);
  const { matches: vectorMatches, isLoading: isLoadingPrecedents } = usePrecedents(claim);

  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "split">("split");
  const [showNotesDrawer, setShowNotesDrawer] = useState<boolean>(false);
  const [showSenderDetails, setShowSenderDetails] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  const handleRunSynthesis = async () => {
    setSynthesisError(null);
    try {
      await synthesizeAppeal(appealLevel, physicianNotes, {
        name: senderName,
        credentials: senderCredentials,
        email: senderEmail,
        phone: senderPhone,
      });
    } catch (err: any) {
      setSynthesisError(
        err?.message || "Failed to synthesize appeal brief. Please try again."
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
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0 shadow-xs">
              <FileText className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
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

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar sm:flex-nowrap shrink-0">
            {/* Appeal Level Selector */}
            <div className="shrink-0">
              <Select
                value={appealLevel}
                onChange={(e) => setAppealLevel(e.target.value as AppealLevel)}
                className="h-8 text-xs font-sans rounded-md w-[190px] sm:w-[210px] bg-background border border-border"
              >
                <option value="level_1_internal">Level 1: Internal Appeal (ERISA)</option>
                <option value="level_2_grievance">Level 2: Formal Grievance</option>
                <option value="level_3_external_state_review">Level 3: External Review</option>
              </Select>
            </div>

            {/* Treating Physician Notes Toggle */}
            <Button
              variant={showNotesDrawer || physicianNotes ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowNotesDrawer(!showNotesDrawer)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
            >
              <Stethoscope className="size-3.5" />
              <span>Physician Notes{physicianNotes ? " (Added)" : ""}</span>
            </Button>

            {/* Submitter / Sender Details Toggle */}
            <Button
              variant={showSenderDetails || senderName ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowSenderDetails(!showSenderDetails)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
            >
              <IdentificationCard className="size-3.5" />
              <span>Sender Details{senderName ? " (Added)" : ""}</span>
            </Button>

            {/* Export & Preview Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="h-8 rounded-md px-3 text-xs gap-1.5 shrink-0"
            >
              <Printer className="size-3.5" />
              <span>Preview Email</span>
            </Button>

            {/* Synthesize Appeal Brief */}
            <Button
              size="sm"
              onClick={handleRunSynthesis}
              disabled={isSynthesizing || isSaving}
              className="h-8 rounded-md px-3.5 text-xs gap-1.5 shrink-0 bg-primary text-primary-foreground font-semibold shadow-xs"
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
              rows={7}
              value={physicianNotes}
              onChange={(e) => setPhysicianNotes(e.target.value)}
              placeholder="Paste physician clinical notes, e.g.: Patient completed 14 weeks of formal physical therapy with Dr. Miller and underwent right knee cortisone injection on 03/10/2026 with no functional relief..."
              className="bg-background text-xs font-mono leading-relaxed"
            />
          </div>
        )}

        {showSenderDetails && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-xs text-foreground">
              <span className="flex items-center gap-1.5 font-semibold">
                <IdentificationCard className="size-3.5 text-muted-foreground" />
                Person submitting the appeal
              </span>
              <button
                onClick={() => setShowSenderDetails(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Hide
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Enter the person who will actually submit the appeal. These details are used only when provided and are not inferred from the treating provider record.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Name"
                aria-label="Sender name"
              />
              <Input
                value={senderCredentials}
                onChange={(e) => setSenderCredentials(e.target.value)}
                placeholder="Credentials or role (optional)"
                aria-label="Sender credentials or role"
              />
              <div className="relative">
                <EnvelopeSimple className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="Email address (optional)"
                  aria-label="Sender email address"
                  className="pl-8"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                <Input
                  type="tel"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="Phone number (optional)"
                  aria-label="Sender phone number"
                  className="pl-8"
                />
              </div>
            </div>
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
                          <span>Synthesizing Appeal Brief...</span>
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
            vectorMatches={vectorMatches}
            isLoadingPrecedents={isLoadingPrecedents}
            onInsertSnippet={insertTextAtCursor}
          />
        </Card>
      </div>

      {/* Sticky Bottom Next-Step Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur-md p-3 px-4 sm:px-8 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs hidden sm:inline-flex">
            Step 2 of 3: Appeal Brief
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
            <span>Next: Dispatch Appeal Packet</span>
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
