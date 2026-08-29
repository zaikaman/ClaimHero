import React, { useState, useRef } from "react";
import {
  CloudArrowUp,
  FileText,
  Envelope,
  CheckCircle,
  Copy,
  Check,
  Shield,
  CircleNotch,
  FileDoc,
  WarningCircle,
  Sparkle,
  FileMagnifyingGlass,
} from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DenialExtractionResult } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
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
import { Select } from "../ui/select";

const convexApi = api as any;

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
  onSuccess: (claimId: string, directView?: string) => void;
}

const SAMPLE_CASE_PRESETS = [
  {
    id: "molina_knee",
    title: "Molina Healthcare — Total Knee Arthroplasty",
    payer: "Molina Healthcare",
    amount: "$24,500",
    cpt: "27447",
    carc: "CO-50 (Not Medically Necessary)",
    content: `MOLINA HEALTHCARE OF FLORIDA
EXPLANATION OF BENEFITS / NOTICE OF ADVERSE BENEFIT DETERMINATION
Claim Reference: CLM-8942-MOL
Member ID: MOL-982341-01
Patient Name: Eleanor Vance
Date of Birth: 1968-04-14
Date of Service: 06/12/2026
Treating Provider: Dr. Robert Langston, MD (Advanced Orthopedic Institute)
Facility: Sunstate Surgical Hospital

Services Rendered:
- CPT Code 27447: Total Knee Arthroplasty (TKA), right knee
- ICD-10 Code M17.11: Primary osteoarthritis, right knee
- Total Billed Amount: $24,500.00
- Plan Allowance / Paid: $0.00
- Denied Amount: $24,500.00
- Patient Financial Liability: $24,500.00

Adjudication & Claim Denial Reason:
Code CO-50: These are non-covered services because this is not deemed a medical necessity by the payer.
Clinical Rationale: Under Molina Healthcare Clinical Coverage Guideline MCP-082, total knee arthroplasty requires documented failure of at least 12 weeks of non-surgical conservative therapy (including formal physical therapy, intra-articular corticosteroid injections, and prescription NSAIDs). Clinical records submitted fail to establish consecutive supervised physical therapy.

Statutory Notice of Appeal Rights:
You have the right to an internal appeal pursuant to ERISA 29 CFR § 2560.503-1 and ACA 45 CFR § 147.136. You must submit your written appeal within 180 calendar days from the date of this determination notice.
Appeals Intake Destination:
Email: MFLGrievanceandAppealsDepartment@MolinaHealthcare.com
Mailing Address: Molina Healthcare of Florida, Grievance and Appeals Dept., P.O. Box 521838, Longwood, FL 32752
Appeals Fax: 1-877-508-5748`,
  },
  {
    id: "geoblue_spine",
    title: "GeoBlue (BCBS Global) — Lumbar Decompression",
    payer: "GeoBlue",
    amount: "$18,200",
    cpt: "63047",
    carc: "CO-197 (Prior Auth Lacking)",
    content: `GEOBLUE WORLDWIDE MEDICAL INSURANCE
NOTICE OF CLAIM ADVERSE DETERMINATION & BENEFIT SUMMARY
Claim Reference: CLM-6104-GEO
Member ID: GEO-554210-99
Patient Name: Marcus Sterling
Date of Service: 07/04/2026
Provider: Dr. Sarah Chen, MD (Spine & Neurosurgery Associates)
Facility: International Spine Institute

Procedure & Clinical Codes:
- CPT 63047: Laminectomy, facetectomy and foraminotomy with decompression of spinal cord, single segment lumbar
- ICD-10 M51.26: Other intervertebral disc displacement, lumbar region
- Total Billed: $18,200.00
- Amount Denied: $18,200.00
- Patient Responsibility: $18,200.00

Denial Adjudication Reason:
Code CO-197: Precertification / prior authorization / notification absent or lacking.
Description: Surgical treatment for lumbar spinal stenosis was performed without securing prior authorization from GeoBlue Medical Review Department prior to the date of service.

Appeals Procedure & Filing Instructions:
In accordance with federal regulations under 29 CFR § 2560.503-1, you or your authorized representative have 180 days from receipt of this notice to file a Level 1 appeal demonstrating emergency medical necessity or retroactive pre-authorization criteria under Policy SURG.00011.
Submit complete appeal dossier and clinical records to:
Official Claims & Appeals Email: claims@geo-blue.com
Mailing Address: GeoBlue Claims Appeals Unit, One Radnor Corporate Center, Suite 100, Radnor, PA 19087
Appeals Fax: 1-610-482-9623`,
  },
  {
    id: "bcbsglobal_mri",
    title: "BCBS Global Core — Knee MRI Scan",
    payer: "Blue Cross Blue Shield Global Core",
    amount: "$2,850",
    cpt: "73721",
    carc: "CO-16 (Missing Plain Radiographs)",
    content: `BLUE CROSS BLUE SHIELD GLOBAL CORE
ADVERSE CLAIM ADJUDICATION NOTICE
Claim Number: CLM-3912-BCG
Member: Michael Patel (ID: BCG-773419-02)
Date of Service: 07/18/2026
Provider: Global Diagnostic Imaging Group

Services:
- CPT 73721: Magnetic resonance imaging, any joint of lower extremity; without contrast material (Knee MRI)
- ICD-10 M23.22: Derangement of meniscus due to old tear or injury, right knee
- Billed: $2,850.00
- Paid: $0.00
- Denied: $2,850.00
- Patient Due: $2,850.00

Denial Rationale:
Code CO-16: Claim lacks information or has submission error.
Coverage Policy RAD.00002 requires documented weight-bearing plain radiographs performed within the preceding 6 months prior to approval of magnetic resonance imaging for non-acute knee pain.

Statutory Rights & Appeal Submission:
You have 180 days to request an administrative ERISA reconsideration under 29 CFR § 2560.503-1.
Submit formal appeal memorandum and physician attestation to:
Appeals Intake Email: claims@bcbsglobalcore.com
Service Center Address: BCBS Global Core Service Center, P.O. Box 2048, Richmond, VA 23218-2048
Appeals Fax: 1-804-673-1179`,
  },
];

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onUploadFile,
  onParseText,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState("presets");
  const [patientState, setPatientState] = useState("California");
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState(
    "Analyzing denial document..."
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<
    (DenialExtractionResult & { claimId: string; pipelineResult?: any }) | null
  >(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const runPipelineAction = useAction(
    convexApi["actions/sentinelPipeline"]?.runAutonomousPipeline ||
    convexApi.actions?.sentinelPipeline?.runAutonomousPipeline
  );

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

  const executePostExtractionPipeline = async (claimId: string) => {
    if (!autoPilotEnabled || !runPipelineAction) return null;

    setProcessingMessage("Step 2/3: Indexing Insurer CPB & Evaluating Win Score...");
    try {
      const pipelineRes = await runPipelineAction({ claimId: claimId as any });
      setProcessingMessage("Step 3/3: Synthesizing cited ERISA medical appeal brief...");
      return pipelineRes;
    } catch (pipelineErr) {
      console.warn("Pipeline error, falling back to basic extraction:", pipelineErr);
      return null;
    }
  };

  const handleProcessFile = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select a denial letter PDF or image file.");
      return;
    }

    setIsProcessing(true);
    setProcessingMessage("Step 1/3: Optical document analysis & clinical entity extraction...");
    setErrorMessage(null);

    try {
      const result = await onUploadFile(selectedFile, patientState);
      let pipelineResult = null;
      if (autoPilotEnabled && result?.claimId) {
        pipelineResult = await executePostExtractionPipeline(result.claimId);
      }
      setExtractedResult({ ...result, pipelineResult });
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          "Failed to parse denial document. Please verify the document format or try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessPreset = async (presetContent: string) => {
    setIsProcessing(true);
    setProcessingMessage("Step 1/3: Extracting CPT, CARC & ERISA statutory deadlines...");
    setErrorMessage(null);

    try {
      const result = await onParseText(presetContent, patientState);
      let pipelineResult = null;
      if (autoPilotEnabled && result?.claimId) {
        pipelineResult = await executePostExtractionPipeline(result.claimId);
      }
      setExtractedResult({ ...result, pipelineResult });
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
    setProcessingMessage("Step 1/3: Parsing clinical records & denial rationale...");
    setErrorMessage(null);

    try {
      const result = await onParseText(pastedText, patientState);
      let pipelineResult = null;
      if (autoPilotEnabled && result?.claimId) {
        pipelineResult = await executePostExtractionPipeline(result.claimId);
      }
      setExtractedResult({ ...result, pipelineResult });
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          "Failed to extract claim information. Please check your document text."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = (targetView?: string) => {
    if (extractedResult?.claimId) {
      onSuccess(extractedResult.claimId, targetView || "evidence");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 gap-5">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CloudArrowUp className="size-4.5" />
            </div>
            <div>
              <DialogTitle>Ingest Denial Document</DialogTitle>
              <DialogDescription>
                Automated clinical record extraction & real-time case indexing
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* State Jurisdiction & Autonomous Auto-Pilot Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="flex items-center justify-between gap-2 bg-muted/40 border border-border p-2 rounded-lg text-xs">
            <span className="text-muted-foreground font-medium truncate">Jurisdiction:</span>
            <Select
              value={patientState}
              onChange={(e) => setPatientState(e.target.value)}
              className="h-7 text-xs font-sans border-border/80"
            >
              <option value="California">California (ERISA 180d)</option>
              <option value="New York">New York (DFS 180d)</option>
              <option value="Texas">Texas (TDI 180d)</option>
              <option value="Florida">Florida (FL DOI)</option>
              <option value="Illinois">Illinois (IDFPR)</option>
              <option value="Pennsylvania">Pennsylvania (PID)</option>
            </Select>
          </div>

          <div
            onClick={() => setAutoPilotEnabled(!autoPilotEnabled)}
            className={cn(
              "flex items-center justify-between gap-2 border p-2 rounded-lg text-xs cursor-pointer transition-all",
              autoPilotEnabled
                ? "bg-primary/10 border-primary/40 text-primary font-medium"
                : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkle className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">Auto-Pilot Pipeline</span>
            </div>
            <Badge
              variant={autoPilotEnabled ? "default" : "outline"}
              className="text-[9px] font-mono shrink-0 px-1.5 py-0"
            >
              {autoPilotEnabled ? "ON (Auto-Solve)" : "OFF (Manual)"}
            </Badge>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-2 text-xs text-destructive">
            <WarningCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!extractedResult ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="presets" className="gap-1.5">
                <Sparkle className="size-3.5" />
                <span>1-Click Presets</span>
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-1.5">
                <CloudArrowUp className="size-3.5" />
                <span>File Upload</span>
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5">
                <FileText className="size-3.5" />
                <span>Paste Text</span>
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5">
                <Envelope className="size-3.5" />
                <span>Electronic Intake</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: 1-Click Presets */}
            <TabsContent value="presets" className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Select a sample medical denial case. Clicking a preset immediately analyzes the clinical criteria and creates the claim record:
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
                      <span>Click to load & analyze case</span>
                      <span className="text-primary font-medium">1-Click &rarr;</span>
                    </div>
                  </Card>
                ))}
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground animate-pulse">
                  <CircleNotch className="size-4 animate-spin text-primary" />
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
                <CloudArrowUp className="mx-auto size-10 text-muted-foreground" />
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
                        <CircleNotch className="size-3.5 animate-spin" />
                        <span>{processingMessage}</span>
                      </>
                    ) : (
                      <>
                        <FileDoc className="size-3.5" />
                        <span>Process Denial Document</span>
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
                      <CircleNotch className="size-3.5 animate-spin" />
                      <span>{processingMessage}</span>
                    </>
                  ) : (
                    <>
                      <FileDoc className="size-3.5" />
                      <span>Analyze Denial Notice</span>
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Tab 4: Electronic Intake */}
            <TabsContent value="email" className="space-y-3 pt-2">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Dedicated Electronic Intake Address
                  </span>
                  <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30">
                    <span className="size-1.5 rounded-full bg-emerald-500"></span>
                    Intake Active
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
                  <li>ClaimHero automatically provisions a dedicated case inbox.</li>
                  <li>Clinical intelligence extracts CPT codes and immediately initializes the case record.</li>
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
                <CheckCircle className="size-4" />
                <span>Case Initialized & Indexed</span>
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

            {extractedResult.pipelineResult && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-foreground font-semibold">
                  <Sparkle className="size-3.5 text-primary shrink-0" />
                  <span>Auto-Pilot: Brief Synthesized & Policy Cited</span>
                </div>
                {extractedResult.pipelineResult.overturnProbabilityScore !== undefined && (
                  <Badge variant="secondary" className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {extractedResult.pipelineResult.overturnProbabilityScore}% Win Score
                  </Badge>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExtractedResult(null)}
                className="text-xs"
              >
                Ingest Another
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDone("radar")}
                className="gap-1 text-xs"
              >
                <span>View in Radar</span>
              </Button>
              <Button
                size="sm"
                onClick={() => handleDone("evidence")}
                className="gap-1.5 text-xs bg-primary text-primary-foreground shadow-2xs font-semibold"
              >
                <FileMagnifyingGlass className="size-3.5" />
                <span>Review Evidence & CPB &rarr;</span>
              </Button>
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
