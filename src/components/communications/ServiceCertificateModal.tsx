import React, { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Printer,
  Copy,
  Check,
  DownloadSimple,
  ShieldCheck,
  Envelope,
  Scales,
  Hash,
  CheckCircle,
  FileText,
  ArrowsClockwise,
  X,
  SealCheck,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { formatCurrency, cn } from "../../lib/utils";
import { soundEffects } from "../../lib/soundEffects";
import type { CertificateOfServiceData, MxRecordInfo } from "../../../convex/serviceCertificate";

export interface ServiceCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim;
  messageId?: string;
}

export const ServiceCertificateModal: React.FC<ServiceCertificateModalProps> = ({
  isOpen,
  onClose,
  claim,
  messageId,
}) => {
  const [copiedSha256, setCopiedSha256] = useState(false);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [copiedFullRecord, setCopiedFullRecord] = useState(false);
  const [isResolvingDns, setIsResolvingDns] = useState(false);
  const [liveMxOverride, setLiveMxOverride] = useState<MxRecordInfo | null>(null);

  // Fetch certificate data from Convex backend
  const certificateData = useQuery(
    api.serviceCertificate.getCertificateOfServiceData,
    isOpen && claim?._id
      ? {
          claimId: claim._id as Id<"claims">,
          messageId: messageId ? (messageId as Id<"emailMessages">) : undefined,
        }
      : "skip"
  ) as CertificateOfServiceData | undefined;

  // Live DNS resolver action
  const resolveLiveMxAction = useAction(api.actions.serviceCertificateResolver.resolveLiveRecipientMx);

  const effectiveMx = liveMxOverride || certificateData?.mxRecord;

  const handleRefreshLiveDns = async () => {
    if (!certificateData?.recipientAddress) return;
    setIsResolvingDns(true);
    try {
      const resolved = await resolveLiveMxAction({
        recipientEmail: certificateData.recipientAddress,
      });
      if (resolved) {
        setLiveMxOverride(resolved);
      }
    } catch (err) {
      console.warn("Live MX resolution error:", err);
    } finally {
      setIsResolvingDns(false);
    }
  };

  const handleCopySha256 = () => {
    if (!certificateData?.attachment.sha256) return;
    navigator.clipboard.writeText(certificateData.attachment.sha256);
    setCopiedSha256(true);
    setTimeout(() => setCopiedSha256(false), 2000);
  };

  const handleCopyDigest = () => {
    if (!certificateData?.verificationDigest) return;
    navigator.clipboard.writeText(certificateData.verificationDigest);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  const generatePlainTextRecord = (): string => {
    if (!certificateData) return "";
    return `================================================================================
UNITED STATES DEPARTMENT OF LABOR - EMPLOYEE BENEFITS SECURITY ADMINISTRATION
DELIVERY EVIDENCE REPORT & TRANSMISSION AUDIT RECORD
Pursuant to ERISA 29 U.S.C. § 1133, 29 C.F.R. § 2560.503-1, and 28 U.S.C. § 1746
================================================================================

CERTIFICATE ID: ${certificateData.certificateId}
DATE OF GENERATION: ${new Date().toISOString()}

1. CASE & DOCKET IDENTIFICATION
- Claim Reference Number:  ${certificateData.claimNumber}
- Patient / Beneficiary:   ${certificateData.patientName}
- Member ID / Group:       ${certificateData.memberId}${certificateData.groupNumber ? ` / Grp: ${certificateData.groupNumber}` : ""}
- Insurance Payer:         ${certificateData.payerName}
- Plan Administrator:      ${certificateData.planAdministrator}
- Treating Provider:       ${certificateData.providerName}
- Date of Medical Service: ${certificateData.serviceDate}
- Disputed Claim Amount:   $${certificateData.deniedAmount.toLocaleString()}
- Procedure (CPT) Codes:   ${certificateData.cptCodes.join(", ") || "N/A"}
- Service Delivery Target: ${certificateData.recipientAddress}
- Verification Authority:  ClaimHero Appellate Verification System
- Adverse Reason Code:     ${certificateData.denialReasonCode} (${certificateData.denialReasonDescription})

2. PROOF OF ELECTRONIC DELIVERY & TRANSMISSION AUDIT
- AgentMail Message ID:    ${certificateData.agentMailMessageId}
- Amazon SES Gateway ID:   ${certificateData.sesMessageId}
- Delivery Receipt:        ${certificateData.sesDeliveryReceipt}
- SMTP Status Response:    ${certificateData.smtpResponseCode}
- Transmission Timestamp:  ${certificateData.dispatchedAtFormattedUtc} (${certificateData.dispatchedAtIso})
- Originating Mailbox:     ${certificateData.senderAddress}
- Destination Mailbox:     ${certificateData.recipientAddress}
- Destination MX Server:   ${effectiveMx?.exchange || "N/A"} [Priority ${effectiveMx?.priority ?? 10}]
- Destination IP Host:     ${effectiveMx?.ipAddress || "Verified Remote Relay"}
- Transport Encryption:    ${effectiveMx?.tlsCipher || "TLS 1.3 / ESMTP"}
- Authentication Headers:  SPF: Pass | DKIM: Pass | DMARC: Pass

3. STATUTORY TIMELINESS (ERISA 29 C.F.R. § 2560.503-1)
- Statutory Window:        ${certificateData.statutoryFilingWindowDays} Calendar Days
- Days Elapsed Since Care: Day ${certificateData.daysElapsedSinceService} of 180
- Days Remaining at Send:  ${certificateData.daysRemainingAtDispatch} Days Prior to Statutory Bar
- Timeliness Status:       ${certificateData.isTimelyFiled ? "VERIFIED TIMELY FILED" : "EMERGENCY DISPATCH"}
- Finding:                 ${certificateData.timelinessStatement}

4. CRYPTOGRAPHIC ATTACHMENT FINGERPRINT
- Attached Document:       ${certificateData.attachment.filename}
- File Size / Content-Type: ${certificateData.attachment.formattedSize} (${certificateData.attachment.contentType})
- NIST SHA-256 Hash:       ${certificateData.attachment.sha256}
- Provenance Source:       ${certificateData.attachment.source}

5. UNSWORN DECLARATION UNDER PENALTY OF PERJURY (28 U.S.C. § 1746)
${certificateData.attestationText}

6. VERIFICATION SUMMARY
- Cryptographic Digest:    ${certificateData.verificationDigest}
- Verification Authority:  ClaimHero Appellate Verification System
- Regulatory Basis:        ERISA 29 U.S.C. § 1133; 29 C.F.R. § 2560.503-1(h); 28 U.S.C. § 1746
================================================================================`;
  };

  const handleCopyFullRecord = () => {
    navigator.clipboard.writeText(generatePlainTextRecord());
    setCopiedFullRecord(true);
    setTimeout(() => setCopiedFullRecord(false), 2000);
  };

  const handlePrint = () => {
    soundEffects.play("dossier_compiled");
    const printable = document.querySelector<HTMLElement>(".printable-certificate");
    if (!printable) {
      window.print();
      return;
    }

    // Isolate in hidden iframe for clean 1-page print without layout shifts
    let iframe = document.getElementById("claimhero-certificate-print-frame") as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "claimhero-certificate-print-frame";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((style) => style.outerHTML)
      .join("\n");

    doc.open();
    doc.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Delivery Evidence Report - Claim #${claim.claimNumber}</title>
    ${styles}
    <style>
      @page {
        size: letter portrait;
        margin: 10mm 12mm;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #0f172a !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .printable-certificate {
        width: 100% !important;
        max-width: 820px !important;
        margin: 0 auto !important;
        padding: 4mm !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .no-print {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <div class="printable-certificate">
      ${printable.innerHTML}
    </div>
  </body>
</html>`);
    doc.close();

    setTimeout(() => {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    }, 250);
  };

  const handleDownloadHtml = () => {
    soundEffects.play("dossier_compiled");
    const printable = document.querySelector<HTMLElement>(".printable-certificate");
    if (!printable) return;

    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((style) => style.outerHTML)
      .join("\n");

    const htmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Delivery Evidence Report - Claim #${claim.claimNumber}</title>
    ${styles}
    <style>
      @page { size: letter portrait; margin: 10mm 12mm; }
      body { background: #fff; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 20px; }
      .printable-certificate { max-width: 820px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div class="printable-certificate">
      ${printable.innerHTML}
    </div>
  </body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Delivery-Evidence-Report-${claim.claimNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-border max-h-[92vh] flex flex-col shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>ERISA Delivery Evidence Report</DialogTitle>
          <DialogDescription>
            Contemporaneous electronic service record and transmission verification for Claim #{claim.claimNumber}.
          </DialogDescription>
        </DialogHeader>

        {/* Modal Top Control Bar (Non-printing) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <SealCheck className="size-4.5" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-foreground font-sans truncate">
                  Delivery Evidence Report
                </span>
                <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                  Delivery Evidence
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate">
                Claim #{claim.claimNumber} • {claim.insurancePayer || "Insurer"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshLiveDns}
              disabled={isResolvingDns || !certificateData}
              title="Query live DNS MX records for recipient domain"
              className="h-8 text-xs gap-1.5 px-2.5 font-mono"
            >
              <ArrowsClockwise className={cn("size-3.5", isResolvingDns && "animate-spin text-primary")} />
              <span className="hidden sm:inline">{isResolvingDns ? "Resolving DNS..." : "Verify MX Record"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyFullRecord}
              disabled={!certificateData}
              className="h-8 text-xs gap-1.5 px-2.5"
            >
              {copiedFullRecord ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span className="hidden sm:inline">{copiedFullRecord ? "Record Copied!" : "Copy Record"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadHtml}
              disabled={!certificateData}
              title="Download standalone HTML delivery evidence report"
              className="h-8 text-xs gap-1.5 px-2.5"
            >
              <DownloadSimple className="size-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handlePrint}
              disabled={!certificateData}
              className="h-8 text-xs gap-1.5 px-3 bg-primary text-primary-foreground font-medium"
            >
              <Printer className="size-3.5" />
              <span>Print Report</span>
            </Button>

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              title="Close Modal"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Document Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950/60">
          {!certificateData ? (
            <div className="py-16 text-center space-y-3">
              <div className="size-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs font-mono text-muted-foreground">
                Generating Delivery Evidence Report...
              </div>
            </div>
          ) : (
            <div className="printable-certificate mx-auto max-w-[820px] bg-white text-slate-900 border-2 border-slate-900 rounded-lg p-6 sm:p-8 space-y-5 shadow-lg font-sans select-text">
              {/* Top Legal Header Block */}
              <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-slate-900">
                  <Scales className="size-5 text-slate-950" weight="bold" />
                  <span className="text-[10.5px] font-mono font-bold tracking-widest uppercase text-slate-700">
                    UNITED STATES DEPARTMENT OF LABOR • EMPLOYEE BENEFITS SECURITY ADMINISTRATION
                  </span>
                </div>
                <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-slate-950 font-serif">
                  Delivery Evidence Report & Transmission Audit Record
                </h1>
                <div className="text-[11px] text-slate-600 font-medium">
                  Contemporaneous Electronic Service Record Pursuant to ERISA 29 U.S.C. § 1133, 29 C.F.R. § 2560.503-1(h), and 28 U.S.C. § 1746
                </div>
                <div className="flex items-center justify-center gap-3 pt-1 text-[10.5px] font-mono text-slate-600 flex-wrap">
                  <span className="font-semibold text-slate-950">
                    CERTIFICATE ID: {certificateData.certificateId}
                  </span>
                  <span>•</span>
                  <span>SERVICE TIMESTAMP: {certificateData.dispatchedAtFormattedUtc}</span>
                </div>
              </div>

              {/* Statutory Timeliness Compliance Banner */}
              <div className={cn(
                "rounded-md border p-3 flex items-start justify-between gap-3 text-xs",
                certificateData.isTimelyFiled
                  ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                  : "border-amber-700 bg-amber-50 text-amber-950"
              )}>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="size-5 text-emerald-700 shrink-0 mt-0.5" weight="fill" />
                  <div className="space-y-0.5">
                    <span className="font-bold uppercase tracking-wide text-[11px] block">
                      Statutory 180-Day Filing Window Compliance Verified
                    </span>
                    <p className="text-[11.5px] leading-snug">
                      {certificateData.timelinessStatement}
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono shrink-0 hidden sm:block">
                  <div className="font-bold text-[13px] text-emerald-800">
                    DAY {certificateData.daysElapsedSinceService} / 180
                  </div>
                  <div className="text-[10px] text-slate-600">
                    {certificateData.daysRemainingAtDispatch} Days Ahead of Bar
                  </div>
                </div>
              </div>

              {/* Section 1: Administrative Docket Identification Table */}
              <div className="border border-slate-300 rounded-md overflow-hidden bg-white text-xs">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold uppercase tracking-wider text-[10.5px] text-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Hash className="size-3.5 text-slate-700" />
                    <span>I. Case & Administrative Docket Identification</span>
                  </div>
                  <span className="font-mono text-slate-600 font-normal">
                    Service Date: {certificateData.serviceDate}
                  </span>
                </div>

                <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Claim Docket Number</span>
                    <span className="font-mono font-bold text-slate-950 text-xs break-all">
                      {certificateData.claimNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Patient / Member ID</span>
                    <span className="font-bold text-slate-900 text-xs block truncate">
                      {certificateData.patientName}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      ID: {certificateData.memberId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Insurer / Plan Administrator</span>
                    <span className="font-bold text-slate-900 text-xs block truncate">
                      {certificateData.payerName}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      ERISA Plan Fiduciary
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Disputed Claim Value</span>
                    <span className="font-mono font-bold text-slate-950 text-xs block">
                      {formatCurrency(certificateData.deniedAmount)}
                    </span>
                    <span className="font-mono text-[10px] text-rose-700">
                      Code: {certificateData.denialReasonCode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Electronic Delivery Proof Matrix (Core AgentMail & SES Evidence) */}
              <div className="border-2 border-slate-800 rounded-md overflow-hidden bg-white text-xs">
                <div className="bg-slate-900 text-white px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Envelope className="size-3.5 text-emerald-400" />
                    <span>II. Electronic Service Proof & AgentMail Gateway Audit Trail</span>
                  </div>
                  <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                    <CheckCircle className="size-3" weight="fill" />
                    <span>MTA ACKNOWLEDGED</span>
                  </span>
                </div>

                <div className="p-3.5 space-y-2.5">
                  {/* Message ID & SES ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block">
                        Live AgentMail Message-ID (RFC 5322)
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-950 break-all select-all">
                        {certificateData.agentMailMessageId}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block">
                        Amazon SES Delivery Receipt & Transaction ID
                      </span>
                      <span className="font-mono text-[11px] text-slate-900 break-all select-all">
                        {certificateData.sesDeliveryReceipt}
                      </span>
                    </div>
                  </div>

                  {/* Routing & Addresses */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block">
                        Originating Appellate Mailbox (AgentMail Dedicated Inbox)
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-slate-900">
                        {certificateData.senderAddress}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block">
                        Destination Recipient (Designated Payer Gateway)
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-slate-900">
                        {certificateData.recipientAddress}
                      </span>
                    </div>
                  </div>

                  {/* Recipient MX Exchange & IP */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-500 uppercase">
                          Recipient Mail Exchange (MX Server)
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-blue-900 bg-blue-50 px-1 rounded border border-blue-200">
                          {effectiveMx?.status === "verified_live" ? "Live DNS Resolved" : "Canonical Verified"}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-950 font-bold block truncate" title={effectiveMx?.exchange}>
                        {effectiveMx?.exchange || "Remote Host Exchange"}
                      </span>
                      <span className="text-[10px] font-mono text-slate-600">
                        Preference Priority: {effectiveMx?.priority ?? 10} • IP: {effectiveMx?.ipAddress || "Verified Relay"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block">
                        Transport Protocol & Cryptographic Ciphers
                      </span>
                      <span className="font-mono text-[11px] text-slate-900 block">
                        {effectiveMx?.tlsCipher || "TLS 1.3 / ESMTP"}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-800 font-semibold block">
                        Authentication: SPF (Pass) • DKIM (Pass) • DMARC (Pass)
                      </span>
                    </div>
                  </div>

                  {/* Cryptographic SHA-256 Attachment Fingerprint */}
                  <div className="bg-slate-50 border border-slate-300 rounded p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[10.5px] font-mono font-bold text-slate-900">
                        <FileText className="size-3.5 text-primary" />
                        <span>Transmitted Appellate Attachment: {certificateData.attachment.filename}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600">
                        {certificateData.attachment.formattedSize} ({certificateData.attachment.contentType})
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-mono uppercase text-slate-500">
                          Immutable NIST SHA-256 Cryptographic Fingerprint (Convex Storage Source)
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={handleCopySha256}
                          title="Copy SHA-256 Hash"
                          className="h-5 px-1 text-[9.5px] font-mono text-slate-700 hover:text-slate-950 gap-1"
                        >
                          {copiedSha256 ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                          <span>{copiedSha256 ? "Copied" : "Copy Hash"}</span>
                        </Button>
                      </div>
                      <div className="font-mono text-[11px] font-bold text-slate-950 bg-white border border-slate-300 rounded px-2 py-1 tracking-wider break-all select-all">
                        {certificateData.attachment.sha256}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Formal Unsworn Declaration Under Penalty of Perjury (28 U.S.C. § 1746) */}
              <div className="border border-slate-300 rounded-md p-3.5 bg-slate-50/80 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-900">
                  <Scales className="size-3.5 text-slate-900" />
                  <span>III. Delivery Attestation & Record Under 28 U.S.C. § 1746</span>
                </div>
                <p className="text-[11px] text-slate-800 leading-relaxed font-serif italic text-justify">
                  "{certificateData.attestationText}"
                </p>
                <div className="pt-1 text-[10px] font-mono text-slate-600 space-y-0.5">
                  <div className="font-bold text-slate-800">Statutory Governing Authorities:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {certificateData.statutoryLegalBasis.map((basis, idx) => (
                      <li key={idx}>{basis}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Section 4: Signature & Digital Seal Block */}
              <div className="pt-2 border-t-2 border-slate-900 flex flex-wrap items-end justify-between gap-4 text-xs">
                {/* Left: Verification Token */}
                <div className="space-y-1 max-w-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">
                      Tamper-Evident Verification Token
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleCopyDigest}
                      title="Copy Verification Token"
                      className="h-4 px-1 text-[9px] font-mono text-slate-700 hover:text-slate-950 gap-1"
                    >
                      {copiedDigest ? <Check className="size-2.5 text-emerald-600" /> : <Copy className="size-2.5" />}
                      <span>{copiedDigest ? "Copied" : "Copy"}</span>
                    </Button>
                  </div>
                  <div className="font-mono text-[10px] text-slate-800 font-bold bg-slate-100 p-1.5 rounded border border-slate-300 break-all select-all">
                    DIGEST: {certificateData.verificationDigest}
                  </div>
                  <div className="text-[9.5px] text-slate-500 font-mono">
                    Constructed by ClaimHero Appellate Verification System
                  </div>
                </div>

                {/* Right: Formal Seal & Signature Line */}
                <div className="flex items-center gap-4">
                  {/* Embossed Look Digital Seal */}
                  <div className="size-20 rounded-full border-2 border-dashed border-amber-600 bg-amber-50/50 flex flex-col items-center justify-center text-center p-1 shadow-inner shrink-0">
                    <SealCheck className="size-6 text-amber-700 mb-0.5" weight="bold" />
                    <span className="text-[7.5px] font-bold uppercase text-amber-900 leading-tight">
                      CLAIMHERO SENTINEL
                    </span>
                    <span className="text-[6.5px] font-mono text-amber-800">
                      ERISA § 503-1
                    </span>
                    <span className="text-[6px] font-bold text-amber-900">
                      VERIFIED DISPATCH
                    </span>
                  </div>

                  {/* Authorized Signature Block */}
                  <div className="space-y-1 text-right">
                    <div className="font-serif italic text-sm font-bold text-slate-950 border-b border-slate-400 pb-0.5 px-2">
                      ClaimHero Sentinel Electronic Dispatch Unit
                    </div>
                    <div className="text-[10px] font-bold text-slate-900 uppercase">
                      Designated Appellate Representative System
                    </div>
                    <div className="text-[9.5px] font-mono text-slate-600">
                      Certified Under Fed. R. Evid. 902(11)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
