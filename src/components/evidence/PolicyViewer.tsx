import React, { useState } from "react";
import {
  FileText,
  ArrowSquareOut,
  Copy,
  Check,
  BookOpen,
  Sparkle,
  MagnifyingGlass,
  Trash,
  Globe,
} from "@phosphor-icons/react";
import { ClinicalEvidence, EvidenceSourceType } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { stripMarkdownFormatting } from "../../lib/utils";

interface PolicyViewerProps {
  evidences: ClinicalEvidence[];
  isLoading?: boolean;
  onDeleteEvidence?: (evidenceId: string) => Promise<any>;
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

  const handleCopyCitation = (id: string, clause: string) => {
    navigator.clipboard.writeText(clause);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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

  return (
    <div className="space-y-3">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-card border border-border p-2.5 rounded-xl">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <BookOpen className="size-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Indexed Clinical Clauses ({filtered.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <MagnifyingGlass className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search clause..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>

          <Select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="h-7 text-xs font-sans"
          >
            <option value="all">All Sources</option>
            <option value="payer_cpb">Insurer CPB</option>
            <option value="pubmed_study">PubMed Trials</option>
            <option value="fda_package_insert">FDA Labels</option>
            <option value="nccn_guideline">NCCN Guidelines</option>
            <option value="legal_precedent">ERISA / Law</option>
          </Select>
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

                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
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
                    <Sparkle className="size-3 text-primary" />
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
    </div>
  );
};

