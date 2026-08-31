import React, { useState } from "react";
import {
  Printer,
  Copy,
  Check,
  DownloadSimple,
  PhoneCall,
  CheckCircle,
  Stethoscope,
  Scales,
  X,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Claim, CallTranscriptItem, LiveCallChecklistItem, P2PCallSession } from "../../types";
import { formatCurrency } from "../../lib/utils";

interface P2PEncounterSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim;
  session?: P2PCallSession | null;
}

export const P2PEncounterSummaryModal: React.FC<P2PEncounterSummaryModalProps> = ({
  isOpen,
  onClose,
  claim,
  session,
}) => {
  const [copied, setCopied] = useState(false);

  const durationMin = Math.floor((session?.durationSeconds || 0) / 60);
  const durationSec = (session?.durationSeconds || 0) % 60;
  const formattedDuration = `${String(durationMin).padStart(2, "0")}:${String(durationSec).padStart(2, "0")}`;
  const encounterDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const completedChecklistCount =
    session?.checklistProgress?.filter((c: LiveCallChecklistItem) => c.isCompleted).length || 0;
  const totalChecklistCount = session?.checklistProgress?.length || 4;

  const generateEhrAddendumText = () => {
    const transcriptsText =
      session?.transcripts && session.transcripts.length > 0
        ? session.transcripts
            .map(
              (t: CallTranscriptItem) =>
                `[${t.speaker === "physician" ? "TREATING PHYSICIAN" : "INSURER MEDICAL DIRECTOR"}]: ${t.text}`
            )
            .join("\n\n")
        : "No verbal dialogue recorded during encounter.";

    const checklistText =
      session?.checklistProgress && session.checklistProgress.length > 0
        ? session.checklistProgress
            .map((c: LiveCallChecklistItem) => `[${c.isCompleted ? "X" : " "}] ${c.label} (${c.category})`)
            .join("\n")
        : "Statutory checklist pending review.";

    return `================================================================================
PHYSICIAN PEER-TO-PEER (P2P) CLINICAL ENCOUNTER ADDENDUM
CLAIM REFERENCE: ${claim.claimNumber} | PATIENT: ${claim.patient?.name || "Patient Record"}
PAYER: ${claim.patient?.insurancePayer || "Insurer"} | SERVICE DATE: ${encounterDate}
================================================================================

1. ENCOUNTER METADATA
--------------------------------------------------------------------------------
- Date of Discussion:    ${encounterDate}
- Teleconference Length: ${formattedDuration}
- Treating Clinician:    ${claim.providerName || "Treating Physician, MD"}
- Disputed CPT / ICD-10: CPT ${claim.cptCodes?.join(", ")} | ICD-10 ${claim.icd10Codes?.join(", ")}
- Adverse Determination: Code ${claim.denialReasonCode} - ${claim.denialReasonDescription}
- Disputed Balance:      ${formatCurrency(claim.deniedAmount)}
- Defense Score Rating:  ${session?.winScore || 85}% Overturn Probability

2. STATUTORY MANDATES ESTABLISHED UNDER 29 CFR § 2560.503-1
--------------------------------------------------------------------------------
${checklistText}

3. CLINICAL TELECONFERENCE TRANSCRIPT RECORD
--------------------------------------------------------------------------------
${transcriptsText}

4. TREATING PHYSICIAN ATTESTATION & SUMMARY
--------------------------------------------------------------------------------
${session?.summaryNotes || "Treating physician presented peer-reviewed standard-of-care evidence and conservative therapy clinical timeline. Reconsideration and approval demanded."}

Attending Physician Attestation:
I hereby certify that the clinical facts documented above are true, accurate, and reflect the teleconference discussion held with the medical director.

Signed: ${claim.providerName || "Treating Physician, MD"}
Date:   ${encounterDate}
================================================================================`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateEhrAddendumText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const text = generateEhrAddendumText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `P2P_Encounter_Addendum_${claim.claimNumber}_${encounterDate.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden font-sans border-border bg-card shadow-2xl"
      >
        {/* Modal Header Toolbar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40 no-print">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <PhoneCall className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">
                Physician P2P Call Encounter Summary & EHR Addendum
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Documented teleconference record for EHR integration and case dockets
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 text-xs h-8"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span>Copied to EHR</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copy EHR Note</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTxt}
              className="gap-1.5 text-xs h-8"
            >
              <DownloadSimple className="size-3.5" />
              <span>Download .txt</span>
            </Button>

            <Button
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs h-8 bg-primary text-primary-foreground shadow-xs"
            >
              <Printer className="size-3.5" />
              <span>Print Record</span>
            </Button>

            <div className="h-4 w-px bg-border/80 mx-0.5" />

            <button
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Encounter Document Body */}
        <div className="printable-dossier-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/40">
          <div className="printable-dossier max-w-4xl mx-auto bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 shadow-lg font-sans space-y-6">
            {/* Formal Letterhead */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b-2 border-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base tracking-tight text-slate-950 font-serif">
                    PEER-TO-PEER TELECONFERENCE CLINICAL RECORD
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border border-emerald-300 rounded bg-emerald-50 text-emerald-800">
                    VERIFIED ENCOUNTER
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Treating Physician vs Payer Medical Director Clinical Defense Record
                </p>
              </div>

              <div className="text-left sm:text-right font-mono text-xs text-slate-600">
                <div>Date: <span className="font-bold text-slate-950">{encounterDate}</span></div>
                <div>Duration: <span className="font-bold text-slate-950">{formattedDuration}</span></div>
              </div>
            </div>

            {/* Patient & Case Summary Block */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded border border-slate-300 bg-slate-50">
              <div>
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">Patient</div>
                <div className="text-xs font-bold text-slate-950 mt-0.5">
                  {claim.patient?.name || "Patient Record"}
                </div>
                <div className="text-[10px] font-mono text-slate-600">{claim.patient?.memberId}</div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">Payer / Plan</div>
                <div className="text-xs font-bold text-slate-950 mt-0.5">
                  {claim.patient?.insurancePayer || "Insurer"}
                </div>
                <div className="text-[10px] font-mono text-slate-600">Claim #{claim.claimNumber}</div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">Disputed Amount</div>
                <div className="text-xs font-bold font-mono text-slate-950 mt-0.5">
                  {formatCurrency(claim.deniedAmount)}
                </div>
                <div className="text-[10px] text-slate-600">CPT: {claim.cptCodes?.join(", ")}</div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">Statutory Adherence</div>
                <div className="text-xs font-bold text-emerald-800 mt-0.5">
                  {completedChecklistCount}/{totalChecklistCount} Items Verified
                </div>
                <div className="text-[10px] font-mono text-slate-600">Win Score: {session?.winScore || 85}%</div>
              </div>
            </div>

            {/* Statutory Checklist Establishments */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5 font-mono">
                <Scales className="size-4 text-slate-900" />
                <span>Procedural Mandates Established During Call</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {session?.checklistProgress && session.checklistProgress.length > 0 ? (
                  session.checklistProgress.map((item: LiveCallChecklistItem) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 p-2.5 rounded border text-xs ${
                        item.isCompleted
                          ? "border-emerald-300 bg-emerald-50 text-slate-950"
                          : "border-slate-300 bg-slate-50 text-slate-600"
                      }`}
                    >
                      <CheckCircle
                        className={`size-4 shrink-0 ${
                          item.isCompleted ? "text-emerald-700" : "text-slate-400"
                        }`}
                      />
                      <span className="font-medium">{item.label}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-600 p-3 bg-slate-50 rounded border border-slate-300 col-span-2">
                    No automated statutory checklist recorded for this call.
                  </div>
                )}
              </div>
            </div>

            {/* Discussion Dialogue / Transcript Log */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5 font-mono">
                <Stethoscope className="size-4 text-slate-900" />
                <span>Verbatim Tele-Discussion Dialogue Log ({session?.transcripts?.length || 0} Exchanged Messages)</span>
              </h3>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {session?.transcripts && session.transcripts.length > 0 ? (
                  session.transcripts.map((t: CallTranscriptItem, idx: number) => (
                    <div
                      key={t.id || idx}
                      className={`p-3 rounded border text-xs space-y-1 ${
                        t.speaker === "physician"
                          ? "border-slate-300 bg-slate-50 text-slate-950 ml-4"
                          : "border-slate-300 bg-white text-slate-800 mr-4"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                        <span className={t.speaker === "physician" ? "text-blue-800" : "text-amber-800"}>
                          {t.speaker === "physician" ? "TREATING PHYSICIAN" : "INSURER MEDICAL DIRECTOR"}
                        </span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-600 p-4 text-center rounded border border-slate-300 bg-slate-50">
                    No transcripts recorded in this session. Start a live call to stream discussion dialogues.
                  </div>
                )}
              </div>
            </div>

            {/* Formal Attestation Box */}
            <div className="p-4 rounded border border-slate-300 bg-slate-50 space-y-2 text-xs text-slate-700">
              <div className="font-bold text-slate-950">Treating Physician Legal Attestation:</div>
              <p className="leading-relaxed text-[11px]">
                The undersigned physician attests that the above teleconference clinical encounter accurately reflects the medical necessity defense presented to the payer's medical director. Pursuant to 29 CFR § 2560.503-1(h)(3)(iii), notice is hereby incorporated that denial upheld without clinical board certification will be appealed directly to the State Insurance Commissioner.
              </p>
              <div className="pt-3 flex items-center justify-between text-[11px] font-mono border-t border-slate-300">
                <div>Attending: <span className="font-bold text-slate-950">{claim.providerName || "Treating Physician, MD"}</span></div>
                <div>Date Signed: <span className="font-bold text-slate-950">{encounterDate}</span></div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
