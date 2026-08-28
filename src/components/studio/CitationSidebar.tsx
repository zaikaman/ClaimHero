import React from "react";
import {
  Scales,
  BookOpen,
  Copy,
  Check,
  Shield,
  CheckCircle,
} from "@phosphor-icons/react";
import { ClinicalEvidence } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { stripMarkdownFormatting } from "../../lib/utils";

interface CitationSidebarProps {
  evidences: ClinicalEvidence[];
  onInsertSnippet?: (snippet: string) => void;
}

const STATUTORY_LEGAL_AUTHORITIES = [
  {
    title: "ERISA 29 CFR § 2560.503-1",
    sectionTarget: "Section II",
    category: "Federal Procedural Right",
    summary: "Mandates full and fair de novo review by an independent physician without deference to prior denial.",
    fullCitation: `Pursuant to 29 CFR § 2560.503-1(h)(2)(iii), the plan administrator is required to provide full access to and copies of all documents, records, and internal clinical protocols utilized in making the adverse determination. Denial of coverage based on non-disclosed internal guidelines violates the claimant's statutory right to a full and fair review.`,
  },
  {
    title: "Treating Physician Clinical Authority",
    sectionTarget: "Section I & II",
    category: "Standard of Review",
    summary: "Firsthand clinical evaluation by treating physician outweighs non-examining paper reviewers.",
    fullCitation: `The licensed treating physician possesses firsthand clinical knowledge of the patient's pathology, diagnostic imaging, and functional deterioration. The insurer's non-examining paper reviewer failed to establish any credible medical justification to countermand the treating specialist's clinical determination.`,
  },
  {
    title: "ACA § 2719 External Review Standard",
    sectionTarget: "Section IV",
    category: "Appellate Escalation",
    summary: "Statutory notice of right to petition state insurance commissioner for binding independent external review.",
    fullCitation: `In the event of an adverse benefit determination upholding this denial, claimant hereby exercises formal notice of intent to file for Independent External Medical Review with the State Insurance Commissioner (45 CFR § 147.136).`,
  },
];

export const CitationSidebar: React.FC<CitationSidebarProps> = ({
  evidences,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Header */}
      <div className="space-y-1.5 border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              Cited Authorities & Evidence
            </span>
          </div>
          <Badge variant="success" size="sm" className="font-mono text-[10px]">
            Auto-Cited in Brief
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Statutory protections and policy criteria are automatically integrated into the legal brief by the Sentinel AI.
        </p>
      </div>

      {/* 1. Statutory ERISA Protections */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Scales className="size-3" />
          <span>Statutory Authorities ({STATUTORY_LEGAL_AUTHORITIES.length})</span>
        </div>

        <div className="space-y-2">
          {STATUTORY_LEGAL_AUTHORITIES.map((auth, idx) => (
            <Card
              key={idx}
              className="p-3 space-y-2 bg-card hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {auth.title}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
                      Cited in {auth.sectionTarget}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground block font-mono">
                    {auth.category}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(`statute-${idx}`, auth.fullCitation)}
                  title="Copy citation text"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {copiedId === `statute-${idx}` ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {auth.summary}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* 2. Insurer CPB Criteria & Exhibits */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="size-3" />
          <span>Insurer CPB Criteria & Exhibits ({evidences.length})</span>
        </div>

        {evidences.length === 0 ? (
          <Card className="p-4 text-center text-xs text-muted-foreground bg-muted/20 border-dashed">
            No policy clauses indexed yet. Run policy crawl in the Evidence Matrix tab.
          </Card>
        ) : (
          <div className="space-y-2">
            {evidences.map((item, idx) => {
              const exhibitLetter = String.fromCharCode(65 + idx);

              return (
                <Card
                  key={item._id}
                  className="p-3 space-y-2 bg-card hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.citationClause}
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          Exhibit {exhibitLetter} (Section III)
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">
                        {item.title}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        handleCopy(
                          item._id,
                          `> **Policy Citation (${item.citationClause})**: ${stripMarkdownFormatting(item.extractedEvidenceMarkdown)}`
                        )
                      }
                      title="Copy citation text"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === item._id ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed">
                    {stripMarkdownFormatting(item.extractedEvidenceMarkdown)}
                  </p>

                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 pt-0.5 font-medium">
                    <CheckCircle className="size-3" />
                    <span>Cross-referenced & Rebutted in Memorandum</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
