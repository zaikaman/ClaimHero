import React, { useState } from "react";
import {
  FileText,
  CircleNotch,
  Check,

  Eye,
  PencilSimpleLine,
  PhoneCall,
  Printer,
  ArrowRight,
  Scales,
  TrendUp,
  ShieldWarning,
  ClockCounterClockwise,
  Gavel,
  ShieldCheck,
  X,
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

interface AppealStudioProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  onNavigateToDispatch?: () => void;
  onNavigateToEvidence?: () => void;
  onNavigateView?: (view: FlowView) => void;
  onRunAutonomousPipeline?: (claimId?: string) => Promise<any>;
}

const TIER_METADATA_CONFIG = {
  level_1_internal: {
    levelNumber: 1,
    title: "Level 1: Internal Administrative Appeal",
    shortTitle: "Level 1 Internal",
    targetAuthority: "Payer Medical Director Review",
    postureLabel: "Administrative Reconsideration",
    legalAggressiveness: "Standard",
    colorClass: "border-sky-500/40 text-sky-400 bg-sky-500/10",
    badgeVariant: "default" as const,
    keyStatute: "ERISA 29 C.F.R. § 2560.503-1",
    description: "Initial formal challenge presenting clinical CPB contradictions, treating physician addendum, and standard ERISA disclosure demands.",
    nextTier: "level_2_grievance" as AppealLevel,
    nextTierLabel: "Level 2 Formal Grievance",
  },
  level_2_grievance: {
    levelNumber: 2,
    title: "Level 2: Formal Grievance & Peer Review Panel",
    shortTitle: "Level 2 Grievance",
    targetAuthority: "Multi-Disciplinary Peer Review Panel",
    postureLabel: "Elevated Adversarial Posture",
    legalAggressiveness: "Elevated Grievance",
    colorClass: "border-amber-500/40 text-amber-400 bg-amber-500/10",
    badgeVariant: "warning" as const,
    keyStatute: "ERISA § 503 & 29 C.F.R. § 2560.503-1(h)(3)(iii)",
    description: "Elevated statutory challenge demanding independent same-specialty board-certified peer review, reviewer credentials disclosure, and bad-faith warnings.",
    nextTier: "level_3_external_state_review" as AppealLevel,
    nextTierLabel: "Level 3 External Review (IRO & DOI)",
  },
  level_3_external_state_review: {
    levelNumber: 3,
    title: "Level 3: External IRO & State Commissioner Petition",
    shortTitle: "Level 3 External IRO",
    targetAuthority: "External IRO & State Insurance Commissioner",
    postureLabel: "Maximum Statutory Enforcement",
    legalAggressiveness: "Maximum Statutory Enforcement",
    colorClass: "border-rose-500/40 text-rose-400 bg-rose-500/10",
    badgeVariant: "destructive" as const,
    keyStatute: "ERISA § 502(a)(1)(B) & 45 C.F.R. § 147.136",
    description: "Maximum legal enforcement petitioning independent external review and State DOI complaint with statutory bad-faith penalties and fee-shifting.",
    nextTier: null,
    nextTierLabel: null,
  },
};

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
    appealVersions,
    selectedAppealId,
    selectVersion,
    markdownContent,
    setMarkdownContent,
    appealLevel,
    setAppealLevel,
    physicianNotes,
    senderName,
    senderCredentials,
    senderEmail,
    senderPhone,
    isSynthesizing,
    isEscalating,
    isSaving,
    saveStatus,
    synthesizeAppeal,
    escalateTier,
  } = useAppealStudio(claim);
  const { matches: vectorMatches, isLoading: isLoadingPrecedents } = usePrecedents(claim);

  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "split">("split");
  const [showVersionHistory, setShowVersionHistory] = useState<boolean>(false);
  const [showEscalationModal, setShowEscalationModal] = useState<boolean>(false);
  const [escalationReason, setEscalationReason] = useState<string>("");
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [injectedPenaltiesSuccess, setInjectedPenaltiesSuccess] = useState<boolean>(false);

  const currentTierConfig = TIER_METADATA_CONFIG[appealLevel] || TIER_METADATA_CONFIG.level_1_internal;

  const handleInjectErisaPenalties = () => {
    const penaltyClause = `

## Statutory remedies & ERISA § 502(c) civil penalties demand
1. **Immediate Retroactive Coverage**: Claimant demands immediate and retroactive overturn of the adverse benefit determination for CPT codes (${claim.cptCodes?.join(", ") || "disputed clinical services"}), with prompt reimbursement issued at contractual in-network rates.
2. **Statutory Non-Disclosure Penalties (29 U.S.C. § 1132(c)(1)(B))**: The Plan Administrator failed to disclose the internal clinical criteria, review protocols, and claim files within 30 days of written demand. Pursuant to 29 C.F.R. § 2560.503-1 and 29 C.F.R. § 2575.502c-1, claimant demands accrued statutory civil penalties at $110.00 per calendar day until full disclosure is rendered.
3. **Fee-Shifting Notice (29 U.S.C. § 1132(g)(1))**: Notice is hereby given that claimant will petition the United States District Court for full mandatory and discretionary recovery of reasonable attorney's fees, clinical expert expenses, and taxable litigation costs upon judicial enforcement.`;

    if (/civil penalties demand|erisa § 502\(c\)/i.test(markdownContent)) {
      setInjectedPenaltiesSuccess(true);
      setTimeout(() => setInjectedPenaltiesSuccess(false), 2500);
      return;
    }

    const closingPattern = /\n(?=(?:Sincerely|Respectfully|Regards|Submitted by|Authorized Representative:))/i;
    const matchIndex = markdownContent.search(closingPattern);

    if (matchIndex !== -1) {
      const before = markdownContent.slice(0, matchIndex).trimEnd();
      const after = markdownContent.slice(matchIndex).trimStart();
      setMarkdownContent(`${before}\n\n${penaltyClause.trim()}\n\n${after}`);
    } else {
      setMarkdownContent(`${markdownContent.trim()}\n\n${penaltyClause.trim()}`);
    }

    setInjectedPenaltiesSuccess(true);
    setTimeout(() => setInjectedPenaltiesSuccess(false), 2500);
  };

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

  const handleConfirmEscalation = async () => {
    if (!currentTierConfig.nextTier) return;
    setSynthesisError(null);
    try {
      await escalateTier(currentTierConfig.nextTier, escalationReason);
      setShowEscalationModal(false);
      setEscalationReason("");
    } catch (err: any) {
      setSynthesisError(
        err?.message || "Failed to escalate appeal tier. Please try again."
      );
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-20 flex flex-col">
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
        isProcessing={isSynthesizing || isEscalating}
        processingLabel={isEscalating ? "Escalating Legal Posture..." : "Synthesizing Appeal Brief..."}
        onRunAutonomousPipeline={
          onRunAutonomousPipeline ? () => onRunAutonomousPipeline(claim._id) : undefined
        }
      />

      {/* Multi-Tier Statutory Escalation Stepper Bar */}
      <Card className="p-2.5 sm:p-3 shrink-0 overflow-visible bg-gradient-to-r from-card/90 via-card to-card/90 border-border/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* 3 Statutory Legal Tiers */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap flex-1">
            {(["level_1_internal", "level_2_grievance", "level_3_external_state_review"] as AppealLevel[]).map((tierKey) => {
              const tier = TIER_METADATA_CONFIG[tierKey];
              const isActive = appealLevel === tierKey;
              const hasRevisionForTier = appealVersions.some((v) => v.appealLevel === tierKey);

              return (
                <button
                  key={tierKey}
                  onClick={() => setAppealLevel(tierKey)}
                  className={`flex-1 min-w-[130px] p-2 rounded-lg border text-left transition-all relative ${
                    isActive
                      ? `${tier.colorClass} shadow-xs font-semibold ring-1 ring-primary/30`
                      : "border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-mono tracking-wider uppercase opacity-80">
                      Tier {tier.levelNumber}
                    </span>
                    {hasRevisionForTier && (
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4">
                        Saved
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs font-medium text-foreground truncate">
                    {tier.shortTitle}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {tier.postureLabel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Actions & Escalation Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Version History Toggle */}
            <Button
              variant={showVersionHistory ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowVersionHistory(!showVersionHistory)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
              title="Browse historical appeal revisions across tiers"
            >
              <ClockCounterClockwise className="size-3.5 text-muted-foreground" />
              <span>Revisions ({appealVersions.length})</span>
            </Button>

            {/* 1-Click Escalate Tier Button */}
            {currentTierConfig.nextTier ? (
              <Button
                size="sm"
                onClick={() => setShowEscalationModal(true)}
                disabled={isEscalating || isSynthesizing}
                className="h-8 rounded-md px-3 text-xs gap-1.5 shrink-0 bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-xs"
                title={`Escalate dispute to ${currentTierConfig.nextTierLabel}`}
              >
                <TrendUp className="size-3.5" />
                <span>Escalate to Tier {TIER_METADATA_CONFIG[currentTierConfig.nextTier].levelNumber}</span>
              </Button>
            ) : (
              <Badge variant="destructive" className="h-8 px-2.5 text-xs gap-1.5 font-sans font-medium">
                <Scales className="size-3.5" />
                <span>Tier 3 Maximum Enforcement</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Active Statutory Posture Pill Ribbon */}
        <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2 flex-wrap text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <Gavel className="size-3 text-primary" />
              Target Authority:
            </span>
            <span className="text-foreground">{currentTierConfig.targetAuthority}</span>
            <span className="text-border">•</span>
            <span className="font-mono text-primary">{currentTierConfig.keyStatute}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span>Aggressiveness:</span>
            <span className={`font-semibold ${
              appealLevel === "level_3_external_state_review"
                ? "text-rose-400"
                : appealLevel === "level_2_grievance"
                ? "text-amber-400"
                : "text-sky-400"
            }`}>
              {currentTierConfig.legalAggressiveness}
            </span>
          </div>
        </div>
      </Card>

      {/* Revision History Drawer Panel */}
      {showVersionHistory && (
        <Card className="p-3 bg-muted/30 border-border/80 animate-fadeIn space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ClockCounterClockwise className="size-3.5 text-muted-foreground" />
              Convex Stored Appeal Revisions ({appealVersions.length})
            </span>
            <button
              onClick={() => setShowVersionHistory(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </div>
          {appealVersions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No saved revisions yet. Synthesize an appeal brief to store the initial revision in Convex.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {appealVersions.map((ver) => {
                const tier = TIER_METADATA_CONFIG[ver.appealLevel as AppealLevel] || TIER_METADATA_CONFIG.level_1_internal;
                const isCurrentSelected = (selectedAppealId === ver._id) || (!selectedAppealId && appeal?._id === ver._id);

                return (
                  <button
                    key={ver._id}
                    onClick={() => selectVersion(ver._id)}
                    className={`p-2.5 rounded-md border text-left transition-all ${
                      isCurrentSelected
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-xs"
                        : "border-border bg-card/60 hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        Revision v{ver.version}
                      </span>
                      <Badge variant="outline" className={`text-[9px] font-mono px-1 py-0 ${tier.colorClass}`}>
                        Tier {tier.levelNumber}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-foreground font-medium truncate">
                      {tier.shortTitle}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-between mt-1">
                      <span>{new Date(ver.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{ver.fullAppealMarkdown?.length || 0} chars</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Studio Header Toolbar */}
      <Card className="p-3.5 shrink-0 overflow-visible">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0 shadow-xs">
              <FileText className="size-4.5" />
            </div>
            <div className="min-w-0">
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
              <p className="text-xs text-muted-foreground truncate">
                Patient: <span className="text-foreground font-medium">{claim.patient?.name}</span> • Payer:{" "}
                <span className="text-foreground font-medium">{claim.patient?.insurancePayer}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap 2xl:flex-nowrap shrink-0">
            {/* P2P Defense Tele-Script Navigation */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateView?.("p2p" as any)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              title="Open 3-Minute Physician Peer-to-Peer Defense Tele-Script & Pocket Cheat Sheet"
            >
              <PhoneCall className="size-3.5" />
              <span>Doctor P2P Script</span>
            </Button>

            {/* ERISA Penalties & Financial Liability Navigation */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateView?.("calculator" as any)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              title="Open ERISA 29 U.S.C. § 1132(c) Statutory Penalty Calculator and Out-of-Pocket Liability Audit"
            >
              <Scales className="size-3.5" />
              <span>ERISA Penalties</span>
            </Button>

            {/* Export & Preview Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="h-8 rounded-md px-3 text-xs gap-1.5 shrink-0"
              title="Preview printable appeal brief"
            >
              <Printer className="size-3.5" />
              <span>Preview Email</span>
            </Button>

            {/* Synthesize Appeal Brief */}
            <Button
              size="sm"
              onClick={handleRunSynthesis}
              disabled={isSynthesizing || isSaving || isEscalating}
              className="h-8 rounded-md px-3.5 text-xs gap-1.5 shrink-0 bg-primary text-primary-foreground font-semibold shadow-xs"
              title="Synthesize cited appeal brief with AI"
            >
              {isSynthesizing || isEscalating ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <FileText className="size-3.5" />
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
      </Card>

      {/* Main Studio Dual Pane Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left 8 Cols: Markdown Editor & Live Preview (Fixed height matched with right panel) */}
        <Card className="lg:col-span-8 h-[640px] xl:h-[700px] flex flex-col border border-border bg-card/70 shadow-xs p-0 overflow-hidden">
          {/* Sub-view Viewport Switcher */}
          <div className="h-10 shrink-0 flex items-center justify-between border-b border-border px-4 py-2 bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Button
                variant={activeTab === "edit" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActiveTab("edit")}
                className="gap-1 font-medium h-7 text-xs"
              >
                <PencilSimpleLine className="size-3" />
                <span>Editor</span>
              </Button>
              <Button
                variant={activeTab === "split" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActiveTab("split")}
                className="hidden md:inline-flex font-medium h-7 text-xs"
              >
                <span>Split View</span>
              </Button>
              <Button
                variant={activeTab === "preview" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActiveTab("preview")}
                className="gap-1 font-medium h-7 text-xs"
              >
                <Eye className="size-3" />
                <span>Preview</span>
              </Button>
              <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
              <Button
                variant="ghost"
                size="xs"
                onClick={handleInjectErisaPenalties}
                className="gap-1 text-xs text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 h-7"
                title="Inject accrued ERISA 29 U.S.C. § 1132(c) statutory non-disclosure penalties into Section IV"
              >
                {injectedPenaltiesSuccess ? (
                  <>
                    <Check className="size-3 text-emerald-400" />
                    <span className="text-emerald-400 font-mono">Penalties Embedded</span>
                  </>
                ) : (
                  <>
                    <Scales className="size-3" />
                    <span>Embed $110/d Penalties</span>
                  </>
                )}
              </Button>
            </div>

            <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
              <span>{markdownContent.length} chars</span>
              <span>•</span>
              <span>{markdownContent.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          {/* Quick Outline Section Jump Bar */}
          {markdownContent.trim().length > 0 && (
            <div className="h-8 shrink-0 flex items-center gap-1.5 overflow-x-auto px-4 py-1 bg-muted/20 border-b border-border/60 scrollbar-none text-[11px] font-mono">
              <span className="text-muted-foreground uppercase text-[9px] font-semibold tracking-wider shrink-0 mr-1">
                Jump To:
              </span>
              {[
                { label: "Header", pattern: /appeal of adverse|claim reference|^# /i, id: "jump-trans" },
                { label: "Case Details", pattern: /claim details|patient\/member|date of service/i, id: "jump-meta" },
                { label: "Clinical Basis", pattern: /clinical basis|additional clinical|medical necessity|treating provider/i, id: "jump-facts" },
                { label: "Supporting Evidence", pattern: /supporting documentation|review references|policy materials|evidence/i, id: "jump-cpb" },
                { label: "Review & ERISA", pattern: /review requested|if erisa applies|statutory remedies|statutory rights/i, id: "jump-remedies" },
                { label: "Signature", pattern: /sincerely|submitted by|treating provider:|authorized representative|attending physician/i, id: "jump-attest" },
              ].map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => {
                    const editorEl = document.querySelector(".studio-editor-textarea") as HTMLTextAreaElement | null;
                    const previewEl = document.querySelector(".studio-preview-pane") as HTMLDivElement | null;
                    
                    if (editorEl) {
                      if (sec.id === "jump-trans") {
                        editorEl.scrollTo({ top: 0, behavior: "smooth" });
                        editorEl.focus();
                        editorEl.setSelectionRange(0, 0);
                      } else {
                        const match = editorEl.value.search(sec.pattern);
                        if (match !== -1) {
                          editorEl.focus();
                          editorEl.setSelectionRange(match, match + 20);
                          const charRatio = match / Math.max(1, editorEl.value.length);
                          const maxScroll = Math.max(0, editorEl.scrollHeight - editorEl.clientHeight);
                          editorEl.scrollTo({ top: charRatio * maxScroll, behavior: "smooth" });
                        }
                      }
                    }
                    if (previewEl) {
                      if (sec.id === "jump-trans") {
                        previewEl.scrollTo({ top: 0, behavior: "smooth" });
                      } else {
                        // Query specific leaf/heading elements to avoid container div matching
                        const specificElements = Array.from(
                          previewEl.querySelectorAll("h1, h2, h3, h4, h5, strong, p, blockquote, li")
                        );
                        
                        let targetEl: Element | null = null;
                        for (const el of specificElements) {
                          const text = el.textContent?.trim() || "";
                          if (sec.pattern.test(text)) {
                            targetEl = el;
                            break;
                          }
                        }

                        if (targetEl) {
                          const previewRect = previewEl.getBoundingClientRect();
                          const elRect = targetEl.getBoundingClientRect();
                          const targetScroll = previewEl.scrollTop + (elRect.top - previewRect.top) - 16;
                          previewEl.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
                        }
                      }
                    }
                  }}
                  className="px-2 py-0.5 rounded border border-border/60 bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 cursor-pointer transition-all text-[10px]"
                >
                  {sec.label}
                </button>
              ))}
            </div>
          )}

          {/* Editor & Preview Panes with Internal Scrolling */}
          <div
            className={`flex-1 overflow-hidden grid grid-cols-1 ${
              activeTab === "split"
                ? "xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border"
                : ""
            }`}
          >
            {/* Panel 1: Editor Pane */}
            {(activeTab === "edit" || activeTab === "split") && (
              <div className="h-full overflow-hidden flex flex-col p-4 sm:p-5">
                <textarea
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  placeholder="The appeal brief will appear here once synthesized, or write manually..."
                  className="studio-editor-textarea w-full h-full bg-transparent text-foreground text-xs font-mono resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground overflow-y-auto"
                />
              </div>
            )}

            {/* Panel 2: Rendered Markdown Preview Pane */}
            {(activeTab === "preview" || activeTab === "split") && (
              <div className="studio-preview-pane h-full overflow-y-auto p-4 sm:p-6 bg-background/40">
                {markdownContent ? (
                  <div className="w-full rounded-xl border border-border/80 bg-card/70 p-5 sm:p-7 shadow-xs">
                    <AppealBriefRenderer content={markdownContent} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3 text-muted-foreground my-auto">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <FileText className="size-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <div className="text-sm font-semibold text-foreground">
                        Ready to Synthesize {currentTierConfig.shortTitle} Brief
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Generate a formal cited appeal brief referencing {evidences.length} clinical policy clauses and {currentTierConfig.keyStatute} federal requirements.
                      </p>
                    </div>

                    <Button
                      onClick={handleRunSynthesis}
                      disabled={isSynthesizing || isEscalating}
                      className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md mt-2"
                    >
                      {isSynthesizing || isEscalating ? (
                        <>
                          <CircleNotch className="size-3.5 animate-spin" />
                          <span>Synthesizing Appeal Brief...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="size-3.5" />
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

        {/* Panel 3: Right 4 Cols Citation Sidebar (Fixed height matched with left card) */}
        <Card className="lg:col-span-4 h-[640px] xl:h-[700px] flex flex-col border border-border bg-card/70 shadow-xs p-0 overflow-hidden">
          <div className="h-full overflow-y-auto p-4">
            <CitationSidebar
              evidences={evidences}
              vectorMatches={vectorMatches}
              isLoadingPrecedents={isLoadingPrecedents}
              appealLevel={appealLevel}
            />
          </div>
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
              ? `${markdownContent.split(/\s+/).filter(Boolean).length} words • ${currentTierConfig.keyStatute} Cited`
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

      {/* Statutory Escalation Confirmation Modal */}
      {showEscalationModal && currentTierConfig.nextTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn">
          <Card className="w-full max-w-lg p-5 space-y-4 shadow-xl border-border bg-card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <ShieldWarning className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Escalate Statutory Appeal Tier
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Elevate dispute to Tier {TIER_METADATA_CONFIG[currentTierConfig.nextTier].levelNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEscalationModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Current Tier:</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {currentTierConfig.shortTitle}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-foreground">Escalating To:</span>
                  <Badge className={`font-mono text-[10px] ${TIER_METADATA_CONFIG[currentTierConfig.nextTier].colorClass}`}>
                    {TIER_METADATA_CONFIG[currentTierConfig.nextTier].title}
                  </Badge>
                </div>
                <div className="pt-2 border-t border-border/60 text-[11px] text-muted-foreground leading-relaxed">
                  {TIER_METADATA_CONFIG[currentTierConfig.nextTier].description}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Statutory Escalation Grounds & Reason (Optional)
                </label>
                <Textarea
                  rows={3}
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  placeholder="e.g.: Insurer upheld initial adverse determination without physician consultation. Escalating to formal grievance demanding same-specialty board-certified review..."
                  className="bg-background text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEscalationModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmEscalation}
                disabled={isEscalating}
                className="text-xs gap-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-xs"
              >
                {isEscalating ? (
                  <>
                    <CircleNotch className="size-3.5 animate-spin" />
                    <span>Escalating & Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <TrendUp className="size-3.5" />
                    <span>Confirm Statutory Escalation</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

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
