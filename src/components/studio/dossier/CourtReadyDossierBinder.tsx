import React from "react";
import { DossierData } from "../../../lib/dossierBuilder";
import { DossierCoverPage } from "./DossierCoverPage";
import { DossierTableOfContents } from "./DossierTableOfContents";
import { DossierStatutorySummary } from "./DossierStatutorySummary";
import { DossierExhibitIndex } from "./DossierExhibitIndex";
import { DossierExhibitA } from "./DossierExhibitA";
import { DossierExhibitB } from "./DossierExhibitB";
import { DossierExhibitC } from "./DossierExhibitC";
import { DossierPhysicianAttestation } from "./DossierPhysicianAttestation";
import { AppealBriefRenderer } from "../AppealBriefRenderer";
import { Scales } from "@phosphor-icons/react";

interface CourtReadyDossierBinderProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const CourtReadyDossierBinder: React.FC<CourtReadyDossierBinderProps> = ({
  dossier,
  isPrintMode = false,
}) => {
  const handleScrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="court-ready-dossier-binder space-y-8 print:space-y-0 text-slate-900 bg-white font-sans">
      {/* 1. Standardized Cover Page & Payer EDI Docket Header */}
      <section id="section-docket-cover">
        <DossierCoverPage dossier={dossier} isPrintMode={isPrintMode} />
      </section>

      {/* 2. Master Table of Contents */}
      <section id="section-toc">
        <DossierTableOfContents
          dossier={dossier}
          onNavigateSection={isPrintMode ? undefined : handleScrollToSection}
          isPrintMode={isPrintMode}
        />
      </section>

      {/* 3. Statutory Rights Summary & Regulatory Posture */}
      <section id="section-statutory-summary">
        <DossierStatutorySummary dossier={dossier} isPrintMode={isPrintMode} />
      </section>

      {/* 4. Substantive Appeal Memorandum & Medical Necessity Brief */}
      <section
        id="section-appeal-brief"
        className="dossier-substantive-brief bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-4 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
      >
        <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scales className="size-4.5 text-slate-900" />
            <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
              Substantive Medical Necessity Appeal Memorandum
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-600">
            {dossier.statutoryLevel.toUpperCase()}
          </span>
        </div>

        <div className="text-xs leading-relaxed text-slate-800">
          {dossier.fullAppealMarkdown ? (
            <AppealBriefRenderer content={dossier.fullAppealMarkdown} isPrintMode={true} />
          ) : (
            <div className="py-6 text-center text-slate-400 italic">
              No brief markdown synthesized yet. The structured medical necessity arguments and clinical facts are referenced in the exhibits.
            </div>
          )}
        </div>
      </section>

      {/* 5. Master Evidentiary Exhibit Index */}
      <section id="section-exhibit-index">
        <DossierExhibitIndex
          dossier={dossier}
          onNavigateSection={isPrintMode ? undefined : handleScrollToSection}
          isPrintMode={isPrintMode}
        />
      </section>

      {/* 6. Exhibit A: Original Adverse Benefit Determination Notice */}
      <section id="section-exhibit-a">
        <DossierExhibitA dossier={dossier} isPrintMode={isPrintMode} />
      </section>

      {/* 7. Exhibit B: Payer Clinical Policy Bulletins & Criteria Violations */}
      <section id="section-exhibit-b">
        <DossierExhibitB dossier={dossier} isPrintMode={isPrintMode} />
      </section>

      {/* 8. Exhibit C: Peer-Reviewed PubMed Studies & FDA Indications */}
      <section id="section-exhibit-c">
        <DossierExhibitC dossier={dossier} isPrintMode={isPrintMode} />
      </section>

      {/* 9. Formal Physician Attestation & Signature Block */}
      <section id="section-physician-attestation">
        <DossierPhysicianAttestation dossier={dossier} isPrintMode={isPrintMode} />
      </section>
    </div>
  );
};
