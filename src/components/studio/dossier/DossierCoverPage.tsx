import React from "react";
import {
  Scales,
  ShieldCheck,
  Buildings,
  User,
  Receipt,
  Hash,
  CalendarBlank,
} from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";
import { formatCurrency } from "../../../lib/utils";

interface DossierCoverPageProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const DossierCoverPage: React.FC<DossierCoverPageProps> = ({
  dossier,
  isPrintMode: _isPrintMode = false,
}) => {
  return (
    <div className="dossier-cover-page bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-6 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none">
      {/* Formal Appellate Docket Header */}
      <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1.5">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Scales className="size-5 text-slate-900 print:text-black" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
            Administrative Appeal & Legal Exhibit Docket
          </span>
        </div>
        <h1 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight uppercase">
          Formal Petition for Reconsideration & Overturn of Adverse Determination
        </h1>
        <div className="flex items-center justify-center gap-3 text-xs font-mono text-slate-600 flex-wrap">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
            <Hash className="size-3.5" />
            <span>Docket Reference: {dossier.docketNumber}</span>
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <CalendarBlank className="size-3.5" />
            <span>Filing Date: {dossier.filingDate}</span>
          </span>
          <span>•</span>
          <span className="px-2 py-0.5 rounded bg-slate-100 font-sans font-bold text-[10px] text-slate-900 border border-slate-300 uppercase">
            {dossier.statutoryLevelLabel}
          </span>
        </div>
      </div>

      {/* Target Authority Banner */}
      <div className="bg-slate-50 border border-slate-300 rounded-md p-3 text-center space-y-0.5">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Designated Adjudication Authority
        </div>
        <div className="text-xs sm:text-sm font-bold text-slate-950 font-serif">
          {dossier.targetAuthority}
        </div>
        <div className="text-[11px] text-slate-600">
          Governed under ERISA 29 CFR § 2560.503-1 & ACA 45 CFR § 147.136 Standards
        </div>
      </div>

      {/* 2-Column Metadata Grid: Payer & Patient Identifiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payer Identifier & EDI Box */}
        <div className="border border-slate-300 rounded-md p-3.5 bg-white space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
              <Buildings className="size-3.5 text-slate-700" />
              <span>Target Payer & EDI Gateway</span>
            </div>
            <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-bold">
              EDI ID: {dossier.payerEdiId}
            </span>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Payer Name:</span>
              <span className="font-semibold text-slate-900">{dossier.payerName}</span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-slate-500 shrink-0">Appeals PO Box:</span>
              <span className="font-medium text-slate-800 text-right text-[11px] leading-tight">
                {dossier.payerAppealsAddress}
              </span>
            </div>
            {dossier.payerAppealsFax && (
              <div className="flex justify-between">
                <span className="text-slate-500">Appeals Fax:</span>
                <span className="font-mono text-slate-800">{dossier.payerAppealsFax}</span>
              </div>
            )}
            {dossier.payerAppealsEmail && (
              <div className="flex justify-between">
                <span className="text-slate-500">Appeals Ingestion:</span>
                <span className="font-mono text-[10.5px] text-blue-900">{dossier.payerAppealsEmail}</span>
              </div>
            )}
          </div>
        </div>

        {/* Patient / Beneficiary Box */}
        <div className="border border-slate-300 rounded-md p-3.5 bg-white space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
              <User className="size-3.5 text-slate-700" />
              <span>Insured Beneficiary / Patient</span>
            </div>
            {dossier.isRedacted && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-300 text-cyan-900 font-semibold">
                HIPAA Safe Harbor Masked
              </span>
            )}
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Patient Name:</span>
              <span className="font-bold text-slate-900">{dossier.patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Member ID:</span>
              <span className="font-mono font-semibold text-slate-900">{dossier.memberId}</span>
            </div>
            {dossier.groupNumber && (
              <div className="flex justify-between">
                <span className="text-slate-500">Group Number:</span>
                <span className="font-mono text-slate-800">{dossier.groupNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Jurisdiction / State:</span>
              <span className="font-medium text-slate-800">{dossier.state}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Treating Provider & Financial Accounting Matrix */}
      <div className="border border-slate-300 rounded-md overflow-hidden bg-white">
        <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <Receipt className="size-3.5 text-slate-700" />
            <span>Disputed Service & Financial Liability Breakdown</span>
          </div>
          <span className="text-[11px] font-mono text-slate-600">
            Service Date: {dossier.serviceDate}
          </span>
        </div>

        <div className="p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-200 text-xs">
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Treating Clinician</div>
            <div className="font-bold text-slate-900 truncate">{dossier.providerName}</div>
            <div className="text-[10px] text-slate-600">NPI: {dossier.physicianInfo.npiNumber}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Procedure (CPT)</div>
            <div className="font-mono font-bold text-slate-900">{dossier.cptCodes.join(", ") || "27447"}</div>
            <div className="text-[10px] text-slate-600">Diagnosis: {dossier.icd10Codes.join(", ") || "M17.11"}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Adverse Denial Code</div>
            <div className="font-mono font-bold text-rose-800">{dossier.denialReasonCode}</div>
            <div className="text-[10px] text-slate-600 truncate">{dossier.denialReasonDescription}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Denied Claim Amount</div>
            <div className="font-mono font-bold text-slate-950 text-sm">
              {formatCurrency(dossier.deniedAmount)}
            </div>
            <div className="text-[10px] text-slate-600">
              Patient Liability: {formatCurrency(dossier.patientLiability)}
            </div>
          </div>
        </div>

        {/* Executive Determination Summary Box */}
        <div className="p-3.5 bg-slate-50 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <ShieldCheck className="size-3.5 text-primary shrink-0" />
            <span>Formal Statement of Overturn & Remedy Demanded</span>
          </div>
          <p className="text-xs text-slate-800 leading-relaxed">
            {dossier.executiveSummary ||
              `Reconsideration and complete reversal of the adverse benefit determination for Claim #${dossier.exhibitA_Notice.claimNumber} is formally demanded. As detailed in the attached brief and evidentiary exhibits (A, B, and C), the requested service satisfies all published medical necessity criteria under prevailing clinical standards.`}
          </p>
        </div>
      </div>
    </div>
  );
};
