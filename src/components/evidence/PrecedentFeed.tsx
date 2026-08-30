import React from "react";
import {
  Medal,
  TrendUp,
  Scales,
  Copy,
  Check,
  CheckCircle,
  CircleNotch,
  Warning,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { Claim, VectorPrecedentMatch } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { stripMarkdownFormatting } from "../../lib/utils";
import { usePrecedents } from "../../hooks/usePrecedents";

interface PrecedentFeedProps {
  claim: Claim;
}

function similarityPercent(score: number): number {
  return Math.round(Math.max(0, Math.min(1, (score + 1) / 2)) * 1000) / 10;
}

function sourceKindLabel(kind: string): string {
  switch (kind) {
    case "winning_brief":
      return "Winning Brief";
    case "commissioner_ruling":
      return "Commissioner Ruling";
    case "court_overturn":
      return "Court Overturn";
    case "statutory_authority":
      return "Statutory Authority";
    default:
      return kind.replace(/_/g, " ");
  }
}

function citationCopyText(item: VectorPrecedentMatch): string {
  return `> **Controlling Precedent (${item.title} - ${item.citation})**: ${stripMarkdownFormatting(item.statutoryLanguage)}\n\n${stripMarkdownFormatting(item.winningArgument)}`;
}

export const PrecedentFeed: React.FC<PrecedentFeedProps> = ({ claim }) => {
  const { matches, isLoading, error, retrievePrecedents } = usePrecedents(claim);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const primaryCpt = claim.cptCodes[0] || "N/A";

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-card border border-border p-2.5 rounded-xl">
        <div className="flex items-center gap-2">
          <Medal className="size-4 text-emerald-500" />
          <span className="text-xs font-semibold text-foreground">
            Vector-Matched Overturn Precedents ({matches.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-[10px]">
            CPT {primaryCpt} • {claim.denialReasonCode}
          </Badge>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => retrievePrecedents(claim._id).catch(() => undefined)}
            disabled={isLoading}
            title="Re-run vector search"
          >
            {isLoading ? (
              <CircleNotch className="size-3 animate-spin" />
            ) : (
              <ArrowsClockwise className="size-3" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-3 flex items-start gap-2 border-destructive/30 bg-destructive/5">
          <Warning className="size-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] text-destructive leading-relaxed">{error}</p>
        </Card>
      )}

      {isLoading && matches.length === 0 && (
        <Card className="p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <CircleNotch className="size-5 animate-spin text-primary" />
          <p className="text-xs">Running Convex vector search against the Precedent Archive...</p>
        </Card>
      )}

      {!isLoading && matches.length === 0 && !error && (
        <Card className="p-4 text-center text-xs text-muted-foreground bg-muted/20 border-dashed">
          No vector matches yet. Run evidence analysis or synthesize a brief to query the archive by ICD-10, CPT, and CARC.
        </Card>
      )}

      <div className="space-y-2.5">
        {matches.map((item) => {
          const isCopied = copiedId === item._id;
          const similarity = similarityPercent(item.vectorScore);

          return (
            <Card
              key={item._id}
              className="p-3.5 space-y-2.5 bg-card hover:bg-muted/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="gap-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      <TrendUp className="size-3" />
                      <span>{similarity}% similar</span>
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {sourceKindLabel(item.sourceKind)}
                    </Badge>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground mt-1">
                    {item.title}
                  </h4>
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(item._id, citationCopyText(item))}
                  title="Copy controlling precedent citation"
                >
                  {isCopied ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
              </div>

              <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-foreground font-medium">
                  <Scales className="size-3 text-muted-foreground" />
                  <span>Citation: {item.citation}</span>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed font-sans">
                  {stripMarkdownFormatting(item.statutoryLanguage)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {stripMarkdownFormatting(item.winningArgument)}
                </p>
              </div>

              <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 pt-0.5 font-medium">
                <CheckCircle className="size-3" />
                <span>Auto-Injected into AI Appeal Synthesis Context</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
