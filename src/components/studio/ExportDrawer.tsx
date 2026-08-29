import React, { useState } from "react";
import {
  Printer,
  DownloadSimple,
  Copy,
  Check,
  PaperPlaneTilt,
  FileDoc,
} from "@phosphor-icons/react";
import { Claim, Appeal } from "../../types";
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
  const needsClinicalDocumentation =
    /does not independently document the patient-specific/i.test(markdownContent) &&
    !/Treating provider note submitted for review:/i.test(markdownContent);

  const getEmailText = () => {
    const printableText = document.querySelector<HTMLElement>(".printable-dossier")?.innerText.trim();
    return printableText || markdownContent;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getEmailText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([getEmailText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Appeal-Email-${claim.claimNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printable = document.querySelector<HTMLElement>(".printable-dossier");
    const printWindow = window.open("", "_blank");

    if (!printable || !printWindow) {
      window.print();
      return;
    }

    printWindow.opener = null;

    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((style) => style.outerHTML)
      .join("\n");

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Appeal of Adverse Benefit Determination</title>
          ${styles}
          <style>
            @page { size: letter portrait; margin: 0; }
            html, body { margin: 0; background: #fff; color: #0f172a; }
            body { font-family: Arial, Helvetica, sans-serif; }
            .printable-dossier { width: auto !important; max-width: none !important; padding: 14mm 16mm !important; margin: 0 !important; box-shadow: none !important; }
          </style>
        </head>
        <body>${printable.outerHTML}</body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    window.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-6 gap-4 print:h-auto print:max-w-none print:p-0 print:border-none print:shadow-none print:bg-white print:static print:inset-auto print:translate-x-0 print:translate-y-0">
        <DialogHeader className="border-b border-border pb-3 shrink-0 print:hidden no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FileDoc className="size-4.5" />
              </div>
              <div>
                <DialogTitle>Appeal Email Preview</DialogTitle>
                <DialogDescription className="font-mono">
                  Claim #{claim.claimNumber} • {appeal?.appealLevel?.replace(/_/g, " ").toUpperCase() || "LEVEL 1 INTERNAL"} • Draft v{appeal?.version || 1}
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
                <span>{copied ? "Copied" : "Copy Email"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="gap-1"
              >
                <DownloadSimple className="size-3" />
                  <span>Download .TXT</span>
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
                disabled={needsClinicalDocumentation}
                title={needsClinicalDocumentation ? "Add patient-specific clinical documentation and regenerate the email before dispatch." : undefined}
                className="gap-1"
              >
                <PaperPlaneTilt className="size-3" />
                <span>Proceed to Dispatch</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {needsClinicalDocumentation && (
          <div className="no-print rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            Add patient-specific clinical documentation, such as examination findings, imaging, functional limitations, or treatment history, then regenerate the email before dispatching it.
          </div>
        )}

        {/* Printable email viewport */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/30 rounded-xl border border-border print:p-0 print:border-none print:bg-transparent printable-dossier-scroll-area">
          <div className="max-w-3xl mx-auto bg-white text-slate-900 p-8 sm:p-10 rounded-lg shadow-sm font-sans print:p-0 print:shadow-none print:max-w-none print:w-full printable-dossier">
            <div className="text-xs leading-relaxed text-slate-800">
              {markdownContent ? (
                <AppealBriefRenderer content={markdownContent} isPrintMode={true} />
              ) : (
                <div className="text-center py-12 text-slate-400 italic">
                  No appeal email generated yet. Click &quot;Synthesize Brief&quot; in the studio to generate the email.
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
