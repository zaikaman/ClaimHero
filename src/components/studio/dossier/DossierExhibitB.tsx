import React from "react";
import {
  WarningOctagon,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";

interface DossierExhibitBProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const DossierExhibitB: React.FC<DossierExhibitBProps> = ({
  dossier,
  isPrintMode = false,
}) => {
  const items = dossier.exhibitB_PolicyBulletins;

  return (
    <div
      id="section-exhibit-b"
      className="dossier-exhibit-b bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-5 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
    >
      {/* Exhibit Header */}
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded bg-slate-900 text-white font-bold font-mono text-xs">
            B
          </span>
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Exhibit B: Payer Clinical Policy Bulletins & Highlighted Criteria Violations
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-600">
          {items.length} Policy Clause{items.length > 1 ? "s" : ""} Indexed
        </span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Cross-examination of {dossier.payerName}&apos;s published Clinical Policy Bulletins (CPBs) and coverage guidelines against the claimant&apos;s substantiated clinical record. Highlighted sections demonstrate explicit compliance with coverage criteria and establish payer criteria misapplication.
      </p>

      {/* List of CPB Items */}
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="border border-slate-300 rounded-md p-4 bg-slate-50/50 space-y-3 text-xs [page-break-inside:avoid] [break-inside:avoid]"
          >
            {/* Header / Citation Bar */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded text-[10.5px]">
                    Exhibit B.{idx + 1}
                  </span>
                  <h3 className="font-bold text-slate-950 text-xs sm:text-[13px]">
                    {item.title}
                  </h3>
                </div>
                <div className="text-[11px] font-mono text-blue-900 font-medium">
                  {item.citationClause}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.relevanceScore && (
                  <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold">
                    {item.relevanceScore}% Policy Match
                  </span>
                )}
                {item.sourceUrl && !isPrintMode && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-primary p-1"
                    title="View official policy source"
                  >
                    <ArrowSquareOut className="size-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Quoted Policy Text */}
            <div className="space-y-1 bg-white p-3 rounded border border-slate-200">
              <div className="text-[10.5px] font-bold uppercase text-slate-600">
                Published Clinical Coverage Criteria:
              </div>
              <blockquote className="border-l-3 border-primary/70 pl-2.5 text-xs text-slate-800 leading-relaxed italic bg-slate-50/70 p-2 rounded-r">
                &quot;{item.content}&quot;
              </blockquote>
            </div>

            {/* Highlighted Policy Violations / Contradictions */}
            {item.highlightedViolations && item.highlightedViolations.length > 0 && (
              <div className="p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-950 space-y-1.5">
                <div className="font-bold text-[11.5px] flex items-center gap-1.5">
                  <WarningOctagon className="size-3.5 text-rose-700" />
                  <span>Demonstrated Criteria Misapplication & Payer Contradictions</span>
                </div>
                <ul className="space-y-1 pl-1">
                  {item.highlightedViolations.map((viol, vIdx) => (
                    <li key={vIdx} className="flex items-start gap-1.5 text-[11px] text-slate-900">
                      <span className="size-1.5 rounded-full bg-rose-600 shrink-0 mt-1.5" />
                      <span>{viol}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
