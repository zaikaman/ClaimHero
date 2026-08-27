import React, { useState } from "react";
import {
  Printer,
  DownloadSimple,
  Copy,
  Check,
  PaperPlaneTilt,
  FileDoc,
  Buildings,
  Calendar,
  CurrencyDollar,
  User,
} from "@phosphor-icons/react";
import { Claim, Appeal } from "../../types";
import { formatCurrency, formatDate } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { AppealBriefRenderer } from "./AppealBriefRenderer";

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-6 gap-4">
        <DialogHeader className="border-b border-border pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FileDoc className="size-4.5" />
              </div>
              <div>
                <DialogTitle>Formal Appeal Dossier Export</DialogTitle>
                <DialogDescription className="font-mono">
                  Claim #{claim.claimNumber} • {appeal?.appealLevel?.replace(/_/g, " ").toUpperCase() || "LEVEL 1 INTERNAL"} (v{appeal?.version || 1})
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1"
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                <span>{copied ? "Copied" : "Copy Brief"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="gap-1"
              >
                <DownloadSimple className="size-3" />
                <span>Download .MD</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1"
              >
                <Printer className="size-3" />
                <span>Print / PDF</span>
              </Button>

              <Button
                size="sm"
                onClick={onProceedToDispatch}
                className="gap-1"
              >
                <PaperPlaneTilt className="size-3" />
                <span>Proceed to Dispatch</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Formal Printable Document Viewport */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/30 rounded-xl border border-border">
          <div className="max-w-3xl mx-auto bg-white text-slate-900 p-8 sm:p-10 rounded-lg shadow-sm font-sans space-y-6 print:p-0 print:shadow-none">
            {/* Letterhead */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-950">
                  FORMAL NOTICE OF MEDICAL APPEAL & DEMAND FOR REIMBURSEMENT
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Pursuant to ERISA 29 CFR § 2560.503-1 & Patient Protection and Affordable Care Act § 2719
                </p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Date: {formatDate(Date.now())}</div>
                <div className="font-bold text-slate-900">PRIORITY REVIEW</div>
              </div>
            </div>

            {/* Case & Policy Meta Summary */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded border border-slate-200 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5 text-slate-600" />
                  <span><strong>Patient:</strong> {claim.patient?.name}</span>
                </div>
                <div><strong>Member ID:</strong> {claim.patient?.memberId}</div>
                <div><strong>Group Number:</strong> {claim.patient?.groupNumber || "Standard Employer Plan"}</div>
                <div><strong>Treating Provider:</strong> {claim.providerName}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Buildings className="size-3.5 text-slate-600" />
                  <span><strong>Health Plan:</strong> {claim.patient?.insurancePayer}</span>
                </div>
                <div><strong>Claim Number:</strong> {claim.claimNumber}</div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-slate-600" />
                  <span><strong>Date of Service:</strong> {formatDate(claim.serviceDate)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-700 font-bold">
                  <CurrencyDollar className="size-3.5" />
                  <span>Disputed Amount: {formatCurrency(claim.deniedAmount)}</span>
                </div>
              </div>
            </div>

            {/* Rendered Full Markdown Text */}
            <div className="text-xs leading-relaxed text-slate-800">
              {markdownContent ? (
                <AppealBriefRenderer content={markdownContent} isPrintMode={true} />
              ) : (
                <div className="text-center py-12 text-slate-400 italic">
                  No appeal brief generated yet. Click &quot;Synthesize Brief&quot; in the studio to generate with gpt-5-nano.
                </div>
              )}
            </div>

            {/* Formal Signoff */}
            <div className="pt-6 border-t border-slate-200 text-xs text-slate-700 space-y-4">
              <div>Respectfully submitted on behalf of the Claimant,</div>
              <div className="pt-2 space-y-0.5 font-bold text-slate-900">
                <div>{claim.patient?.name || "Claimant / Authorized Representative"}</div>
                <div className="text-slate-600 font-normal">Contact: {claim.assignedAgentEmail}</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
