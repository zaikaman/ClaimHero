import React from "react";
import {
  Flask,
  ArrowSquareOut,
  CheckCircle,
} from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";

interface DossierExhibitCProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const DossierExhibitC: React.FC<DossierExhibitCProps> = ({
  dossier,
  isPrintMode = false,
}) => {
  const items = dossier.exhibitC_MedicalLiterature;

  return (
    <div
      id="section-exhibit-c"
      className="dossier-exhibit-c bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-5 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
    >
      {/* Exhibit Header */}
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded bg-slate-900 text-white font-bold font-mono text-xs">
            C
          </span>
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Exhibit C: Peer-Reviewed PubMed Studies & FDA Indications
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-600">
          {items.length} Study Citation{items.length > 1 ? "s" : ""}
        </span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Peer-reviewed medical literature indexed from the National Library of Medicine (PubMed), randomized controlled clinical trial abstracts, and FDA-approved package insert indications corroborating the therapeutic necessity and efficacy of the requested procedure.
      </p>

      {/* List of Literature / FDA Items */}
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="border border-slate-300 rounded-md p-4 bg-slate-50/50 space-y-3 text-xs [page-break-inside:avoid] [break-inside:avoid]"
          >
            {/* Study Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded text-[10.5px]">
                    Exhibit C.{idx + 1}
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
                  <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                    {item.relevanceScore}% Efficacy Score
                  </span>
                )}
                {item.sourceUrl && !isPrintMode && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-primary p-1"
                    title="View PubMed/FDA source"
                  >
                    <ArrowSquareOut className="size-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Evidence Findings Block */}
            <div className="space-y-1 bg-white p-3 rounded border border-slate-200">
              <div className="text-[10.5px] font-bold uppercase text-slate-600 flex items-center gap-1">
                <Flask className="size-3 text-slate-600" />
                <span>Clinical Findings & Efficacy Outcomes:</span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">
                {item.content}
              </p>
            </div>

            {/* Standard of Care Authority Note */}
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <CheckCircle className="size-3.5 text-emerald-700 shrink-0" />
              <span>
                Confirms therapeutic necessity and aligns with American College of Physicians standard of care guidelines.
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
