import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  CaretLeft,
  CaretRight,
  Copy,
  Check,
  ArrowSquareOut,
  Camera,
  BookOpen,
  Flask,
  ShieldCheck,
  Scales,
  FileText,
  Trash,
  Eye,
  Shield,
  Stethoscope,
} from "@phosphor-icons/react";
import { ClinicalEvidence, EvidenceSourceType } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { stripMarkdownFormatting } from "../../lib/utils";
import { safeExternalHref } from "../../lib/urlUtils";

export interface ClauseInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: ClinicalEvidence | null;
  allEvidences: ClinicalEvidence[];
  onSelectEvidence: (evidence: ClinicalEvidence) => void;
  onInspectScreenshot?: (screenshot: { url: string; title: string; date?: string }) => void;
  onDeleteEvidence?: (evidenceId: string) => Promise<unknown>;
}

const SOURCE_TYPE_LABELS: Record<
  EvidenceSourceType,
  { label: string; badgeVariant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }
> = {
  payer_cpb: {
    label: "Insurer Policy Bulletin",
    badgeVariant: "default",
    icon: BookOpen,
  },
  pubmed_study: {
    label: "PubMed Clinical Trial",
    badgeVariant: "secondary",
    icon: Flask,
  },
  fda_package_insert: {
    label: "FDA Label / Indication",
    badgeVariant: "outline",
    icon: ShieldCheck,
  },
  nccn_guideline: {
    label: "Clinical Guideline",
    badgeVariant: "secondary",
    icon: Stethoscope,
  },
  legal_precedent: {
    label: "Statutory Law / Precedent",
    badgeVariant: "outline",
    icon: Scales,
  },
};

export const ClauseInspectorDrawer: React.FC<ClauseInspectorDrawerProps> = ({
  isOpen,
  onClose,
  evidence,
  allEvidences,
  onSelectEvidence,
  onInspectScreenshot,
  onDeleteEvidence,
}) => {
  const [copiedClause, setCopiedClause] = useState(false);
  const [copiedRule, setCopiedRule] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const copyClauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyRuleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyClauseTimerRef.current) clearTimeout(copyClauseTimerRef.current);
      if (copyRuleTimerRef.current) clearTimeout(copyRuleTimerRef.current);
    };
  }, []);

  // Auto-focus drawer container on open for keyboard accessibility
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  // Body scroll lock (runs strictly when isOpen changes, avoiding thrashing on sequential steps)
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const currentIndex = evidence
    ? allEvidences.findIndex((item) => item._id === evidence._id)
    : -1;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allEvidences.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) {
      onSelectEvidence(allEvidences[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onSelectEvidence(allEvidences[currentIndex + 1]);
    }
  };

  // Keyboard navigation: Escape to close, ArrowLeft / ArrowRight to navigate clauses
  // ArrowUp and ArrowDown are deliberately preserved for vertical scrolling of long clause texts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (hasPrevious) {
          onSelectEvidence(allEvidences[currentIndex - 1]);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (hasNext) {
          onSelectEvidence(allEvidences[currentIndex + 1]);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [isOpen, hasPrevious, hasNext, currentIndex, allEvidences, onSelectEvidence]);

  if (!isOpen || !evidence || typeof document === "undefined") {
    return null;
  }

  const config = SOURCE_TYPE_LABELS[evidence.sourceType] || SOURCE_TYPE_LABELS.payer_cpb;
  const SourceIcon = config.icon;

  const handleCopyCitation = () => {
    const citation = `${evidence.title} (${evidence.citationClause})`;
    navigator.clipboard.writeText(citation);
    setCopiedClause(true);
    if (copyClauseTimerRef.current) clearTimeout(copyClauseTimerRef.current);
    copyClauseTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopiedClause(false);
    }, 2000);
  };

  const handleCopyRule = () => {
    navigator.clipboard.writeText(stripMarkdownFormatting(evidence.extractedEvidenceMarkdown));
    setCopiedRule(true);
    if (copyRuleTimerRef.current) clearTimeout(copyRuleTimerRef.current);
    copyRuleTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopiedRule(false);
    }, 2000);
  };

  const handleDelete = async () => {
    if (!onDeleteEvidence) return;
    setIsDeleting(true);
    try {
      await onDeleteEvidence(evidence._id);
      if (hasNext) {
        handleNext();
      } else if (hasPrevious) {
        handlePrevious();
      } else {
        onClose();
      }
    } finally {
      if (isMountedRef.current) {
        setIsDeleting(false);
      }
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence Inspector: ${evidence.title}`}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end animate-fadeIn print:hidden"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="w-full max-w-xl bg-background border-l border-border/80 h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inspector Header */}
        <div className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-card/95 backdrop-blur-md px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <FileText className="size-4" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-foreground font-sans">
                  Clinical Evidence Inspector
                </h2>
                {currentIndex >= 0 && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Clause {currentIndex + 1} of {allEvidences.length}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                {evidence.citationClause}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Sequential Paging Arrows */}
            <div className="flex items-center border border-border/70 rounded-md bg-muted/40 p-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handlePrevious}
                disabled={!hasPrevious}
                className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Previous clause (Arrow Left)"
                aria-label="Previous clause"
              >
                <CaretLeft className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleNext}
                disabled={!hasNext}
                className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Next clause (Arrow Right)"
                aria-label="Next clause"
              >
                <CaretRight className="size-3.5" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close Inspector (Esc)"
              aria-label="Close Inspector"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Inspector Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Metadata Badges & Match Score */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={config.badgeVariant} size="sm" className="gap-1">
                  <SourceIcon className="size-3" />
                  <span>{config.label}</span>
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  {evidence.citationClause}
                </Badge>
              </div>

              <Badge
                variant="secondary"
                className={`font-mono text-xs font-semibold ${
                  evidence.relevanceScore >= 90
                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                    : evidence.relevanceScore >= 75
                    ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                    : "text-blue-500 bg-blue-500/10 border-blue-500/20"
                }`}
              >
                {evidence.relevanceScore}% Relevance Match
              </Badge>
            </div>

            <h3 className="text-sm font-semibold text-foreground leading-snug">
              {evidence.title}
            </h3>

            {safeExternalHref(evidence.sourceUrl) && (
              <div className="pt-1">
                <a
                  href={safeExternalHref(evidence.sourceUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-mono truncate max-w-full"
                >
                  <ArrowSquareOut className="size-3.5 shrink-0" />
                  <span className="truncate">{evidence.sourceUrl}</span>
                </a>
              </div>
            )}
          </div>

          {/* Medical Necessity Criteria & Policy Rule Box */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary" />
                Medical Necessity Criteria & Policy Rule
              </span>

              <Button
                variant="ghost"
                size="xs"
                onClick={handleCopyRule}
                className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                title="Copy criteria text"
              >
                {copiedRule ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy Text</span>
                  </>
                )}
              </Button>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border/80 p-3.5 text-xs text-foreground/95 leading-relaxed whitespace-pre-line font-sans select-text">
              {stripMarkdownFormatting(evidence.extractedEvidenceMarkdown)}
            </div>
          </div>

          {/* Statutory & Legal Context */}
          <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Shield className="size-3.5 text-primary" />
              <span>Statutory Legal Significance</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {evidence.sourceType === "payer_cpb" && (
                <>
                  Under federal ERISA guidelines (29 CFR § 2560.503-1), plan administrators are legally bound by their published Clinical Policy Bulletins. Demonstrating patient compliance with this exact published clause establishes that the adverse determination was arbitrary and contrary to plan documents.
                </>
              )}
              {evidence.sourceType === "pubmed_study" && (
                <>
                  Peer-reviewed clinical evidence establishes contemporary medical standard of care, invalidating insurer claims of experimental or unproven treatment.
                </>
              )}
              {evidence.sourceType === "fda_package_insert" && (
                <>
                  FDA regulatory label indications represent the national standard for pharmaceutical and device necessity, refuting categorical coverage denials.
                </>
              )}
              {evidence.sourceType === "legal_precedent" && (
                <>
                  Binding statutory mandate requiring full and fair review, procedural disclosures, and prompt disclosure of all internal clinical criteria.
                </>
              )}
              {evidence.sourceType === "nccn_guideline" && (
                <>
                  National Comprehensive Cancer Network guidelines are recognized by federal Medicare and commercial payers as the authoritative standard of care.
                </>
              )}
            </p>
          </div>

          {/* Visual Proof Screenshot (if available) */}
          {evidence.screenshotUrl && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                  <Camera className="size-4" />
                  <span>Visual Proof Archive</span>
                </div>
                {onInspectScreenshot && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      onInspectScreenshot({
                        url: evidence.screenshotUrl!,
                        title: evidence.title,
                        date: evidence.capturedAt
                          ? new Date(evidence.capturedAt).toLocaleDateString()
                          : undefined,
                      })
                    }
                    className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 gap-1"
                  >
                    <Eye className="size-3.5" />
                    <span>Expand</span>
                  </Button>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Visual capture of the insurer policy page taken on date of clinical verification.
              </p>

              <div
                onClick={() =>
                  onInspectScreenshot?.({
                    url: evidence.screenshotUrl!,
                    title: evidence.title,
                    date: evidence.capturedAt
                      ? new Date(evidence.capturedAt).toLocaleDateString()
                      : undefined,
                  })
                }
                className="relative rounded-lg border border-border bg-black/40 overflow-hidden cursor-pointer group max-h-56 flex items-start justify-center"
              >
                <img
                  src={evidence.screenshotUrl}
                  alt={`Screenshot: ${evidence.title}`}
                  className="w-full object-cover object-top group-hover:scale-[1.01] transition-transform duration-200"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-background/95 text-foreground text-xs font-medium px-3 py-1.5 rounded-md shadow-md border border-border flex items-center gap-1.5">
                    <Eye className="size-3.5 text-primary" />
                    <span>Click to Zoom</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inspector Footer Actions */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-card/95 backdrop-blur-md px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCitation}
              className="text-xs h-8 gap-1.5"
            >
              {copiedClause ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Citation Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copy Citation</span>
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {onDeleteEvidence && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-xs h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash className="size-3.5" />
                <span>{isDeleting ? "Removing..." : "Remove Clause"}</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={onClose}
              className="text-xs h-8 bg-primary text-primary-foreground font-semibold px-4"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
