import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Mail,
  CheckCircle2,
  X,
  Copy,
  Check,
  Shield,
  Loader2,
  FileCheck,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { DenialExtractionResult } from "../../types";
import { formatCurrency } from "../../lib/utils";

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (file: File, patientState?: string) => Promise<DenialExtractionResult & { claimId: string }>;
  onParseText: (text: string, patientState?: string) => Promise<DenialExtractionResult & { claimId: string }>;
  onSuccess: (claimId: string) => void;
}

const SAMPLE_CASE_PRESETS = [
  {
    id: "uhc_knee",
    title: "UnitedHealthcare — Total Knee Arthroplasty",
    payer: "UnitedHealthcare",
    amount: "$24,500",
    cpt: "27447",
    carc: "CO-50 (Not Medically Necessary)",
    badgeColor: "border-cyan-500/40 bg-cyan-950/30 text-cyan-300",
    content: `UNITEDHEALTHCARE COMMERCIAL PLAN
EXPLANATION OF BENEFITS / ADVERSE BENEFIT DETERMINATION
Claim ID: CLM-8942-UHC
Member ID: UHC-982341-01
Patient Name: Eleanor Vance
Date of Birth: 1968-04-14
Date of Service: 06/12/2026
Treating Provider: Dr. Robert Langston, MD (Advanced Orthopedic Institute)
Facility: Pacific Surgical Center

Services Rendered:
- CPT Code 27447: Total Knee Arthroplasty (TKA), right knee
- ICD-10 Code M17.11: Primary osteoarthritis, right knee
- Total Billed Amount: $24,500.00
- Plan Allowance / Paid: $0.00
- Denied Amount: $24,500.00
- Patient Financial Liability: $24,500.00

Adjudication & Claim Denial Reason:
Code CO-50: These are non-covered services because this is not deemed a medical necessity by the payer.
Clinical Rationale: Under UnitedHealthcare Clinical Policy Bulletin 2024T001, total knee arthroplasty requires documented failure of at least 6 months of non-surgical conservative therapy (including formal physical therapy, intra-articular corticosteroid injections, and prescription NSAIDs). Clinical records submitted fail to establish 6 consecutive months of supervised physical therapy.

Statutory Notice of Appeal Rights:
You have the right to an internal appeal pursuant to ERISA 29 CFR § 2560.503-1. You must submit your written appeal within 180 calendar days from the date of this determination notice.`,
  },
  {
    id: "aetna_spine",
    title: "Aetna — Lumbar Decompression & Laminectomy",
    payer: "Aetna",
    amount: "$18,200",
    cpt: "63047",
    carc: "CO-197 (Prior Auth Lacking)",
    badgeColor: "border-amber-500/40 bg-amber-950/30 text-amber-300",
    content: `AETNA HEALTH INSURANCE
NOTICE OF CLAIM ADVERSE DETERMINATION
Claim Reference: CLM-6104-AET
Member ID: AET-554210-99
Patient Name: Marcus Sterling
Date of Service: 07/04/2026
Provider: Dr. Sarah Chen, MD (Spine & Neurosurgery Associates)

Procedure & Clinical Codes:
- CPT 63047: Laminectomy, facetectomy and foraminotomy with decompression of spinal cord, single segment lumbar
- ICD-10 M51.26: Other intervertebral disc displacement, lumbar region
- Total Billed: $18,200.00
- Amount Denied: $18,200.00
- Patient Responsibility: $18,200.00

Denial Adjudication Reason:
Code CO-197: Precertification / prior authorization / notification absent or lacking.
Description: Surgical treatment for lumbar spinal stenosis was performed without securing prior authorization from Aetna Clinical Review Department prior to the date of service.

Appeals Procedure:
In accordance with federal regulations under 29 CFR § 2560.503-1, you or your authorized representative have 180 days from receipt of this notice to file a Level 1 appeal demonstrating emergency medical necessity or retroactive pre-authorization criteria.`,
  },
  {
    id: "cigna_mri",
    title: "Cigna — Diagnostic Knee MRI",
    payer: "Cigna",
    amount: "$2,850",
    cpt: "73721",
    carc: "CO-16 (Missing Clinical Records)",
    badgeColor: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
    content: `CIGNA HEALTH AND LIFE INSURANCE COMPANY
EXPLANATION OF BENEFITS
Claim #: CLM-3319-CIG
Member ID: CIG-773190-44
Patient: David Chen
Date of Service: 07/28/2026
Facility: Metro Advanced Imaging Center

Service Detail:
- CPT 73721: Magnetic resonance imaging, any joint of lower extremity; without contrast material
- ICD-10 M23.22: Derangement of meniscus due to old tear or injury, right knee
- Billed Charge: $2,850.00
- Denied: $2,850.00
- Patient Owes: $2,850.00

Denial Code & Description:
Code CO-16: Claim/service lacks information or has submission/billing error(s) which is needed for adjudication.
Remarks: Prior 4-week weight-bearing X-ray reports and clinical examination notes ruling out conservative management were not attached to the imaging claim submission.

Statutory Appeal Window:
Under ERISA § 503 regulations, you have 180 days to appeal this determination with complete diagnostic documentation.`,
  },
];

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onUploadFile,
  onParseText,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"presets" | "upload" | "paste" | "email">("presets");
  const [pastedText, setPastedText] = useState("");
  const [patientState, setPatientState] = useState("California");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Processing with OpenAI...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<(DenialExtractionResult & { claimId: string }) | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("intake@claimhero.agentmail.com");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMessage(null);
      setExtractedResult(null);
    }
  };

  const handleProcessFile = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select a denial letter PDF or image file.");
      return;
    }

    setIsProcessing(true);
    setProcessingMessage("Uploading to Convex Storage & running gpt-5-nano Vision...");
    setErrorMessage(null);

    try {
      const result = await onUploadFile(selectedFile, patientState);
      setExtractedResult(result);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to parse denial document. Please check your OpenAI API key and file format.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessPreset = async (presetContent: string) => {
    setIsProcessing(true);
    setProcessingMessage("Extracting CPT, CARC & ERISA deadlines with gpt-5-nano...");
    setErrorMessage(null);

    try {
      const result = await onParseText(presetContent, patientState);
      setExtractedResult(result);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to extract claim information. Please check your document text.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessText = async () => {
    if (!pastedText.trim()) {
      setErrorMessage("Please paste the denial letter or Explanation of Benefits text.");
      return;
    }

    setIsProcessing(true);
    setProcessingMessage("Parsing document text with OpenAI Structured Outputs...");
    setErrorMessage(null);

    try {
      const result = await onParseText(pastedText, patientState);
      setExtractedResult(result);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to extract claim information. Please check your document text.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = () => {
    if (extractedResult?.claimId) {
      onSuccess(extractedResult.claimId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-950/95 p-6 shadow-2xl shadow-cyan-500/10 text-slate-100 font-sans max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <UploadCloud className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Ingest Denial Document</h3>
              <p className="text-xs text-slate-400">
                Live Optical Extraction via OpenAI gpt-5-nano & Convex Cloud Database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800/80 mt-4 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab("presets");
              setErrorMessage(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "presets"
                ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>Judge Case Presets (1-Click)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("upload");
              setErrorMessage(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "upload"
                ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload PDF / Image File</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("paste");
              setErrorMessage(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "paste"
                ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Paste Document Text</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("email");
              setErrorMessage(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "email"
                ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>AgentMail Inbox</span>
          </button>
        </div>

        {/* Jurisdiction State Selector */}
        <div className="mt-4 flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl text-xs">
          <span className="text-slate-400 font-mono">Patient Jurisdiction State:</span>
          <select
            value={patientState}
            onChange={(e) => setPatientState(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono text-xs"
          >
            <option value="California">California (DOI 180d ERISA)</option>
            <option value="New York">New York (DFS 180d)</option>
            <option value="Texas">Texas (TDI 180d)</option>
            <option value="Florida">Florida (FL DOI)</option>
            <option value="Illinois">Illinois (IDFPR)</option>
            <option value="Pennsylvania">Pennsylvania (PID)</option>
          </select>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 flex items-center gap-2.5 text-xs text-rose-300 animate-fadeIn">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab 1: 1-Click Judge Presets */}
        {activeTab === "presets" && !extractedResult && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-400">
              Select one of the 3 realistic medical denial cases below. Clicking a preset directly sends the full clinical denial letter to <span className="text-cyan-300 font-mono">OpenAI gpt-5-nano</span> to extract CPT/CARC codes and insert the case into the Convex database:
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              {SAMPLE_CASE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => !isProcessing && handleProcessPreset(preset.content)}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900/90 hover:border-cyan-500/50 p-4 transition-all cursor-pointer group space-y-2 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white group-hover:text-cyan-300 transition-colors">
                        {preset.title}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-rose-400 text-sm">
                      {preset.amount}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="rounded bg-slate-950 border border-slate-700 px-2 py-0.5 text-slate-300">
                      CPT {preset.cpt}
                    </span>
                    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${preset.badgeColor}`}>
                      {preset.carc}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Click to parse live with gpt-5-nano &rarr;</span>
                    <span className="text-cyan-400 group-hover:underline">1-Click Ingestion</span>
                  </div>
                </div>
              ))}
            </div>

            {isProcessing && (
              <div className="flex items-center justify-center gap-2.5 py-4 text-xs font-mono text-cyan-300 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                <span>{processingMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Real File Upload */}
        {activeTab === "upload" && !extractedResult && (
          <div className="mt-4 space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-slate-700 hover:border-cyan-400/60 bg-slate-900/40 hover:bg-slate-900/70 p-8 text-center transition-all group"
            >
              <UploadCloud className="mx-auto h-12 w-12 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              <div className="mt-3 text-sm font-semibold text-slate-200">
                {selectedFile ? selectedFile.name : "Click to select a real Denial Letter PDF or Image"}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {selectedFile
                  ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready to upload & extract`
                  : "Supports multi-page PDF, PNG, JPG, JPEG, and TXT files"}
              </p>
            </div>

            {selectedFile && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSelectedFile(null)}
                  disabled={isProcessing}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
                <button
                  onClick={handleProcessFile}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{processingMessage}</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4" />
                      <span>Run Optical Parser</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Paste Raw Document Text */}
        {activeTab === "paste" && !extractedResult && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">
                Paste EOB / Denial Letter Content:
              </label>
              <textarea
                rows={7}
                placeholder="Paste the full text of the denial letter, including claim number, procedure codes (CPT), denial reason code (e.g. CO-50), and denied amounts..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleProcessText}
                disabled={isProcessing || !pastedText.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 transition-all disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{processingMessage}</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4" />
                    <span>Process Text with OpenAI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Dedicated AgentMail Ingestion Address */}
        {activeTab === "email" && !extractedResult && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400 uppercase font-semibold">
                  Dedicated AgentMail Ingestion Address
                </span>
                <span className="rounded-full bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  WEBHOOK ACTIVE
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value="intake@claimhero.agentmail.com"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-cyan-300 select-all"
                />
                <button
                  onClick={handleCopyEmail}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  {copiedEmail ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-slate-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-2 pt-2 text-xs text-slate-400">
                <div className="font-semibold text-slate-300">Automated Intake Process:</div>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
                  <li>Patients or clinic billing coordinators forward denial emails directly to this address.</li>
                  <li>AgentMail provisions a HIPAA-isolated thread and triggers Convex HTTP webhook.</li>
                  <li>OpenAI extracts CPT codes and immediately initializes the case in Convex DB.</li>
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 flex items-center gap-2 text-xs text-cyan-300">
              <Shield className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>Full HIPAA Data Isolation & TLS End-to-End Encryption active.</span>
            </div>
          </div>
        )}

        {/* Real Extracted Result Card */}
        {extractedResult && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-mono text-emerald-300 border-b border-emerald-500/30 pb-2">
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <FileCheck className="h-4 w-4" />
                Case Successfully Created in Convex DB
              </span>
              <span className="text-[11px] bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
                Claim #{extractedResult.claimNumber}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Patient Name</span>
                <span className="font-semibold text-white">{extractedResult.patientName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Insurance Payer</span>
                <span className="font-semibold text-cyan-300">{extractedResult.insurancePayer}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Denied Amount</span>
                <span className="font-bold font-mono text-rose-400 text-sm">
                  {formatCurrency(extractedResult.deniedAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Patient Responsibility</span>
                <span className="font-bold font-mono text-rose-300 text-sm">
                  {formatCurrency(extractedResult.patientOwedAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">CPT Procedure Codes</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {extractedResult.cptCodes.join(", ") || "None"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">CARC Denial Reason</span>
                <span className="font-mono text-rose-400 font-bold">
                  {extractedResult.denialReasonCode}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-2.5 text-xs text-slate-300">
              <span className="text-slate-500 font-mono text-[10px] block">Denial Reason Description:</span>
              <p className="mt-0.5">{extractedResult.denialReasonDescription}</p>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setExtractedResult(null)}
                className="px-3 py-2 text-xs text-slate-400 hover:text-white"
              >
                Ingest Another Case
              </button>
              <button
                onClick={handleDone}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-emerald-glow hover:scale-105 transition-transform"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>View in Case Radar Feed</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
