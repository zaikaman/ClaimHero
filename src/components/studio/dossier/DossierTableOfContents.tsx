import React from "react";
import { ListNumbers, ArrowSquareOut } from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";

interface DossierTableOfContentsProps {
  dossier: DossierData;
  onNavigateSection?: (sectionId: string) => void;
  isPrintMode?: boolean;
}

export const DossierTableOfContents: React.FC<DossierTableOfContentsProps> = ({
  dossier,
  onNavigateSection,
  isPrintMode = false,
}) => {
  const tocEntries = [
    {
      id: "section-docket-cover",
      numeral: "I.",
      title: "Standardized Cover Page & Payer EDI Docket Header",
      detail: `Payer EDI ID: ${dossier.payerEdiId} • Member ID: ${dossier.memberId} • Disputed Amount: $${dossier.deniedAmount.toLocaleString()}`,
      page: "Page 1",
    },
    {
      id: "section-statutory-summary",
      numeral: "II.",
      title: "Statutory Rights Summary & Regulatory Posture",
      detail: `ERISA 29 CFR § 2560.503-1 • ACA § 2719 • ${dossier.statutoryAuthorities.length} Controlling Authorities`,
      page: "Page 2",
    },
    {
      id: "section-appeal-brief",
      numeral: "III.",
      title: "Substantive Medical Necessity Brief & Clinical Rebuttal",
      detail: `Clinical arguments, treating clinician consultation notes, and legal necessity rebuttal`,
      page: "Page 3",
    },
    {
      id: "section-exhibit-index",
      numeral: "IV.",
      title: "Master Evidentiary Exhibit Index",
      detail: "Complete catalog of attached adverse notices, clinical bulletins, and peer-reviewed literature",
      page: "Page 4",
    },
    {
      id: "section-exhibit-a",
      numeral: "  •",
      title: "Exhibit A: Original Adverse Benefit Determination Notice",
      detail: `Denial Code ${dossier.denialReasonCode} • Service Date: ${dossier.serviceDate} • Remittance Record`,
      page: "Exhibit A-1",
      isSubItem: true,
    },
    {
      id: "section-exhibit-b",
      numeral: "  •",
      title: `Exhibit B: Payer Clinical Policy Bulletin (${dossier.payerName} Criteria Violations)`,
      detail: `${dossier.exhibitB_PolicyBulletins.length} Policy Clauses • Highlighted Threshold Violations & Contradictions`,
      page: "Exhibit B-1",
      isSubItem: true,
    },
    {
      id: "section-exhibit-c",
      numeral: "  •",
      title: "Exhibit C: Peer-Reviewed PubMed Studies & FDA Indications",
      detail: `${dossier.exhibitC_MedicalLiterature.length} Indexed Studies • Efficacy Precedents & Clinical Indications`,
      page: "Exhibit C-1",
      isSubItem: true,
    },
    {
      id: "section-physician-attestation",
      numeral: "V.",
      title: "Formal Physician Attestation & Signature Block",
      detail: `Treating Clinician ${dossier.physicianInfo.name} • 29 CFR § 2560.503-1 Declaration of Medical Necessity`,
      page: "Attestation",
    },
  ];

  return (
    <div
      id="section-toc"
      className="dossier-toc-page bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-4 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
    >
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListNumbers className="size-4.5 text-slate-900" />
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Table of Contents & Master Appellate Index
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-600">Docket #{dossier.docketNumber}</span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed italic">
        This appeal binder contains the complete substantive evidentiary record, policy cross-walk, and clinical literature supporting the immediate overturn of Claim #{dossier.exhibitA_Notice.claimNumber}.
      </p>

      {/* Structured Legal TOC Listing */}
      <div className="space-y-2 pt-2">
        {tocEntries.map((entry) => (
          <div
            key={entry.id}
            onClick={() => {
              if (onNavigateSection) onNavigateSection(entry.id);
            }}
            className={`group flex items-baseline justify-between gap-2 p-1.5 rounded transition-colors ${
              entry.isSubItem ? "pl-5 sm:pl-8 text-xs" : "font-bold text-xs sm:text-[13px] bg-slate-50/70 border border-slate-200/60"
            } ${onNavigateSection ? "cursor-pointer hover:bg-slate-100" : ""}`}
          >
            <div className="flex items-baseline gap-2 min-w-0 flex-1">
              <span className="font-mono text-slate-500 shrink-0">{entry.numeral}</span>
              <div className="min-w-0">
                <span className="text-slate-900 group-hover:text-primary transition-colors">
                  {entry.title}
                </span>
                {!entry.isSubItem && entry.detail && (
                  <div className="text-[11px] font-normal text-slate-500 truncate">
                    {entry.detail}
                  </div>
                )}
              </div>
            </div>

            {/* Dotted Leader Line in Print & Desktop */}
            <div className="hidden sm:block flex-1 border-b border-dotted border-slate-400 mx-2 mb-1" />

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[11px] font-semibold text-slate-700">
                {entry.page}
              </span>
              {!isPrintMode && onNavigateSection && (
                <ArrowSquareOut className="size-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
