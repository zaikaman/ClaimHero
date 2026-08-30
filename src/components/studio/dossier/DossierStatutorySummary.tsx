import React from "react";
import {
  Gavel,
  ShieldCheck,
  WarningCircle,
  CheckCircle,
} from "@phosphor-icons/react";
import { DossierData } from "../../../lib/dossierBuilder";

interface DossierStatutorySummaryProps {
  dossier: DossierData;
  isPrintMode?: boolean;
}

export const DossierStatutorySummary: React.FC<DossierStatutorySummaryProps> = ({
  dossier,
  isPrintMode: _isPrintMode = false,
}) => {
  return (
    <div
      id="section-statutory-summary"
      className="dossier-statutory-page bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 space-y-4 shadow-xs [page-break-after:always] [break-after:page] print:border-none print:p-0 print:shadow-none"
    >
      <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gavel className="size-4.5 text-slate-900" />
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-950">
            Statutory Rights Summary & Controlling Regulatory Posture
          </h2>
        </div>
        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-300">
          Tier: {dossier.statutoryLevel.toUpperCase()}
        </span>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3.5 space-y-1 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-amber-950">
          <WarningCircle className="size-4 text-amber-700 shrink-0" />
          <span>Statutory Notice of Rights under Federal & State Law</span>
        </div>
        <p className="text-slate-800 leading-relaxed">
          Pursuant to 29 U.S.C. § 1133, 29 CFR § 2560.503-1, and 45 CFR § 147.136, the claimant is entitled to a full, fair, and prompt review of this adverse benefit determination without deference to the initial adverse reviewer. Withholding clinical review criteria, relying on non-specialist paper reviews, or unreasonable delay constitutes a statutory procedural violation.
        </p>
      </div>

      {/* Controlling Authorities Grid */}
      <div className="space-y-3 pt-1">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" />
          <span>Controlling Statutory Authorities Incorporated Herein</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {dossier.statutoryAuthorities.map((auth, idx) => (
            <div
              key={idx}
              className="border border-slate-200 rounded-md p-3 bg-slate-50/60 space-y-1 [page-break-inside:avoid] [break-inside:avoid]"
            >
              <div className="font-bold text-slate-950 flex items-center gap-1.5">
                <CheckCircle className="size-3.5 text-emerald-700 shrink-0" />
                <span>{auth}</span>
              </div>
              <p className="text-[11.5px] text-slate-600 leading-relaxed">
                Mandates strict compliance with published clinical evidence standards, disclosure of reviewer credentials, and full administrative due process.
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Statutory Timelines & Mandates Table */}
      <div className="border border-slate-300 rounded-md overflow-hidden bg-white text-xs pt-1">
        <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-300 font-bold text-slate-900 flex items-center justify-between">
          <span>Adjudication Standards & Mandatory Timelines</span>
          <span className="font-mono text-[10.5px] text-slate-600">45 CFR § 147.136</span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600 uppercase font-semibold">
              <th className="p-2.5">Procedural Requirement</th>
              <th className="p-2.5">Statutory Provision</th>
              <th className="p-2.5">Remedy for Non-Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-[11px]">
            <tr>
              <td className="p-2.5 font-medium text-slate-900">Same-Specialty Peer Review</td>
              <td className="p-2.5 font-mono text-slate-700">29 CFR § 2560.503-1(h)(3)(iii)</td>
              <td className="p-2.5 text-slate-700">Exclusion of adverse review & immediate de novo overturn</td>
            </tr>
            <tr>
              <td className="p-2.5 font-medium text-slate-900">Production of Review Criteria</td>
              <td className="p-2.5 font-mono text-slate-700">29 CFR § 2560.503-1(m)(8)</td>
              <td className="p-2.5 text-slate-700">Procedural forfeiture of non-disclosed criteria defenses</td>
            </tr>
            <tr>
              <td className="p-2.5 font-medium text-slate-900">Binding External Review</td>
              <td className="p-2.5 font-mono text-slate-700">45 CFR § 147.136</td>
              <td className="p-2.5 text-slate-700">State DOI / Independent Review Organization jurisdiction</td>
            </tr>
            <tr>
              <td className="p-2.5 font-medium text-slate-900">Prompt-Pay & Bad-Faith Interest</td>
              <td className="p-2.5 font-mono text-slate-700">State Insurance Code</td>
              <td className="p-2.5 text-slate-700">Mandatory statutory interest penalties & attorney fee-shifting</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
