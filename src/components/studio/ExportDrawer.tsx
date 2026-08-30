import React, { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Printer,
  DownloadSimple,
  Copy,
  Check,
  PaperPlaneTilt,
  FileDoc,
  ShieldCheck,
  Lock,
  FolderSimpleStar,
  FileText,
  Code,
} from "@phosphor-icons/react";
import { Claim, Appeal, ClinicalEvidence } from "../../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { AppealBriefRenderer } from "./AppealBriefRenderer";
import { CourtReadyDossierBinder } from "./dossier/CourtReadyDossierBinder";
import {
  buildDossierData,
  generatePlainTextDossier,
} from "../../lib/dossierBuilder";
import { fastSanitizeText } from "../../lib/redactionEngine";
import { cn } from "../../lib/utils";

const convexApi = api as any;

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
  const [viewMode, setViewMode] = useState<"binder" | "brief">("binder");

  // Fetch indexed clinical evidences for Exhibit B & C
  const rawEvidences = useQuery(
    convexApi.clinicalEvidences.listByClaim,
    claim?._id ? { claimId: claim._id as any } : "skip"
  ) as ClinicalEvidence[] | undefined;

  const processedContent = useMemo(() => {
    if (!isPublicExhibitRedacted) return markdownContent;
    const res = fastSanitizeText(markdownContent, {
      standard: "PUBLIC_EXHIBIT",
      patientName: claim.patient?.name,
    });
    return res.sanitizedText;
  }, [markdownContent, isPublicExhibitRedacted, claim.patient?.name]);

  const dossierData = useMemo(() => {
    return buildDossierData(
      claim,
      appeal
        ? { ...appeal, fullAppealMarkdown: processedContent }
        : null,
      rawEvidences || [],
      isPublicExhibitRedacted
    );
  }, [claim, appeal, processedContent, rawEvidences, isPublicExhibitRedacted]);

  const needsClinicalDocumentation =
    /does not independently document the patient-specific/i.test(processedContent) &&
    !/Treating provider note submitted for review:/i.test(processedContent);

  const getExportText = () => {
    if (viewMode === "binder") {
      return generatePlainTextDossier(dossierData);
    }
    const printableText = document.querySelector<HTMLElement>(".printable-dossier")?.innerText.trim();
    return printableText || processedContent;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getExportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const text = getExportText();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const prefix = isPublicExhibitRedacted ? "Redacted-" : "";
    const suffix = viewMode === "binder" ? "Court-Ready-Dossier-" : "Appeal-Brief-";
    a.download = `${prefix}${suffix}${claim.claimNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = () => {
    const printable = document.querySelector<HTMLElement>(".printable-dossier");
    if (!printable) return;

    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((style) => style.outerHTML)
      .join("\n");

    const htmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Court-Ready Appeal Dossier - Claim #${claim.claimNumber}</title>
    ${styles}
    <style>
      @page { size: letter portrait; margin: 12mm 15mm; }
      html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
      .printable-dossier { width: 100% !important; max-width: 900px !important; margin: 0 auto !important; padding: 10mm !important; }
      h1, h2, h3, h4, h5, h6 { page-break-after: avoid !important; break-after: avoid !important; }
      blockquote { page-break-inside: avoid !important; break-inside: avoid !important; }
      .dossier-cover-page, .dossier-toc-page, .dossier-statutory-page, .dossier-substantive-brief, .dossier-exhibit-index, .dossier-exhibit-a, .dossier-exhibit-b, .dossier-exhibit-c { page-break-after: always !important; break-after: page !important; }
      .dossier-physician-attestation { page-break-after: avoid !important; break-after: avoid !important; }
    </style>
  </head>
  <body>
    <div class="printable-dossier">
      ${printable.innerHTML}
    </div>
  </body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const prefix = isPublicExhibitRedacted ? "Redacted-" : "";
    a.download = `${prefix}Appeal-Dossier-${claim.claimNumber}.html`;
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
          <title>Court-Ready Appeal Dossier - Claim #${claim.claimNumber}</title>
          ${styles}
          <style>
            @page { size: letter portrait; margin: 12mm 14mm; }
            html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
            .printable-dossier { width: 100% !important; max-width: none !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
            h1, h2, h3, h4, h5, h6 { page-break-after: avoid !important; break-after: avoid !important; }
            blockquote { page-break-inside: avoid !important; break-inside: avoid !important; }
            p { orphans: 3; widows: 3; }
            ul, ol { page-break-inside: avoid !important; break-inside: avoid !important; }
            .dossier-cover-page,
            .dossier-toc-page,
            .dossier-statutory-page,
            .dossier-substantive-brief,
            .dossier-exhibit-index,
            .dossier-exhibit-a,
            .dossier-exhibit-b,
            .dossier-exhibit-c {
              page-break-after: always !important;
              break-after: page !important;
              margin-bottom: 0 !important;
            }
            .dossier-physician-attestation {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
          </style>
        </head>
        <body>
          <div class="printable-dossier">
            ${printable.innerHTML}
          </div>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    window.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl lg:max-w-6xl h-[92vh] flex flex-col p-6 gap-4 print:h-auto print:max-w-none print:p-0 print:border-none print:shadow-none print:bg-white print:static print:inset-auto print:translate-x-0 print:translate-y-0">
        <DialogHeader className="border-b border-border pb-3 shrink-0 print:hidden no-print space-y-3">
          {/* Top Row: Title, Badges, and Docket Reference */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FileDoc className="size-4.5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base font-bold text-foreground">
                    Court-Ready Appeal Dossier & Exhibit Binder
                  </DialogTitle>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-semibold">
                    Docket #{dossierData.docketNumber}
                  </span>
                  <span className="font-sans text-[10.5px] px-2 py-0.5 rounded bg-muted border border-border text-foreground/85 font-semibold uppercase">
                    {appeal?.appealLevel?.replace(/_/g, " ") || "Level 1 Internal"}
                  </span>
                  <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-semibold">
                    EDI {dossierData.payerEdiId}
                  </span>
                </div>
                <DialogDescription className="font-mono text-xs text-muted-foreground truncate">
                  Payer: {dossierData.payerName}
                  {appeal?.targetAuthority ? ` • Target: ${appeal.targetAuthority}` : ""}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Bottom Row: Mode Selector & Complete Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {/* Left: Mode Switcher & Redaction Toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-md bg-muted/80 p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => setViewMode("binder")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-all",
                    viewMode === "binder"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Full multi-page court-ready legal binder with Cover Page, TOC, Statutory Summary, Exhibits A-C, and Attestation"
                >
                  <FolderSimpleStar className="size-3.5" />
                  <span>Exhibit Binder</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("brief")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-all",
                    viewMode === "brief"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Concise medical necessity brief tailored for direct email or portal transmission"
                >
                  <FileText className="size-3.5" />
                  <span>Appeal Brief</span>
                </button>
              </div>

              {/* Redaction Toggle */}
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
                title="De-identify all patient direct identifiers, SSN, and member suffixes for public legal exhibits (HIPAA Safe Harbor 45 CFR § 164.514)"
              >
                <ShieldCheck className="size-3.5" />
                <span>{isPublicExhibitRedacted ? "Exhibit Redacted" : "Redact Exhibit"}</span>
              </Button>
            </div>

            {/* Right: Action Toolbar */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
                title="Copy structured text to clipboard"
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTxt}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
                title="Download plain text dossier (.txt)"
              >
                <DownloadSimple className="size-3" />
                <span>.TXT</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadHtml}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
                title="Download standalone court-ready HTML document (.html)"
              >
                <Code className="size-3" />
                <span>.HTML</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0"
                title="Print court-ready US Letter / A4 physical binder or save as PDF"
              >
                <Printer className="size-3.5" />
                <span>Print / PDF</span>
              </Button>

              <Button
                size="sm"
                onClick={onProceedToDispatch}
                disabled={needsClinicalDocumentation}
                title={needsClinicalDocumentation ? "Add patient-specific clinical documentation and regenerate before dispatch." : undefined}
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
              <span>Public Legal Exhibit De-identification Active: Direct identifiers, member numbers, and patient names are masked under HIPAA Safe Harbor (45 CFR § 164.514).</span>
            </div>
          )}
        </DialogHeader>

        {needsClinicalDocumentation && (
          <div className="no-print rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            Add patient-specific clinical documentation, such as examination findings, imaging, functional limitations, or treatment history, then regenerate before dispatching.
          </div>
        )}

        {/* Printable viewport */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/30 rounded-xl border border-border print:p-0 print:border-none print:bg-transparent printable-dossier-scroll-area">
          <div className="max-w-4xl mx-auto bg-white text-slate-900 p-6 sm:p-10 rounded-lg shadow-sm font-sans print:p-0 print:shadow-none print:max-w-none print:w-full printable-dossier">
            {viewMode === "binder" ? (
              <CourtReadyDossierBinder dossier={dossierData} isPrintMode={false} />
            ) : (
              <div className="text-xs leading-relaxed text-slate-800">
                {processedContent ? (
                  <AppealBriefRenderer content={processedContent} isPrintMode={true} />
                ) : (
                  <div className="text-center py-12 text-slate-400 italic">
                    No appeal email generated yet. Click &quot;Synthesize Brief&quot; in the studio to generate the brief.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
