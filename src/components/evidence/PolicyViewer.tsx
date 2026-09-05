import React, { useState, useMemo } from "react";
import {
  FileText,
  ArrowSquareOut,
  Copy,
  Check,
  BookOpen,
  MagnifyingGlass,
  Trash,
  Globe,
  Flask,
  ShieldCheck,
  Scales,
  Camera,
  Eye,
} from "@phosphor-icons/react";
import { ClinicalEvidence, EvidenceSourceType } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { stripMarkdownFormatting, cn } from "../../lib/utils";
import { safeExternalHref } from "../../lib/urlUtils";

interface PolicyViewerProps {
  evidences: ClinicalEvidence[];
  isLoading?: boolean;
  onDeleteEvidence?: (evidenceId: string) => Promise<unknown>;
  onOpenResearchConsole?: () => void;
}

const SOURCE_TYPE_LABELS: Record<
  EvidenceSourceType,
  { label: string; badgeVariant: "default" | "secondary" | "outline" | "destructive" }
> = {
  payer_cpb: {
    label: "Insurer Policy Bulletin",
    badgeVariant: "default",
  },
  pubmed_study: {
    label: "PubMed Clinical Trial",
    badgeVariant: "secondary",
  },
  fda_package_insert: {
    label: "FDA Label / Indication",
    badgeVariant: "outline",
  },
  nccn_guideline: {
    label: "NCCN Guideline",
    badgeVariant: "secondary",
  },
  legal_precedent: {
    label: "Statutory Law / Precedent",
    badgeVariant: "outline",
  },
};

export const PolicyViewer: React.FC<PolicyViewerProps> = ({
  evidences,
  isLoading,
  onDeleteEvidence,
  onOpenResearchConsole,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeScreenshot, setActiveScreenshot] = useState<{
    url: string;
    title: string;
    date?: string;
  } | null>(null);

  const handleCopyCitation = (id: string, clause: string) => {
    navigator.clipboard.writeText(clause);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: evidences.length,
      payer_cpb: 0,
      pubmed_study: 0,
      fda_package_insert: 0,
      legal_precedent: 0,
    };
    evidences.forEach((e) => {
      if (counts[e.sourceType] !== undefined) {
        counts[e.sourceType]++;
      }
    });
    return counts;
  }, [evidences]);

  const filtered = evidences.filter((e) => {
    if (filterSource !== "all" && e.sourceType !== filterSource) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.citationClause.toLowerCase().includes(q) ||
        e.extractedEvidenceMarkdown.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const visualProofs = useMemo(() => {
    return Array.from(
      new Map(
        filtered
          .filter((item) => !!item.screenshotUrl)
          .map((item) => [item.screenshotUrl, item])
      ).values()
    );
  }, [filtered]);

  const categoryTabs = [
    { id: "all", label: "All Evidence", icon: BookOpen, count: sourceCounts.all },
    { id: "payer_cpb", label: "Insurer CPB", icon: BookOpen, count: sourceCounts.payer_cpb },
    { id: "pubmed_study", label: "PubMed Trials", icon: Flask, count: sourceCounts.pubmed_study },
    { id: "fda_package_insert", label: "FDA Labels", icon: ShieldCheck, count: sourceCounts.fda_package_insert },
    { id: "legal_precedent", label: "ERISA Law", icon: Scales, count: sourceCounts.legal_precedent },
  ];

  return (
    <div className="space-y-3 font-sans">
      {/* Category Filter Pills & Search Header */}
      <div className="space-y-2 bg-card border border-border p-3 rounded-xl shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              Clinical Evidence Dossier ({filtered.length} of {evidences.length})
            </span>
          </div>

          <div className="relative w-44 sm:w-56">
            <MagnifyingGlass className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search clauses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>
        </div>

        {/* Category Pill Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none pt-1">
          {categoryTabs.map((tab) => {
            const isSelected = filterSource === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterSource(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer border",
                  isSelected
                    ? "bg-primary text-primary-foreground border-transparent font-semibold shadow-2xs"
                    : "bg-muted/30 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/70"
                )}
              >
                <Icon className="size-3 shrink-0" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.2 rounded-md font-semibold",
                    isSelected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Evidence Cards List */}
      {isLoading ? (
        <Card className="p-8 text-center text-xs font-mono text-muted-foreground animate-pulse bg-muted/20">
          Indexing Clinical Policy Bulletins & extracting medical criteria...
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center items-center justify-center space-y-3 bg-muted/20 border-dashed">
          <FileText className="size-8 text-muted-foreground mx-auto" />
          <div className="text-xs font-semibold text-foreground">
            No clinical evidence clauses indexed yet
          </div>
          <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
            Use the Multi-Source Research Hub to crawl insurer policy bulletins, peer-reviewed PubMed studies, or FDA package inserts.
          </p>
          {onOpenResearchConsole && (
            <Button
              size="sm"
              onClick={onOpenResearchConsole}
              className="gap-1.5 text-xs mx-auto bg-primary text-primary-foreground"
            >
              <Globe className="size-3.5" />
              <span>Open Clinical Research Hub</span>
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2.5">
          {/* Visual Proof Archive - Rendered once per unique policy bulletin */}
          {visualProofs.length > 0 && (
            <div className="space-y-2.5">
              {visualProofs.map((proof) => (
                <div
                  key={proof.screenshotUrl}
                  className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-2 rounded-full bg-blue-500 animate-pulse" />
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                        <Camera className="size-3.5 text-blue-400" />
                        <span>Payer Clinical Policy Bulletin Verification</span>
                        {proof.capturedAt && (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            ({new Date(proof.capturedAt).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setActiveScreenshot({
                          url: proof.screenshotUrl!,
                          title: proof.title,
                          date: proof.capturedAt
                            ? new Date(proof.capturedAt).toLocaleDateString()
                            : undefined,
                        })
                      }
                      className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 gap-1"
                    >
                      <Eye className="size-3.5" />
                      <span>Inspect Capture</span>
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Visual archive of the published coverage policy captured on date of clinical verification. Preserves policy metadata, effective dates, and published criteria headers against administrative alterations.
                  </p>

                  <div
                    onClick={() =>
                      setActiveScreenshot({
                        url: proof.screenshotUrl!,
                        title: proof.title,
                        date: proof.capturedAt
                          ? new Date(proof.capturedAt).toLocaleDateString()
                          : undefined,
                      })
                    }
                    className="relative rounded-md border border-border/80 bg-background/80 overflow-hidden cursor-pointer group max-h-52 flex items-start justify-center"
                  >
                    <img
                      src={proof.screenshotUrl}
                      alt={`Policy screenshot: ${proof.title}`}
                      className="w-full object-cover object-top group-hover:scale-[1.01] transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-background/95 text-foreground text-xs font-medium px-3 py-1.5 rounded-md shadow-md border border-border flex items-center gap-1.5">
                        <Eye className="size-3.5 text-primary" />
                        <span>Click to Expand Visual Proof Screenshot</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filtered.map((item) => {
            const config =
              SOURCE_TYPE_LABELS[item.sourceType] ||
              SOURCE_TYPE_LABELS.payer_cpb;
            const isCopied = copiedId === item._id;

            return (
              <Card
                key={item._id}
                className="p-3.5 space-y-2.5 bg-card hover:bg-muted/20 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <Badge variant={config.badgeVariant} size="sm">
                        {config.label}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs max-w-[220px] sm:max-w-[320px] truncate" title={item.citationClause}>
                        {item.citationClause}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                        {item.relevanceScore}% Match
                      </Badge>
                      {item.screenshotUrl && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] shrink-0 border-blue-500/30 text-blue-400 bg-blue-500/10 cursor-pointer hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                          onClick={() =>
                            setActiveScreenshot({
                              url: item.screenshotUrl!,
                              title: item.title,
                              date: item.capturedAt ? new Date(item.capturedAt).toLocaleDateString() : undefined,
                            })
                          }
                          title="Inspect visual proof screenshot"
                        >
                          <Camera className="size-3 text-blue-400" />
                          <span>Proof of Policy</span>
                        </Badge>
                      )}
                    </div>

                    <h4 className="text-xs font-semibold text-foreground pt-0.5 leading-snug">
                      {item.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        handleCopyCitation(
                          item._id,
                          `${item.title} (${item.citationClause})`
                        )
                      }
                      title="Copy citation reference"
                    >
                      {isCopied ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>

                    {safeExternalHref(item.sourceUrl) && (
                      <a
                        href={safeExternalHref(item.sourceUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open policy source URL"
                      >
                        <ArrowSquareOut className="size-3" />
                      </a>
                    )}

                    {onDeleteEvidence && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onDeleteEvidence(item._id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Remove evidence clause"
                      >
                        <Trash className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground leading-relaxed font-sans">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                    <ShieldCheck className="size-3 text-primary" />
                    <span>Medical Necessity Criteria & Policy Rule:</span>
                  </div>

                  <p className="whitespace-pre-line text-xs text-foreground/90">
                    {stripMarkdownFormatting(item.extractedEvidenceMarkdown)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Visual Proof Exhibit Modal */}
      <Dialog
        open={Boolean(activeScreenshot)}
        onOpenChange={(open) => {
          if (!open) setActiveScreenshot(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-4 gap-3 bg-card border-border overflow-hidden">
          <DialogHeader className="border-b border-border pb-2.5">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div>
                <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Camera className="size-4 text-blue-400" />
                  <span>Visual Proof Archive: Proof of Policy on Date of Service</span>
                </DialogTitle>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {activeScreenshot?.title} {activeScreenshot?.date ? `• Captured on ${activeScreenshot.date}` : ""}
                </div>
              </div>

              {activeScreenshot?.url && (
                <a
                  href={activeScreenshot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ArrowSquareOut className="size-3.5" />
                  <span>Open Full Image</span>
                </a>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto rounded-lg border border-border bg-black/40 p-2 min-h-0">
            {activeScreenshot?.url ? (
              <img
                src={activeScreenshot.url}
                alt={`Visual Proof Exhibit: ${activeScreenshot.title}`}
                className="w-full h-auto rounded object-contain"
              />
            ) : (
              <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                No visual preview available.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

