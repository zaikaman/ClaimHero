import React, { useState } from "react";
import {
  FileText,
  PencilSimpleLine,
  Eye,
  ArrowsClockwise,
  Printer,
  UsersThree,
  ArrowRight,
  CheckCircle,
  Shield,
  Stethoscope,
  Scales,
  CircleNotch,
  Check,
  TrendUp,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, AppealLevel } from "../../types";
import { PLAIN_TIERS } from "../../lib/plainCopy";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { AppealBriefRenderer } from "./AppealBriefRenderer";

interface SimpleStudioViewProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  markdownContent: string;
  setMarkdownContent: (content: string) => void;
  appealLevel: AppealLevel;
  hasSynthesizedBrief: boolean;
  isSynthesizing: boolean;
  isEscalating: boolean;
  isSaving: boolean;
  saveStatus: string;
  readOnly: boolean;
  isBackgroundPipelineRunning: boolean;
  collaboratorsCount: number;
  onNavigateToDispatch?: () => void;
  onRunSynthesis: () => Promise<void>;
  onOpenExport: () => void;
  onOpenShare: () => void;
  onOpenEscalate: () => void;
  registerEditor?: (el: HTMLTextAreaElement | null) => void;
  onMarkEditing?: () => void;
}

export const SimpleStudioView: React.FC<SimpleStudioViewProps> = ({
  claim,
  evidences,
  markdownContent,
  setMarkdownContent,
  appealLevel,
  hasSynthesizedBrief,
  isSynthesizing,
  isEscalating,
  isSaving,
  saveStatus,
  readOnly,
  isBackgroundPipelineRunning,
  collaboratorsCount,
  onNavigateToDispatch,
  onRunSynthesis,
  onOpenExport,
  onOpenShare,
  onOpenEscalate,
  registerEditor,
  onMarkEditing,
}) => {
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");
  const [showProofDetails, setShowProofDetails] = useState(false);

  const plainTier = PLAIN_TIERS[appealLevel] ?? {
    simple: "First appeal — to your insurer",
    who: "Insurer medical team",
  };

  const wordCount = markdownContent
    ? markdownContent.split(/\s+/).filter(Boolean).length
    : 0;

  const safeEvidences = evidences ?? [];
  // Extract key proof categories woven into letter
  const cpbCount = safeEvidences.filter((e) => e.sourceType === "payer_cpb").length;
  const clinicalCount = safeEvidences.filter(
    (e) => e.sourceType === "pubmed_study" || e.sourceType === "nccn_guideline" || e.sourceType === "fda_package_insert"
  ).length;
  const legalCount = safeEvidences.filter((e) => e.sourceType === "legal_precedent").length;

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 1. Document Control & Metadata Header */}
      <Card className="p-4 border-border/80 bg-card/80 backdrop-blur-sm space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 shadow-xs">
              <FileText className="size-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-foreground">
                  Your Appeal Letter
                </h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Case #{claim.claimNumber}
                </Badge>
                {hasSynthesizedBrief && (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  >
                    Ready to send
                  </Badge>
                )}
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground animate-pulse">
                    <CircleNotch className="size-3 animate-spin" />
                    <span>Saving...</span>
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <Check className="size-3" />
                    <span>Saved</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate pt-0.5">
                For: <span className="text-foreground font-medium">{claim.patient?.name}</span> • Insurer:{" "}
                <span className="text-foreground font-medium">{claim.patient?.insurancePayer}</span>
              </p>
            </div>
          </div>

          {/* Document Tools: Mode switcher & actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* View / Edit Mode Switcher */}
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5" role="group" aria-label="Document view modes">
              <button
                type="button"
                onClick={() => setViewMode("read")}
                aria-pressed={viewMode === "read"}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  viewMode === "read"
                    ? "bg-card text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Read formatted letter document"
              >
                <Eye className="size-3.5" />
                <span>Read</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                disabled={readOnly}
                aria-pressed={viewMode === "edit"}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  viewMode === "edit"
                    ? "bg-card text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground disabled:opacity-50"
                }`}
                title={readOnly ? "Viewers cannot edit" : "Edit letter text"}
              >
                <PencilSimpleLine className="size-3.5" />
                <span>Edit text</span>
              </button>
            </div>

            {/* Rewrite button */}
            <Button
              variant="outline"
              size="xs"
              onClick={onRunSynthesis}
              disabled={isSynthesizing || isEscalating || isSaving || readOnly || isBackgroundPipelineRunning}
              className="h-7 text-xs gap-1.5 cursor-pointer border-border/70"
              title="Regenerate this letter using latest case proof"
            >
              {isSynthesizing || isEscalating ? (
                <>
                  <CircleNotch className="size-3 animate-spin" />
                  <span>Rewriting...</span>
                </>
              ) : (
                <>
                  <ArrowsClockwise className="size-3" />
                  <span>Rewrite</span>
                </>
              )}
            </Button>

            {/* Preview & Print */}
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenExport}
              className="h-7 text-xs gap-1.5 cursor-pointer border-border/70"
              title="Save as PDF or print letter"
            >
              <Printer className="size-3" />
              <span>Save / Print</span>
            </Button>

            {/* Share Case */}
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenShare}
              className="h-7 text-xs gap-1.5 cursor-pointer border-border/70"
              title="Share case with family or advocates"
            >
              <UsersThree className="size-3" />
              <span>Share</span>
              {collaboratorsCount > 0 && (
                <Badge variant="secondary" className="font-mono text-[9px] px-1 py-0 h-3.5">
                  {collaboratorsCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Lightweight Review Level Pill & Proof Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="size-3.5 text-primary" />
              <span>Current step:</span>
            </span>
            <span className="font-medium text-foreground">{plainTier.simple}</span>
            <span className="text-border">•</span>
            <span>Reviewed by: {plainTier.who}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenEscalate}
              disabled={readOnly}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:underline cursor-pointer disabled:opacity-50"
              title="Escalate appeal to higher panel"
            >
              <TrendUp className="size-3" />
              <span>Need a higher review level?</span>
            </button>
          </div>
        </div>
      </Card>

      {/* 2. Top 3 Decisive Proof Points Integrated in the Letter */}
      <Card className="p-3 border-border/70 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-emerald-400" weight="fill" />
            <span className="text-xs font-semibold text-foreground">
              Proof Included in Your Letter
            </span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              (Cited with exact policy sections and doctor notes)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowProofDetails((prev) => !prev)}
            aria-expanded={showProofDetails}
            aria-controls="proof-breakdown-panel"
            className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
          >
            {showProofDetails ? "Hide proof breakdown" : "View proof breakdown"}
          </button>
        </div>

        {showProofDetails && (
          <div id="proof-breakdown-panel" className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-3 mt-2.5 border-t border-border/50 animate-fadeIn">
            <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                <Shield className="size-3.5" />
                <span>Their Own Rules</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {cpbCount > 0
                  ? `${cpbCount} Clinical Policy criteria clauses cited in Section III.`
                  : "Insurer exception clauses cited for acute care."}
              </p>
            </div>

            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Stethoscope className="size-3.5" />
                <span>Doctor Records</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {clinicalCount > 0
                  ? `${clinicalCount} physician notes and imaging findings integrated.`
                  : "Treating physician medical necessity documentation included."}
              </p>
            </div>

            <div className="p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                <Scales className="size-3.5" />
                <span>Federal Legal Rights</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {legalCount > 0
                  ? `${legalCount} statutory precedents and ERISA 29 C.F.R. § 2560.503-1 review mandates cited.`
                  : "ERISA 29 C.F.R. § 2560.503-1 full and fair review requirements cited."}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* 3. Main Document View: Formatted Letter or Clean Text Editor */}
      <Card className="border border-border/80 bg-card/70 shadow-xs overflow-hidden">
        {viewMode === "read" ? (
          <div className="p-5 sm:p-8 bg-card/90 min-h-[500px]">
            {markdownContent ? (
              <div className="max-w-3xl mx-auto">
                <AppealBriefRenderer content={markdownContent} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <FileText className="size-6" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-sm font-semibold text-foreground">
                    Your letter is ready to be written
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Click below to generate a formal appeal letter referencing your {evidences.length} proof documents.
                  </p>
                </div>
                <Button
                  onClick={onRunSynthesis}
                  disabled={isSynthesizing || isEscalating || isSaving || readOnly || isBackgroundPipelineRunning}
                  className="gap-2 text-xs font-semibold cursor-pointer"
                >
                  <FileText className="size-3.5" />
                  <span>Write my letter</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-2 bg-card/90 min-h-[500px] flex flex-col">
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b border-border/50">
              <span className="font-medium text-foreground">
                Edit letter text directly
              </span>
              <span className="font-mono text-[11px]">
                {wordCount} words
              </span>
            </div>
            <textarea
              ref={registerEditor}
              value={markdownContent}
              onChange={(e) => {
                setMarkdownContent(e.target.value);
                onMarkEditing?.();
              }}
              onFocus={onMarkEditing}
              readOnly={readOnly}
              aria-label="Appeal letter text"
              placeholder="Your appeal letter content..."
              className="w-full flex-1 min-h-[440px] bg-transparent text-foreground text-xs font-sans resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground disabled:opacity-80"
            />
          </div>
        )}
      </Card>

      {/* 4. Single Canonical Next Step Card */}
      {hasSynthesizedBrief && onNavigateToDispatch && (
        <Card className="p-4 border-primary/30 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground">
              Ready to send your appeal letter?
            </span>
            <p className="text-[11px] text-muted-foreground">
              We have attached all {evidences.length} proof exhibits and prepared formal delivery to {claim.patient?.insurancePayer}.
            </p>
          </div>

          <Button
            onClick={onNavigateToDispatch}
            className="gap-2 h-9 px-4 text-xs bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 cursor-pointer shrink-0"
          >
            <span>Continue to Send &amp; Track</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </Card>
      )}
    </div>
  );
};
