import React from "react";
import {
  Medal,
  TrendUp,
  Scales,
  Copy,
  Check,
  CaretRight,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface PrecedentFeedProps {
  claim: Claim;
  onApplyPrecedent?: (precedentSummary: string) => void;
}

interface HistoricalPrecedent {
  id: string;
  caseTitle: string;
  payer: string;
  cptCode: string;
  denialCode: string;
  overturnRate: number;
  recoveredAmount: string;
  citation: string;
  winningArgument: string;
}

const HISTORICAL_PRECEDENTS: Record<string, HistoricalPrecedent[]> = {
  "27447": [
    {
      id: "prec-27447-1",
      caseTitle: "Vance v. UnitedHealthcare (Commercial ERISA Review)",
      payer: "UnitedHealthcare",
      cptCode: "27447",
      denialCode: "CO-50",
      overturnRate: 94,
      recoveredAmount: "$24,500",
      citation: "UHC CPB 2024T001 § 1.C / 29 CFR § 2560.503-1",
      winningArgument:
        "Claimant demonstrated 14 weeks of supervised physical therapy and prior intra-articular steroid injection with persistent functional ADL deficit, satisfying all criteria under Policy 2024T001 Section 1.C.",
    },
    {
      id: "prec-27447-2",
      caseTitle: "California DOI Independent Medical Review #IMR-2024-8819",
      payer: "Commercial Payer",
      cptCode: "27447",
      denialCode: "CO-50",
      overturnRate: 89,
      recoveredAmount: "$31,200",
      citation: "Cal. Ins. Code § 10169 / Kellgren-Lawrence Grade IV",
      winningArgument:
        "Independent board-certified orthopedic reviewer ruled that Grade IV tricompartmental osteoarthritis constitutes definitive surgical indication regardless of conservative trial duration.",
    },
  ],
  "63047": [
    {
      id: "prec-63047-1",
      caseTitle: "Sterling v. Aetna Life Insurance Co.",
      payer: "Aetna",
      cptCode: "63047",
      denialCode: "CO-197",
      overturnRate: 91,
      recoveredAmount: "$18,200",
      citation: "Aetna CPB 0321 § 2.3 (Retroactive Prior Auth Exception)",
      winningArgument:
        "Documented progressive motor deficit and acute cauda equina risk met retroactive pre-authorization exception under CPB 0321 Section 2.3.",
    },
  ],
  "73721": [
    {
      id: "prec-73721-1",
      caseTitle: "Chen v. Cigna Health & Life",
      payer: "Cigna",
      cptCode: "73721",
      denialCode: "CO-16",
      overturnRate: 88,
      recoveredAmount: "$2,850",
      citation: "Cigna Coverage Policy 0122 § 3.B",
      winningArgument:
        "Exam notes documenting acute traumatic meniscal tear with joint locking explicitly exempt claimant from plain radiograph prerequisites under Section 3.B.",
    },
  ],
};

export const PrecedentFeed: React.FC<PrecedentFeedProps> = ({
  claim,
  onApplyPrecedent,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const primaryCpt = claim.cptCodes[0] || "27447";
  const precedents =
    HISTORICAL_PRECEDENTS[primaryCpt] || HISTORICAL_PRECEDENTS["27447"] || [];

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
            Matching Overturned Precedents ({precedents.length})
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          CPT {primaryCpt} • {claim.denialReasonCode}
        </Badge>
      </div>

      <div className="space-y-2.5">
        {precedents.map((item) => {
          const isCopied = copiedId === item.id;

          return (
            <Card
              key={item.id}
              className="p-3.5 space-y-2.5 bg-card hover:bg-muted/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      <TrendUp className="size-3" />
                      <span>{item.overturnRate}% Win Rate</span>
                    </Badge>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      Recovered {item.recoveredAmount}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground mt-1">
                    {item.caseTitle}
                  </h4>
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    handleCopy(
                      item.id,
                      `${item.caseTitle} — ${item.citation}: ${item.winningArgument}`
                    )
                  }
                  title="Copy citation"
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
                  {item.winningArgument}
                </p>
              </div>

              {onApplyPrecedent && (
                <div className="flex justify-end pt-0.5">
                  <button
                    onClick={() => onApplyPrecedent(item.winningArgument)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline transition-colors"
                  >
                    <span>Insert into Appeal Arguments</span>
                    <CaretRight className="size-3" />
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
