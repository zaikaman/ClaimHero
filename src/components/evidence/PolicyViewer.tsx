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
  CaretDown,
  CaretRight,
  Rows,
  ListDashes,
  Folder,
  FolderOpen,
  ArrowsInSimple,
  ArrowsOutSimple,
  Stethoscope,
} from "@phosphor-icons/react";
import { ClinicalEvidence, EvidenceSourceType } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { stripMarkdownFormatting, cn } from "../../lib/utils";
import { safeExternalHref } from "../../lib/urlUtils";
import { ClauseInspectorDrawer } from "./ClauseInspectorDrawer";

interface PolicyViewerProps {
  evidences: ClinicalEvidence[];
  isLoading?: boolean;
  onDeleteEvidence?: (evidenceId: string) => Promise<unknown>;
  onOpenResearchConsole?: () => void;
  onOpenPolicyDrift?: () => void;
}

const SOURCE_TYPE_LABELS: Record<
  EvidenceSourceType,
  {
    label: string;
    shortLabel: string;
    badgeVariant: "default" | "secondary" | "outline" | "destructive";
    icon: React.ElementType;
  }
> = {
  payer_cpb: {
    label: "Insurer Policy Bulletin",
    shortLabel: "Insurer CPB",
    badgeVariant: "default",
    icon: BookOpen,
  },
  pubmed_study: {
    label: "PubMed Clinical Trial",
    shortLabel: "PubMed",
    badgeVariant: "secondary",
    icon: Flask,
  },
  fda_package_insert: {
    label: "FDA Label / Indication",
    shortLabel: "FDA Label",
    badgeVariant: "outline",
    icon: ShieldCheck,
  },
  nccn_guideline: {
    label: "Clinical Guideline",
    shortLabel: "Guidelines",
    badgeVariant: "secondary",
    icon: Stethoscope,
  },
  legal_precedent: {
    label: "Statutory Law / Precedent",
    shortLabel: "ERISA Law",
    badgeVariant: "outline",
    icon: Scales,
  },
};

export const PolicyViewer: React.FC<PolicyViewerProps> = ({
  evidences,
  isLoading,
  onDeleteEvidence,
  onOpenResearchConsole,
  onOpenPolicyDrift,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeScreenshot, setActiveScreenshot] = useState<{
    url: string;
    title: string;
    date?: string;
  } | null>(null);

  // View & Density Configuration (Defaults to Grouped + Detailed, toggleable to Compact)
  const [viewMode, setViewMode] = useState<"detailed" | "compact">(() => {
    try {
      const saved = localStorage.getItem("claimhero_evidence_view_mode");
      return saved === "compact" ? "compact" : "detailed";
    } catch {
      return "detailed";
    }
  });

  const [isGrouped, setIsGrouped] = useState<boolean>(() => {
    try {
      return localStorage.getItem("claimhero_evidence_grouped") !== "false";
    } catch {
      return true;
    }
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [inspectedEvidence, setInspectedEvidence] = useState<ClinicalEvidence | null>(null);
  const [showVisualProofArchive, setShowVisualProofArchive] = useState<boolean>(false);

  const handleToggleViewMode = (mode: "detailed" | "compact") => {
    setViewMode(mode);
    try {
      localStorage.setItem("claimhero_evidence_view_mode", mode);
    } catch {
      // Ignore storage errors
    }
  };

  const handleToggleGrouping = () => {
    const next = !isGrouped;
    setIsGrouped(next);
    try {
      localStorage.setItem("claimhero_evidence_grouped", String(next));
    } catch {
      // Ignore storage errors
    }
  };

  const handleCopyCitation = (id: string, clause: string) => {
    navigator.clipboard.writeText(clause);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: evidences.length,
      payer_cpb: 0,
      nccn_guideline: 0,
      legal_precedent: 0,
      pubmed_study: 0,
      fda_package_insert: 0,
    };
    evidences.forEach((e) => {
      counts[e.sourceType] = (counts[e.sourceType] || 0) + 1;
    });
    return counts;
  }, [evidences]);

  const filtered = useMemo(() => {
    return evidences.filter((e) => {
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
  }, [evidences, filterSource, searchQuery]);

  const visualProofs = useMemo(() => {
    return Array.from(
      new Map(
        filtered
          .filter((item) => Boolean(item.screenshotUrl))
          .map((item) => [item.screenshotUrl, item])
      ).values()
    );
  }, [filtered]);

  // Group filtered evidences by source and document title
  const groupedEvidences = useMemo(() => {
    const groups: {
      key: string;
      title: string;
      sourceType: EvidenceSourceType;
      items: ClinicalEvidence[];
      maxRelevance: number;
      screenshotUrl?: string;
      capturedAt?: number;
      sourceUrl?: string;
    }[] = [];

    const map = new Map<string, (typeof groups)[0]>();

    filtered.forEach((item) => {
      const trimmedTitle = item.title.trim();
      const key = `${item.sourceType}:::${trimmedTitle}`;
      let grp = map.get(key);
      if (!grp) {
        grp = {
          key,
          title: trimmedTitle,
          sourceType: item.sourceType,
          items: [],
          maxRelevance: item.relevanceScore,
          screenshotUrl: item.screenshotUrl,
          capturedAt: item.capturedAt,
          sourceUrl: item.sourceUrl,
        };
        map.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(item);
      if (item.relevanceScore > grp.maxRelevance) {
        grp.maxRelevance = item.relevanceScore;
      }
      if (!grp.screenshotUrl && item.screenshotUrl) {
        grp.screenshotUrl = item.screenshotUrl;
        grp.capturedAt = item.capturedAt;
      }
      if (!grp.sourceUrl && item.sourceUrl) {
        grp.sourceUrl = item.sourceUrl;
      }
    });

    return groups;
  }, [filtered]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setCollapsedGroups(new Set());
  };

  const handleCollapseAll = () => {
    setCollapsedGroups(new Set(groupedEvidences.map((g) => g.key)));
  };

  const [showEmptySources, setShowEmptySources] = useState<boolean>(false);

  const allCategoryTabs = useMemo(
    () => [
      { id: "all", label: "All Evidence", icon: BookOpen, count: sourceCounts.all },
      { id: "payer_cpb", label: "Insurer CPB", icon: BookOpen, count: sourceCounts.payer_cpb },
      { id: "nccn_guideline", label: "Clinical Guidelines", icon: Stethoscope, count: sourceCounts.nccn_guideline },
      { id: "legal_precedent", label: "ERISA Law", icon: Scales, count: sourceCounts.legal_precedent },
      { id: "pubmed_study", label: "PubMed Trials", icon: Flask, count: sourceCounts.pubmed_study },
      { id: "fda_package_insert", label: "FDA Labels", icon: ShieldCheck, count: sourceCounts.fda_package_insert },
    ],
    [sourceCounts]
  );

  const emptySourcesCount = useMemo(() => {
    return allCategoryTabs.filter((t) => t.id !== "all" && t.count === 0).length;
  }, [allCategoryTabs]);

  const visibleTabs = useMemo(() => {
    if (showEmptySources) return allCategoryTabs;
    return allCategoryTabs.filter((tab) => tab.count > 0 || tab.id === "all" || tab.id === filterSource);
  }, [allCategoryTabs, showEmptySources, filterSource]);

  return (
    <div className="space-y-3 font-sans">
      {/* Category Filter Pills & Search Header */}
      <div className="space-y-2.5 bg-card border border-border p-3 rounded-xl shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="size-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              Clinical Evidence Dossier ({filtered.length} of {evidences.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-52">
              <MagnifyingGlass className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                aria-label="Search clauses"
                placeholder="Search clauses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Category Pill Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 max-w-full" role="group" aria-label="Filter evidence by source">
          {visibleTabs.map((tab) => {
            const isSelected = filterSource === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterSource(tab.id)}
                aria-pressed={isSelected}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer border",
                  isSelected
                    ? "bg-primary text-primary-foreground border-transparent font-semibold shadow-2xs"
                    : tab.count === 0
                    ? "bg-muted/15 hover:bg-muted/50 text-muted-foreground/80 hover:text-foreground border-border/50 border-dashed"
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

          {emptySourcesCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEmptySources((prev) => !prev)}
              aria-expanded={showEmptySources}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border border-dashed border-border/60 hover:border-border cursor-pointer"
              title={showEmptySources ? "Hide categories with 0 clauses" : "Show all categories including empty sources"}
            >
              <span>{showEmptySources ? "Show Active Only" : `+${emptySourcesCount} More Sources`}</span>
            </button>
          )}
        </div>

        {/* View Density & Grouping Controls Bar */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Density Toggle (Detailed vs Compact) */}
            <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Evidence display density">
              <button
                type="button"
                onClick={() => handleToggleViewMode("detailed")}
                aria-pressed={viewMode === "detailed"}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer",
                  viewMode === "detailed"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Detailed card view with full criteria boxes"
              >
                <Rows className="size-3.5" />
                <span>Detailed</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode("compact")}
                aria-pressed={viewMode === "compact"}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer",
                  viewMode === "compact"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Compact row view to fit 12+ clauses in a single screen"
              >
                <ListDashes className="size-3.5" />
                <span>Compact</span>
              </button>
            </div>

            {/* Grouping Toggle */}
            <Button
              variant="outline"
              size="xs"
              onClick={handleToggleGrouping}
              aria-pressed={isGrouped}
              className={cn(
                "h-6.5 text-[11px] gap-1 px-2 border-border/80",
                isGrouped ? "text-primary border-primary/40 bg-primary/5" : "text-muted-foreground"
              )}
              title={isGrouped ? "Disable grouping (show flat list)" : "Group evidence by parent policy / document"}
            >
              {isGrouped ? <FolderOpen className="size-3 text-primary" /> : <Folder className="size-3" />}
              <span>{isGrouped ? "Grouped Exhibits" : "Flat List"}</span>
            </Button>

            {/* Expand / Collapse All (When Grouped) */}
            {isGrouped && groupedEvidences.length > 1 && (
              <div className="inline-flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleExpandAll}
                  className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-0.5"
                  title="Expand all document groups"
                >
                  <ArrowsOutSimple className="size-2.5" />
                  <span>Expand All</span>
                </Button>
                <span className="text-muted-foreground/40 text-[10px]">•</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCollapseAll}
                  className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-0.5"
                  title="Collapse all document groups"
                >
                  <ArrowsInSimple className="size-2.5" />
                  <span>Collapse All</span>
                </Button>
              </div>
            )}
          </div>

          {/* Visual Proof Quick Indicator Toggle */}
          {visualProofs.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowVisualProofArchive((prev) => !prev)}
              aria-expanded={showVisualProofArchive}
              className={cn(
                "h-6 text-[11px] gap-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10",
                showVisualProofArchive ? "bg-blue-500/15 text-blue-300" : ""
              )}
              title="Toggle visual proof archive banner"
            >
              <Camera className="size-3 text-blue-400" />
              <span>{visualProofs.length} Visual Proof{visualProofs.length === 1 ? "" : "s"}</span>
            </Button>
          )}

          {onOpenPolicyDrift && (
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenPolicyDrift}
              className="h-6 text-[11px] gap-1 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border-cyan-500/30"
              title="Detect retroactive policy changes via Policy Drift Sentinel"
            >
              <Scales className="size-3 text-cyan-400" />
              <span>Detect Policy Drift</span>
            </Button>
          )}
        </div>
      </div>

      {/* Visual Proof Archive (Collapsible Banner) */}
      {showVisualProofArchive && visualProofs.length > 0 && (
        <div className="space-y-2.5 animate-fadeIn">
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

      {/* Evidence Items View Area */}
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
      ) : isGrouped ? (
        /* Solution 3: Grouped Document / Exhibit Accordions */
        <div className="space-y-3">
          {groupedEvidences.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key);
            const config = SOURCE_TYPE_LABELS[group.sourceType] || SOURCE_TYPE_LABELS.payer_cpb;
            const SourceIcon = config.icon;

            return (
              <div
                key={group.key}
                className="rounded-xl border border-border bg-card/70 overflow-hidden shadow-2xs transition-all"
              >
                {/* Exhibit Group Header */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  aria-controls={`group-content-${group.key}`}
                  id={`group-header-${group.key}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleGroup(group.key);
                    }
                  }}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-muted/40 hover:bg-muted/70 cursor-pointer transition-colors select-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none"
                  onClick={() => toggleGroup(group.key)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-muted-foreground p-0.5 shrink-0" aria-hidden="true">
                      {isCollapsed ? (
                        <CaretRight className="size-3.5" />
                      ) : (
                        <CaretDown className="size-3.5" />
                      )}
                    </span>

                    <Badge variant={config.badgeVariant} size="sm" className="gap-1 shrink-0">
                      <SourceIcon className="size-3" />
                      <span className="hidden sm:inline">{config.label}</span>
                      <span className="sm:hidden">{config.shortLabel}</span>
                    </Badge>

                    <h4 className="text-xs font-semibold text-foreground truncate min-w-0" title={group.title}>
                      {group.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {group.items.length} {group.items.length === 1 ? "clause" : "clauses"}
                    </Badge>

                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] font-semibold ${
                        group.maxRelevance >= 90
                          ? "text-emerald-500 border-emerald-500/30"
                          : group.maxRelevance >= 75
                          ? "text-amber-500 border-amber-500/30"
                          : "text-blue-500 border-blue-500/30"
                      }`}
                    >
                      Peak {group.maxRelevance}%
                    </Badge>

                    {group.screenshotUrl && (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10 cursor-pointer hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                        onClick={() =>
                          setActiveScreenshot({
                            url: group.screenshotUrl!,
                            title: group.title,
                            date: group.capturedAt ? new Date(group.capturedAt).toLocaleDateString() : undefined,
                          })
                        }
                        title="Inspect visual proof screenshot"
                      >
                        <Camera className="size-3 text-blue-400" />
                        <span className="hidden sm:inline">Proof</span>
                      </Badge>
                    )}

                    {safeExternalHref(group.sourceUrl) && (
                      <a
                        href={safeExternalHref(group.sourceUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open document source URL"
                      >
                        <ArrowSquareOut className="size-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Exhibit Group Body */}
                {!isCollapsed && (
                  <div
                    id={`group-content-${group.key}`}
                    role="region"
                    aria-labelledby={`group-header-${group.key}`}
                    className={cn("border-t border-border/60", viewMode === "compact" ? "divide-y divide-border/50" : "p-3 space-y-2.5")}
                  >
                    {group.items.map((item) =>
                      viewMode === "compact" ? (
                        <CompactClauseRow
                          key={item._id}
                          item={item}
                          isCopied={copiedId === item._id}
                          onCopy={handleCopyCitation}
                          onInspect={() => setInspectedEvidence(item)}
                          onDelete={onDeleteEvidence}
                        />
                      ) : (
                        <DetailedClauseCard
                          key={item._id}
                          item={item}
                          config={config}
                          isCopied={copiedId === item._id}
                          onCopy={handleCopyCitation}
                          onInspectScreenshot={setActiveScreenshot}
                          onInspectClause={() => setInspectedEvidence(item)}
                          onDelete={onDeleteEvidence}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat List Mode */
        <div className={cn(viewMode === "compact" ? "rounded-xl border border-border bg-card divide-y divide-border/50 overflow-hidden shadow-2xs" : "space-y-2.5")}>
          {filtered.map((item) => {
            const config = SOURCE_TYPE_LABELS[item.sourceType] || SOURCE_TYPE_LABELS.payer_cpb;
            return viewMode === "compact" ? (
              <CompactClauseRow
                key={item._id}
                item={item}
                isCopied={copiedId === item._id}
                onCopy={handleCopyCitation}
                onInspect={() => setInspectedEvidence(item)}
                onDelete={onDeleteEvidence}
              />
            ) : (
              <DetailedClauseCard
                key={item._id}
                item={item}
                config={config}
                isCopied={copiedId === item._id}
                onCopy={handleCopyCitation}
                onInspectScreenshot={setActiveScreenshot}
                onInspectClause={() => setInspectedEvidence(item)}
                onDelete={onDeleteEvidence}
              />
            );
          })}
        </div>
      )}

      {/* Solution 4: Master-Detail Clause Inspector Drawer */}
      <ClauseInspectorDrawer
        isOpen={Boolean(inspectedEvidence)}
        onClose={() => setInspectedEvidence(null)}
        evidence={inspectedEvidence}
        allEvidences={filtered}
        onSelectEvidence={(ev) => setInspectedEvidence(ev)}
        onInspectScreenshot={setActiveScreenshot}
        onDeleteEvidence={onDeleteEvidence}
      />

      {/* Visual Proof Exhibit Full Modal */}
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

/* Solution 2 Sub-Component: Sleek Compact Clause Row (~42px height) */
interface CompactClauseRowProps {
  item: ClinicalEvidence;
  isCopied: boolean;
  onCopy: (id: string, clause: string) => void;
  onInspect: () => void;
  onDelete?: (id: string) => Promise<unknown>;
}

const CompactClauseRow: React.FC<CompactClauseRowProps> = ({
  item,
  isCopied,
  onCopy,
  onInspect,
  onDelete,
}) => {
  const matchColor =
    item.relevanceScore >= 90
      ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
      : item.relevanceScore >= 75
      ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
      : "text-blue-500 bg-blue-500/10 border-blue-500/20";

  const cleanPreview = stripMarkdownFormatting(item.extractedEvidenceMarkdown);

  return (
    <div
      onClick={onInspect}
      className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs hover:bg-muted/40 cursor-pointer transition-colors group select-none"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Match Percentage */}
        <Badge
          variant="secondary"
          className={cn("font-mono text-[10px] font-semibold shrink-0", matchColor)}
        >
          {item.relevanceScore}%
        </Badge>

        {/* Citation Clause Tag */}
        <Badge
          variant="outline"
          className="font-mono text-[10px] shrink-0 max-w-[140px] sm:max-w-[200px] truncate"
          title={item.citationClause}
        >
          {item.citationClause}
        </Badge>

        {/* One-Line Text Snippet */}
        <span
          className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors truncate min-w-0 font-sans"
          title={cleanPreview}
        >
          {cleanPreview}
        </span>
      </div>

      {/* Row Action Buttons */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onInspect}
          className="text-muted-foreground hover:text-foreground"
          title="Inspect clause in detail"
          aria-label="Inspect clause in detail"
        >
          <Eye className="size-3" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onCopy(item._id, `${item.title} (${item.citationClause})`)}
          className="text-muted-foreground hover:text-foreground"
          title="Copy citation reference"
          aria-label="Copy citation reference"
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

        {onDelete && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete(item._id)}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Remove evidence clause"
            aria-label="Remove evidence clause"
          >
            <Trash className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
};

/* Solution 2 Sub-Component: Detailed Rich Card */
interface DetailedClauseCardProps {
  item: ClinicalEvidence;
  config: (typeof SOURCE_TYPE_LABELS)[EvidenceSourceType];
  isCopied: boolean;
  onCopy: (id: string, clause: string) => void;
  onInspectScreenshot: (screenshot: { url: string; title: string; date?: string }) => void;
  onInspectClause: () => void;
  onDelete?: (id: string) => Promise<unknown>;
}

const DetailedClauseCard: React.FC<DetailedClauseCardProps> = ({
  item,
  config,
  isCopied,
  onCopy,
  onInspectScreenshot,
  onInspectClause,
  onDelete,
}) => {
  return (
    <Card className="p-3.5 space-y-2.5 bg-card hover:bg-muted/20 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <Badge variant={config.badgeVariant} size="sm">
              {config.label}
            </Badge>
            <Badge
              variant="outline"
              className="font-mono text-xs max-w-[220px] sm:max-w-[320px] truncate"
              title={item.citationClause}
            >
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
                  onInspectScreenshot({
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
            onClick={onInspectClause}
            className="text-muted-foreground hover:text-foreground"
            title="Inspect clause in deep-dive drawer"
            aria-label="Inspect clause in deep-dive drawer"
          >
            <Eye className="size-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onCopy(item._id, `${item.title} (${item.citationClause})`)}
            title="Copy citation reference"
            aria-label="Copy citation reference"
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

          {onDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDelete(item._id)}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Remove evidence clause"
              aria-label="Remove evidence clause"
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
};
