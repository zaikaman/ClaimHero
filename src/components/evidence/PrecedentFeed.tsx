import React from "react";
import {
  Award,
  TrendingUp,
  Scale,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react";
import { Claim } from "../../types";

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

export const PrecedentFeed: React.FC<PrecedentFeedProps> = ({ claim, onApplyPrecedent }) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const primaryCpt = claim.cptCodes[0] || "27447";
  const precedents = HISTORICAL_PRECEDENTS[primaryCpt] || HISTORICAL_PRECEDENTS["27447"] || [];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Matching Overturned Precedents ({precedents.length})
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          CPT {primaryCpt} • Denial {claim.denialReasonCode}
        </span>
      </div>

      <div className="space-y-3">
        {precedents.map((item) => {
          const isCopied = copiedId === item.id;

          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 hover:border-emerald-500/40 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {item.overturnRate}% Win Rate
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200">
                      Recovered {item.recoveredAmount}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                    {item.caseTitle}
                  </h4>
                </div>

                <button
                  onClick={() => handleCopy(item.id, `${item.caseTitle} — ${item.citation}: ${item.winningArgument}`)}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors shrink-0"
                  title="Copy winning argument citation"
                >
                  {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5 space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                  <Scale className="h-3 w-3" />
                  <span>Statutory Citation: {item.citation}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {item.winningArgument}
                </p>
              </div>

              {onApplyPrecedent && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => onApplyPrecedent(item.winningArgument)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 font-mono transition-colors"
                  >
                    <span>Insert into Appeal Arguments</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
