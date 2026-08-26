import React, { useState } from "react";
import {
  X,
  Printer,
  Download,
  Copy,
  Check,
  Send,
  FileCheck,
  Building2,
  Calendar,
  DollarSign,
  User,
} from "lucide-react";
import { Claim, Appeal } from "../../types";
import { formatCurrency, formatDate } from "../../lib/utils";

interface ExportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim;
  appeal: Appeal | null;
  markdownContent: string;
  onProceedToDispatch: () => void;
}

export const ExportDrawer: React.FC<ExportDrawerProps> = ({
  isOpen,
  onClose,
  claim,
  appeal,
  markdownContent,
  onProceedToDispatch,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Appeal-Dossier-${claim.claimNumber}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl border border-cyan-500/40 bg-slate-950 p-6 shadow-2xl shadow-cyan-500/10 text-slate-100 font-sans overflow-hidden">
        {/* Header Controls */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <FileCheck className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Formal Medical Appeal Dossier Export
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Claim #{claim.claimNumber} • {appeal?.appealLevel?.replace(/_/g, " ").toUpperCase() || "LEVEL 1 INTERNAL APPEAL"} (v{appeal?.version || 1})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy Brief"}</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download .MD</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onProceedToDispatch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 transition-transform"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Proceed to Dispatch</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Formal Document Preview Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/40 rounded-xl my-4 border border-slate-800/80">
          <div className="max-w-3xl mx-auto bg-white text-slate-900 p-8 sm:p-12 rounded shadow-xl font-serif space-y-6 print:p-0 print:shadow-none">
            {/* Letterhead */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-950 font-sans">
                  FORMAL NOTICE OF MEDICAL APPEAL & DEMAND FOR REIMBURSEMENT
                </h1>
                <p className="text-xs text-slate-600 font-sans mt-0.5">
                  Pursuant to ERISA 29 CFR § 2560.503-1 & Patient Protection and Affordable Care Act § 2719
                </p>
              </div>
              <div className="text-right text-xs font-sans text-slate-600">
                <div>Date: {formatDate(Date.now())}</div>
                <div className="font-bold text-slate-900">PRIORITY REVIEW DEMAND</div>
              </div>
            </div>

            {/* Case & Policy Meta Table */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded border border-slate-200 text-xs font-sans">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-600" />
                  <span><strong>Claimant / Patient:</strong> {claim.patient?.name}</span>
                </div>
                <div><strong>Member ID:</strong> {claim.patient?.memberId}</div>
                <div><strong>Group Number:</strong> {claim.patient?.groupNumber || "Standard Employer Plan"}</div>
                <div><strong>Treating Provider:</strong> {claim.providerName}</div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-600" />
                  <span><strong>Health Plan:</strong> {claim.patient?.insurancePayer} (Grievances)</span>
                </div>
                <div><strong>Claim Number:</strong> {claim.claimNumber}</div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-600" />
                  <span><strong>Date of Service:</strong> {formatDate(claim.serviceDate)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-700 font-bold">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>Disputed Amount: {formatCurrency(claim.deniedAmount)}</span>
                </div>
              </div>
            </div>

            {/* Rendered Full Markdown Text */}
            <div className="prose prose-slate max-w-none text-xs leading-relaxed font-sans whitespace-pre-line">
              {markdownContent || (
                <div className="text-center py-12 text-slate-400 italic">
                  No appeal brief generated yet. Click &quot;Synthesize Full Appeal Brief&quot; in the studio to generate with gpt-5-nano.
                </div>
              )}
            </div>

            {/* Formal Signoff */}
            <div className="pt-6 border-t border-slate-200 text-xs font-sans text-slate-700 space-y-4">
              <div>
                Respectfully submitted on behalf of the Claimant,
              </div>
              <div className="pt-4 space-y-1 font-bold text-slate-900">
                <div>{claim.patient?.name || "Claimant / Authorized Representative"}</div>
                <div className="text-slate-600 font-normal">Dedicated Case Contact: {claim.assignedAgentEmail}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
