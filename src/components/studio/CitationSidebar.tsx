import React from "react";
import {
  Scale,
  BookOpen,
  Plus,
  Copy,
  Check,
  Shield,
} from "lucide-react";
import { ClinicalEvidence } from "../../types";

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
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Evidence & Citation Vault
          </span>
        </div>
        <span className="rounded bg-cyan-950/60 border border-cyan-500/40 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
          {evidences.length} Clauses
        </span>
      </div>

      {/* 1. Quick Statutory Law Snippets */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Scale className="h-3 w-3 text-cyan-400" />
          <span>Statutory ERISA Templates</span>
        </span>

        <div className="space-y-2">
          {QUICK_LEGAL_SNIPPETS.map((snippet, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2 hover:border-cyan-500/40 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-300">
                  {snippet.title}
                </span>
                <button
                  onClick={() => onInsertSnippet(snippet.snippet)}
                  className="inline-flex items-center gap-1 rounded bg-cyan-950 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-300 hover:bg-cyan-900 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Insert</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {snippet.snippet.replace(/^> \*\*.*?\*\*: /, "")}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Indexed CPB Evidences */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-emerald-400" />
          <span>Retrieved CPB Citations ({evidences.length})</span>
        </span>

        {evidences.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
            No policy clauses indexed yet. Run policy crawl in the Evidence Matrix tab.
          </div>
        ) : (
          <div className="space-y-2.5">
            {evidences.map((item, idx) => (
              <div
                key={item._id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2 hover:border-emerald-500/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-emerald-300 block">
                      {item.citationClause}
                    </span>
                    <span className="text-[11px] text-white font-medium line-clamp-1">
                      {item.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        handleCopy(
                          idx,
                          `> **Policy Citation (${item.citationClause})**: ${item.extractedEvidenceMarkdown}`
                        )
                      }
                      className="p-1 rounded text-slate-500 hover:text-slate-200"
                      title="Copy to clipboard"
                    >
                      {copiedIndex === idx ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        onInsertSnippet(
                          `\n> **${item.title} (${item.citationClause})**:\n> ${item.extractedEvidenceMarkdown}\n`
                        )
                      }
                      className="inline-flex items-center gap-1 rounded bg-emerald-950 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-300 hover:bg-emerald-900 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Insert</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed">
                  {item.extractedEvidenceMarkdown}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
