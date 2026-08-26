import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Mail,
  CheckCircle2,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Textarea } from "../ui/textarea";

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (
    file: File,
    patientState?: string
  ) => Promise<DenialExtractionResult & { claimId: string }>;
  onParseText: (
    text: string,
    patientState?: string
  ) => Promise<DenialExtractionResult & { claimId: string }>;
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
    carc: "CO-16 (Missing Records)",
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
  const [activeTab, setActiveTab] = useState<string>("presets");
  const [pastedText, setPastedText] = useState("");
  const [patientState, setPatientState] = useState("California");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState(
    "Processing with OpenAI..."
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<
    (DenialExtractionResult & { claimId: string }) | null
  >(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setErrorMessage(
        err?.message ||
          "Failed to parse denial document. Please check your OpenAI API key and file format."
      );
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
      setErrorMessage(
        err?.message ||
          "Failed to extract claim information. Please check your document text."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessText = async () => {
    if (!pastedText.trim()) {
      setErrorMessage(
        "Please paste the denial letter or Explanation of Benefits text."
      );
      return;
    }

    setIsProcessing(true);
    setProcessingMessage("Parsing document text with OpenAI Structured Outputs...");
    setErrorMessage(null);

    try {
      const result = await onParseText(pastedText, patientState);
      setExtractedResult(result);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          "Failed to extract claim information. Please check your document text."
      );
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 gap-5">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UploadCloud className="size-4.5" />
            </div>
            <div>
              <DialogTitle>Ingest Denial Document</DialogTitle>
              <DialogDescription>
                Optical extraction via OpenAI gpt-5-nano & Convex Cloud Database
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* State Jurisdiction Selector */}
        <div className="flex items-center justify-between gap-3 bg-muted/40 border border-border p-2.5 rounded-lg text-xs">
          <span className="text-muted-foreground font-medium">Patient State Jurisdiction:</span>
          <select
            value={patientState}
            onChange={(e) => setPatientState(e.target.value)}
            className="bg-card border border-input rounded-md px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans"
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
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!extractedResult ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="presets" className="gap-1.5">
                <Sparkles className="size-3.5" />
                <span>1-Click Presets</span>
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-1.5">
                <UploadCloud className="size-3.5" />
                <span>File Upload</span>
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5">
                <FileText className="size-3.5" />
                <span>Paste Text</span>
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="size-3.5" />
                <span>AgentMail</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: 1-Click Presets */}
            <TabsContent value="presets" className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Select a sample medical denial case. Clicking a preset immediately parses with <span className="font-mono text-foreground font-semibold">gpt-5-nano</span> and creates the claim record:
              </p>

              <div className="grid grid-cols-1 gap-2.5">
                {SAMPLE_CASE_PRESETS.map((preset) => (
                  <Card
                    key={preset.id}
                    onClick={() => !isProcessing && handleProcessPreset(preset.content)}
                    className="p-3.5 hover:bg-muted/40 transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground">
                        {preset.title}
                      </span>
                      <span className="font-mono font-bold text-destructive text-xs">
                        {preset.amount}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                      <Badge variant="secondary">CPT {preset.cpt}</Badge>
                      <Badge variant="outline" className="text-muted-foreground">
                        {preset.carc}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      <span>Click to extract with gpt-5-nano</span>
                      <span className="text-primary font-medium">1-Click &rarr;</span>
                    </div>
                  </Card>
                ))}
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground animate-pulse">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>{processingMessage}</span>
                </div>
              )}
            </TabsContent>

            {/* Tab 2: File Upload */}
            <TabsContent value="upload" className="space-y-4 pt-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-foreground/30 bg-muted/20 hover:bg-muted/40 p-8 text-center transition-all"
              >
                <UploadCloud className="mx-auto size-10 text-muted-foreground" />
                <div className="mt-2 text-xs font-semibold text-foreground">
                  {selectedFile
                    ? selectedFile.name
                    : "Select a Denial Letter PDF or Image"}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready to upload`
                    : "Supports multi-page PDF, PNG, JPG, JPEG, and TXT files"}
                </p>
              </div>

              {selectedFile && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    disabled={isProcessing}
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleProcessFile}
                    disabled={isProcessing}
                    className="gap-1.5"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>{processingMessage}</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="size-3.5" />
                        <span>Run Optical Parser</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Tab 3: Paste Text */}
            <TabsContent value="paste" className="space-y-3 pt-2">
              <Textarea
                rows={6}
                placeholder="Paste the full text of the denial letter, including claim number, procedure codes (CPT), denial reason code (e.g. CO-50), and denied amounts..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="font-mono text-xs"
              />

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleProcessText}
                  disabled={isProcessing || !pastedText.trim()}
                  className="gap-1.5"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{processingMessage}</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="size-3.5" />
                      <span>Extract with gpt-5-nano</span>
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Tab 4: AgentMail */}
            <TabsContent value="email" className="space-y-3 pt-2">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Dedicated AgentMail Ingestion Address
                  </span>
                  <Badge variant="outline" size="sm" className="gap-1 text-emerald-600 border-emerald-500/30">
                    <span className="size-1.5 rounded-full bg-emerald-500"></span>
                    Webhook Active
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="intake@claimhero.agentmail.com"
                    className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground select-all"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyEmail}
                    className="gap-1"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>

                <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground leading-relaxed pt-1">
                  <li>Patients or clinic billing staff forward denial notices directly to this address.</li>
                  <li>AgentMail provisions a thread and triggers the Convex webhook.</li>
                  <li>OpenAI extracts CPT codes and immediately initializes the case.</li>
                </ul>
              </Card>

              <div className="rounded-lg border border-border bg-muted/20 p-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="size-4 shrink-0 text-foreground" />
                <span>HIPAA Data Isolation & TLS End-to-End Encryption active.</span>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          /* Extraction Result Card */
          <Card className="p-4 space-y-4 border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                <FileCheck className="size-4" />
                <span>Case Initialized in Convex DB</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                Claim #{extractedResult.claimNumber}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Patient</span>
                <span className="font-semibold text-foreground">{extractedResult.patientName}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Payer</span>
                <span className="font-semibold text-foreground">{extractedResult.insurancePayer}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Denied Amount</span>
                <span className="font-bold font-mono text-destructive text-sm">
                  {formatCurrency(extractedResult.deniedAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Patient Responsibility</span>
                <span className="font-bold font-mono text-destructive text-sm">
                  {formatCurrency(extractedResult.patientOwedAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">CPT Codes</span>
                <span className="font-mono font-semibold text-foreground">
                  {extractedResult.cptCodes.join(", ") || "None"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Denial Code</span>
                <span className="font-mono font-semibold text-destructive">
                  {extractedResult.denialReasonCode}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-xs text-muted-foreground">
              <span className="text-foreground font-medium text-[11px] block">Denial Rationale:</span>
              <p className="mt-0.5">{extractedResult.denialReasonDescription}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExtractedResult(null)}
              >
                Ingest Another
              </Button>
              <Button
                size="sm"
                onClick={handleDone}
                className="gap-1.5"
              >
                <CheckCircle2 className="size-3.5" />
                <span>View in Case Radar</span>
              </Button>
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
