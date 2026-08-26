import React from "react";
import {
  Scales,
  BookOpen,
  Plus,
  Copy,
  Check,
  Shield,
} from "@phosphor-icons/react";
import { ClinicalEvidence } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface CitationSidebarProps {
  evidences: ClinicalEvidence[];
  onInsertSnippet: (snippet: string) => void;
}

const QUICK_LEGAL_SNIPPETS = [
  {
    title: "ERISA 29 CFR § 2560.503-1(h)(2)(iii)",
    category: "Federal Law",
    snippet: `> **Statutory Authority**: Pursuant to 29 CFR § 2560.503-1(h)(2)(iii), the plan administrator is required to provide full access to and copies of all documents, records, and internal clinical protocols utilized in making the adverse determination. Denial of coverage based on non-disclosed internal guidelines violates the claimant's statutory right to a full and fair review.`,
  },
  {
    title: "Treating Physician Rule / Clinical Consensus",
    category: "Medical Evidence",
    snippet: `> **Treating Physician Clinical Finding**: The licensed treating physician possesses firsthand clinical knowledge of the patient's pathology, diagnostic imaging, and functional deterioration. The insurer's non-examining paper reviewer failed to establish any credible medical justification to countermand the treating specialist's clinical determination.`,
  },
  {
    title: "ACA Section 2719 External Review Standard",
    category: "External Review",
    snippet: `> **External Review Standard (45 CFR § 147.136)**: In the event of an adverse benefit determination upholding this denial, claimant hereby exercises formal notice of intent to file for Independent External Medical Review with the State Insurance Commissioner.`,
  },
];

export const CitationSidebar: React.FC<CitationSidebarProps> = ({
  evidences,
  onInsertSnippet,
}) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopy = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Citation Vault
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {evidences.length} Clauses
        </Badge>
      </div>

      {/* 1. Statutory ERISA Templates */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Scales className="size-3" />
          <span>Statutory ERISA Templates</span>
        </div>

        <div className="space-y-2">
          {QUICK_LEGAL_SNIPPETS.map((snippet, idx) => (
            <Card
              key={idx}
              className="p-3 space-y-2 bg-card hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-foreground">
                  {snippet.title}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onInsertSnippet(snippet.snippet)}
                  className="gap-1"
                >
                  <Plus className="size-3" />
                  <span>Insert</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                {snippet.snippet.replace(/^> \*\*.*?\*\*: /, "")}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* 2. Indexed CPB Evidences */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="size-3" />
          <span>CPB Citations ({evidences.length})</span>
        </div>

        {evidences.length === 0 ? (
          <Card className="p-4 text-center text-xs text-muted-foreground bg-muted/20 border-dashed">
            No policy clauses indexed yet. Run policy crawl in the Evidence Matrix tab.
          </Card>
        ) : (
          <div className="space-y-2">
            {evidences.map((item, idx) => (
              <Card
                key={item._id}
                className="p-3 space-y-2 bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-semibold text-foreground block">
                      {item.citationClause}
                    </span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">
                      {item.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        handleCopy(
                          idx,
                          `> **Policy Citation (${item.citationClause})**: ${item.extractedEvidenceMarkdown}`
                        )
                      }
                      title="Copy to clipboard"
                    >
                      {copiedIndex === idx ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        onInsertSnippet(
                          `\n> **${item.title} (${item.citationClause})**:\n> ${item.extractedEvidenceMarkdown}\n`
                        )
                      }
                      className="gap-1"
                    >
                      <Plus className="size-3" />
                      <span>Insert</span>
                    </Button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                  {item.extractedEvidenceMarkdown}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
