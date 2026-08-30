import React from "react";
import { WarningOctagon } from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";
import { formatCurrency } from "../../../lib/utils";

interface DossierExhibitAProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const DossierExhibitA: React.FC<DossierExhibitAProps> = ({
  dossier,
  isPrintMode: _isPrintMode = false,
}) => {
  const notice = dossier.exhibitA_Notice;

  return (
    <div
      id="section-exhibit-a"
      className="dossier-exhibit-a bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-4 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
    >
      {/* Exhibit Header */}
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded bg-slate-900 text-white font-bold font-mono text-xs">
            A
          </span>
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Exhibit A: Original Adverse Benefit Determination Notice
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-600">Claim #{notice.claimNumber}</span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Certified true copy of the adverse benefit determination and electronic remittance notice issued by {dossier.payerName} regarding Claim #{notice.claimNumber}.
      </p>

      {/* Structured Adverse Notice Sheet */}
      <div className="border-2 border-slate-300 rounded-md p-4 bg-slate-50/50 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-300 pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <WarningOctagon className="size-4.5 text-rose-600 shrink-0" />
            <span className="font-bold text-slate-950 text-xs sm:text-sm">
              Notice of Adverse Action & Claim Disallowance
            </span>
          </div>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-900 font-bold">
            DENIED • CARC {notice.denialReasonCode}
          </span>
        </div>

        {/* Claim Accounting Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-3.5 rounded border border-slate-200">
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Claim Reference</div>
            <div className="font-mono font-bold text-slate-900">#{notice.claimNumber}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Date of Service</div>
            <div className="font-semibold text-slate-900">{notice.serviceDate}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Adjudicating Insurer</div>
            <div className="font-semibold text-slate-900 truncate">{dossier.payerName}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Billed Amount</div>
            <div className="font-mono font-semibold text-slate-900">{formatCurrency(notice.deniedAmount)}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Allowed Benefit</div>
            <div className="font-mono font-semibold text-rose-700">$0.00 (100% Denied)</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500 font-medium">Patient Balance Disputed</div>
            <div className="font-mono font-bold text-slate-950">{formatCurrency(notice.patientOwedAmount)}</div>
          </div>
        </div>

        {/* Payer Stated Rationale */}
        <div className="space-y-1.5 bg-white p-3.5 rounded border border-slate-200">
          <div className="text-[11px] font-bold uppercase text-slate-700">
            Payer Stated Rationale for Adverse Action:
          </div>
          <div className="font-mono text-xs bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-900 leading-relaxed">
            &quot;{notice.denialReasonCode}: {notice.denialReasonDescription}&quot;
          </div>
        </div>

        {/* Evidentiary Flaw Analysis */}
        <div className="space-y-1.5 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-950">
          <div className="font-bold text-[11.5px] flex items-center gap-1.5">
            <WarningOctagon className="size-3.5 text-amber-800" />
            <span>Evidentiary & Procedural Flaws in Exhibit A Notice</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-800">
            <li>
              <strong>Lack of Specific Clinical Rationale:</strong> The denial notice fails to cite specific plan exclusions or clinical criteria threshold failures required by 29 CFR § 2560.503-1(g)(1)(i).
            </li>
            <li>
              <strong>Disregard of Documented Findings:</strong> The reviewer failed to evaluate firsthand diagnostic imaging, functional deterioration scores, and clinical treatment notes.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
