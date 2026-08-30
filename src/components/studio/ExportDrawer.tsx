import React, { useState, useMemo } from "react";
import {
  Printer,
  DownloadSimple,
  Copy,
  Check,
  PaperPlaneTilt,
  FileDoc,
  ShieldCheck,
  Lock,
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
import { fastSanitizeText } from "../../lib/redactionEngine";
import { cn } from "../../lib/utils";

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
  const [isPublicExhibitRedacted, setIsPublicExhibitRedacted] = useState(false);

  const processedContent = useMemo(() => {
    if (!isPublicExhibitRedacted) return markdownContent;
    const res = fastSanitizeText(markdownContent, {
      standard: "PUBLIC_EXHIBIT",
      patientName: claim.patient?.name,
    });
    return res.sanitizedText;
  }, [markdownContent, isPublicExhibitRedacted, claim.patient?.name]);

  const needsClinicalDocumentation =
    /does not independently document the patient-specific/i.test(processedContent) &&
    !/Treating provider note submitted for review:/i.test(processedContent);

  const getEmailText = () => {
    const printableText = document.querySelector<HTMLElement>(".printable-dossier")?.innerText.trim();
    return printableText || processedContent;
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
    a.download = `${isPublicExhibitRedacted ? "Redacted-Exhibit-" : "Appeal-Email-"}${claim.claimNumber}.txt`;
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
            h1, h2, h3, h4, h5, h6 { page-break-after: avoid !important; break-after: avoid !important; }
            blockquote { page-break-inside: avoid !important; break-inside: avoid !important; }
            p { orphans: 3; widows: 3; }
            ul, ol { page-break-inside: avoid !important; break-inside: avoid !important; }
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
                  {appeal?.targetAuthority ? ` • ${appeal.targetAuthority}` : ""}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button
                variant={isPublicExhibitRedacted ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPublicExhibitRedacted(!isPublicExhibitRedacted)}
                className={cn(
                  "h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 transition-all",
                  isPublicExhibitRedacted
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="De-identify all patient direct identifiers, SSN, and member suffixes for public legal exhibits (HIPAA Safe Harbor)"
              >
                <ShieldCheck className="size-3.5" />
                <span>{isPublicExhibitRedacted ? "Exhibit Redacted" : "Redact Exhibit"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                <span>{copied ? "Copied" : "Copy Email"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
              >
                <DownloadSimple className="size-3" />
                <span>Download .TXT</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
              >
                <Printer className="size-3.5" />
                <span>Print / PDF</span>
              </Button>

              <Button
                size="sm"
                onClick={onProceedToDispatch}
                disabled={needsClinicalDocumentation}
                title={needsClinicalDocumentation ? "Add patient-specific clinical documentation and regenerate the email before dispatch." : undefined}
                className="h-8 rounded-md px-3.5 text-xs gap-1.5 shrink-0 bg-primary text-primary-foreground font-semibold shadow-xs"
              >
                <PaperPlaneTilt className="size-3.5" />
                <span>Proceed to Dispatch</span>
              </Button>
            </div>
          </div>

          {isPublicExhibitRedacted && (
            <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300">
              <Lock className="size-3.5 shrink-0 text-cyan-400" />
              <span>Public Exhibit De-identification Active: All patient names, member ID suffixes, SSNs, and direct identifiers are masked under HIPAA Safe Harbor (45 CFR § 164.514).</span>
            </div>
          )}
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
              {processedContent ? (
                <AppealBriefRenderer content={processedContent} isPrintMode={true} />
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
