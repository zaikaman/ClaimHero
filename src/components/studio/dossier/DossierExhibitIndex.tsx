import React from "react";
import { FolderSimpleStar } from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";

interface DossierExhibitIndexProps {
  dossier: DossierData;
  onNavigateSection?: (sectionId: string) => void;
  isPrintMode?: boolean;
}

export const DossierExhibitIndex: React.FC<DossierExhibitIndexProps> = ({
  dossier,
  onNavigateSection,
  isPrintMode: _isPrintMode = false,
}) => {
  const exhibits = [
    {
      id: "section-exhibit-a",
      letter: "A",
      title: `Original Adverse Benefit Determination Notice (Claim #${dossier.exhibitA_Notice.claimNumber})`,
      source: `${dossier.payerName} Claims Remittance & Denial Department`,
      purpose: "Establishes CARC denial code, service date, amount at issue, and initial adverse rationale.",
      itemCount: 1,
      pageRef: "Exhibit A-1",
    },
    {
      id: "section-exhibit-b",
      letter: "B",
      title: `Payer Clinical Policy Bulletin (${dossier.payerName} Criteria Cross-Walk)`,
      source: `${dossier.payerName} Medical Directorate / Published Policy Bulletins`,
      purpose: "Demonstrates that claimant meets all published medical necessity criteria and identifies payer criteria violations.",
      itemCount: dossier.exhibitB_PolicyBulletins.length,
      pageRef: "Exhibit B-1",
    },
    {
      id: "section-exhibit-c",
      letter: "C",
      title: "Peer-Reviewed PubMed Clinical Literature & FDA Indications",
      source: "National Library of Medicine (PubMed) & FDA Package Inserts",
      purpose: "Corroborates clinical efficacy, prevailing standard of care, and safety indications in medical literature.",
      itemCount: dossier.exhibitC_MedicalLiterature.length,
      pageRef: "Exhibit C-1",
    },
  ];

  return (
    <div
      id="section-exhibit-index"
      className="dossier-exhibit-index bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-4 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
    >
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderSimpleStar className="size-4.5 text-slate-900" />
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Master Evidentiary Exhibit Index
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-600">3 Exhibit Sets Attached</span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        The following evidentiary exhibits are formally indexed and incorporated into this appeal dossier. Each exhibit establishes statutory compliance, clinical necessity, and controlling precedent for Claim #{dossier.exhibitA_Notice.claimNumber}.
      </p>

      {/* Exhibit Index Table */}
      <div className="border border-slate-300 rounded-md overflow-hidden bg-white text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-[11px] text-slate-700 uppercase font-bold">
              <th className="p-2.5 w-16 text-center">Exhibit</th>
              <th className="p-2.5">Document Title & Identification</th>
              <th className="p-2.5 hidden md:table-cell">Issuing Authority / Source</th>
              <th className="p-2.5 hidden sm:table-cell">Evidentiary Purpose</th>
              <th className="p-2.5 text-right w-24">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {exhibits.map((ex) => (
              <tr
                key={ex.id}
                onClick={() => {
                  if (onNavigateSection) onNavigateSection(ex.id);
                }}
                className={`group ${onNavigateSection ? "cursor-pointer hover:bg-slate-50" : ""}`}
              >
                <td className="p-2.5 text-center">
                  <span className="inline-flex size-7 items-center justify-center rounded-md font-bold font-mono text-xs bg-slate-900 text-white group-hover:bg-primary transition-colors">
                    {ex.letter}
                  </span>
                </td>
                <td className="p-2.5">
                  <div className="font-bold text-slate-900 group-hover:text-primary transition-colors">
                    {ex.title}
                  </div>
                  <div className="text-[10.5px] text-slate-500 md:hidden mt-0.5">
                    {ex.source}
                  </div>
                </td>
                <td className="p-2.5 text-[11.5px] text-slate-700 hidden md:table-cell">
                  {ex.source}
                </td>
                <td className="p-2.5 text-[11.5px] text-slate-600 hidden sm:table-cell">
                  {ex.purpose}
                </td>
                <td className="p-2.5 text-right">
                  <span className="font-mono font-semibold text-[11px] text-slate-800 group-hover:text-primary transition-colors">
                    {ex.pageRef}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
