import React, { useState } from "react";
import {
  FileText,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  Sparkles,
  Search,
} from "lucide-react";
import { ClinicalEvidence, EvidenceSourceType } from "../../types";

interface PolicyViewerProps {
  evidences: ClinicalEvidence[];
  isLoading?: boolean;
}

const SOURCE_TYPE_LABELS: Record<EvidenceSourceType, { label: string; color: string; border: string; bg: string }> = {
  payer_cpb: {
    label: "Insurer Policy Bulletin",
    color: "text-cyan-400",
    border: "border-cyan-500/40",
    bg: "bg-cyan-950/40",
  },
  pubmed_study: {
    label: "PubMed Clinical Trial",
    color: "text-emerald-400",
    border: "border-emerald-500/40",
    bg: "bg-emerald-950/40",
  },
  fda_package_insert: {
    label: "FDA Label / Indication",
    color: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-950/40",
  },
  nccn_guideline: {
    label: "NCCN Guideline",
    color: "text-purple-400",
    border: "border-purple-500/40",
    bg: "bg-purple-950/40",
  },
  legal_precedent: {
    label: "Statutory Law / Precedent",
    color: "text-rose-400",
    border: "border-rose-500/40",
    bg: "bg-rose-950/40",
  },
};

export const PolicyViewer: React.FC<PolicyViewerProps> = ({ evidences, isLoading }) => {
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
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <BookOpen className="h-4 w-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Indexed Clinical Clauses ({filtered.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search clause or criteria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-400 focus:outline-none font-mono"
            />
          </div>

          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 focus:border-cyan-400 focus:outline-none font-mono"
          >
            <option value="all">All Sources</option>
            <option value="payer_cpb">Insurer CPB</option>
            <option value="legal_precedent">ERISA / Law</option>
            <option value="pubmed_study">PubMed</option>
            <option value="fda_package_insert">FDA Label</option>
          </select>
        </div>
      </div>

      {/* Evidence Cards */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs font-mono text-slate-400 animate-pulse">
          Crawling Clinical Policy Bulletins with Firecrawl & extracting medical criteria...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-2">
          <FileText className="mx-auto h-8 w-8 text-slate-600" />
          <div className="text-xs font-semibold text-slate-300">No clinical policy clauses indexed yet</div>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Click &quot;Run Live Policy Crawl&quot; to fetch official insurer Clinical Policy Bulletins and medical necessity guidelines.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const config = SOURCE_TYPE_LABELS[item.sourceType] || SOURCE_TYPE_LABELS.payer_cpb;
            const isCopied = copiedId === item._id;

            return (
              <div
                key={item._id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 hover:border-slate-700 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${config.bg} ${config.border} ${config.color}`}
                      >
                        {config.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-cyan-300">
                        {item.citationClause}
                      </span>
                      <span className="rounded-full bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.2 text-[10px] font-mono text-emerald-300">
                        {item.relevanceScore}% Match
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-200 transition-colors">
                      {item.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopyCitation(item._id, `${item.title} (${item.citationClause})`)}
                      className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                      title="Copy citation reference"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        title="Open policy source URL"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-950/80 border border-slate-800/80 p-3 text-xs text-slate-300 leading-relaxed font-sans prose prose-invert max-w-none">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400/80 mb-1">
                    <Sparkles className="h-3 w-3" />
                    <span>Medical Necessity Criteria & Contradiction Rule:</span>
                  </div>
                  <p className="whitespace-pre-line text-[11px] text-slate-300">
                    {item.extractedEvidenceMarkdown}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
