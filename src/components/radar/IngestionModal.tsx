import React, { useState, useRef, useEffect } from "react";
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
  ArrowRight,
  ArrowLeft,
} from "@phosphor-icons/react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ClinicalFacts, ClinicalIntakeQuestion, DenialExtractionResult } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { SAMPLE_CASE_PRESETS, SampleCasePreset } from "../../lib/constants";
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
import { Input } from "../ui/input";

const convexApi = api as any;

const DEFAULT_CLINICAL_QUESTIONS: ClinicalIntakeQuestion[] = [
  {
    field: "symptomsAndFunctionalImpact",
    question: "What symptoms or day-to-day functional limitations are explicitly described in the available record?",
    whyItMatters: "This captures the documented presentation without inferring severity from a code.",
  },
  {
    field: "examinationFindings",
    question: "What examination findings are documented by a treating clinician?",
    whyItMatters: "The appeal can reference findings only when they appear in the record.",
  },
  {
    field: "imagingAndDiagnostics",
    question: "What imaging, laboratory, or other diagnostic findings are documented, including dates if available?",
    whyItMatters: "Objective results may help the payer compare the record with its stated criteria.",
  },
  {
    field: "treatmentHistoryAndResponse",
    question: "What prior treatments are documented, and what response or outcome is recorded?",
    whyItMatters: "This preserves treatment history as reported instead of assuming that treatment failed.",
  },
  {
    field: "otherDocumentedFacts",
    question: "Are there any other documented facts relevant to the denial, such as authorization communications or an urgent-care rationale?",
    whyItMatters: "This gives the record a place for denial-specific facts that do not fit the clinical categories above.",
  },
];

const EMPTY_CLINICAL_FACTS: ClinicalFacts = {
  symptomsAndFunctionalImpact: "",
  examinationFindings: "",
  imagingAndDiagnostics: "",
  treatmentHistoryAndResponse: "",
  otherDocumentedFacts: "",
  recordsAreIncomplete: true,
};

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
  const [activePreset, setActivePreset] = useState<SampleCasePreset | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [contextSubmitted, setContextSubmitted] = useState(false);
  const [isPreparingContext, setIsPreparingContext] = useState(false);
  const [intakeQuestions, setIntakeQuestions] = useState<ClinicalIntakeQuestion[]>(DEFAULT_CLINICAL_QUESTIONS);
  const [senderName, setSenderName] = useState("");
  const [senderCredentials, setSenderCredentials] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [clinicalFacts, setClinicalFacts] = useState<ClinicalFacts>(EMPTY_CLINICAL_FACTS);
  const [physicianNotes, setPhysicianNotes] = useState("");
  const [contextAcknowledged, setContextAcknowledged] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("presets");
      setSelectedFile(null);
      setPastedText("");
      setIsProcessing(false);
      setProcessingMessage("Analyzing denial document...");
      setErrorMessage(null);
      setExtractedResult(null);
      setActivePreset(null);
      setCopiedEmail(false);
      setContextSubmitted(false);
      setIsPreparingContext(false);
      setIntakeQuestions(DEFAULT_CLINICAL_QUESTIONS);
      setSenderName("");
      setSenderCredentials("");
      setSenderEmail("");
      setSenderPhone("");
      setClinicalFacts(EMPTY_CLINICAL_FACTS);
      setPhysicianNotes("");
      setContextAcknowledged(false);
    }
  }, [isOpen]);

  const runPipelineAction = useAction(
    convexApi["actions/sentinelPipeline"]?.runAutonomousPipeline ||
    convexApi.actions?.sentinelPipeline?.runAutonomousPipeline
  );
  const generateIntakeQuestionsAction = useAction(
    convexApi["actions/clinicalIntake"]?.generateClinicalIntakeQuestions ||
    convexApi.actions?.clinicalIntake?.generateClinicalIntakeQuestions
  );
  const updateAppealContextMutation = useMutation(convexApi.claims.updateAppealContext);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("claimhero-intake@agentmail.to");
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
      const pipelineRes = await runPipelineAction({
        claimId: claimId as any,
        sender: {
          name: senderName.trim(),
          credentials: senderCredentials.trim() || undefined,
          email: senderEmail.trim() || undefined,
          phone: senderPhone.trim() || undefined,
        },
        clinicalFacts,
        physicianNotes: physicianNotes.trim() || undefined,
      });
      setProcessingMessage("Step 3/3: Synthesizing cited ERISA medical appeal brief...");
      return pipelineRes;
    } catch (pipelineErr) {
      console.warn("Pipeline stopped because clinical policy evidence could not be retrieved:", pipelineErr);
      throw pipelineErr;
    }
  };

  const prepareContextReview = async (
    result: DenialExtractionResult & { claimId: string },
    preset?: SampleCasePreset
  ) => {
    setExtractedResult({ ...result, pipelineResult: null });
    setContextSubmitted(false);
    setActivePreset(preset || null);

    if (preset) {
      setIntakeQuestions(preset.questions);
      setClinicalFacts({ ...preset.clinicalFacts });
      setPhysicianNotes(preset.physicianNotes || "");
      setSenderName(preset.sender.name);
      setSenderCredentials(preset.sender.credentials);
      setSenderEmail(preset.sender.email);
      setSenderPhone(preset.sender.phone);
      setContextAcknowledged(true);
      setIsPreparingContext(false);
      return;
    }

    setContextAcknowledged(false);
    setIntakeQuestions(DEFAULT_CLINICAL_QUESTIONS);
    setClinicalFacts({ ...EMPTY_CLINICAL_FACTS });
    setPhysicianNotes("");
    setSenderName("");
    setSenderCredentials("");
    setSenderEmail("");
    setSenderPhone("");
    setIsPreparingContext(true);

    try {
      if (generateIntakeQuestionsAction) {
        const generated = await generateIntakeQuestionsAction({
          denialReasonCode: result.denialReasonCode,
          denialReasonDescription: result.denialReasonDescription,
          cptCodes: result.cptCodes,
          icd10Codes: result.icd10Codes,
        });
        if (generated?.questions?.length) setIntakeQuestions(generated.questions);
      }
    } catch (questionErr) {
      console.warn("Using neutral clinical intake questions:", questionErr);
      setIntakeQuestions(DEFAULT_CLINICAL_QUESTIONS);
    } finally {
      setIsPreparingContext(false);
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
      await prepareContextReview(result);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          "Failed to parse denial document. Please verify the document format or try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessPreset = async (preset: SampleCasePreset) => {
    setIsProcessing(true);
    setProcessingMessage("Step 1/3: Extracting CPT, CARC & ERISA statutory deadlines...");
    setErrorMessage(null);

    try {
      const result = await onParseText(preset.content, patientState);
      await prepareContextReview(result, preset);
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
      await prepareContextReview(result);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          "Failed to extract claim information. Please check your document text."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmContext = async () => {
    if (!extractedResult?.claimId) return;

    const normalizedEmail = senderEmail.trim();
    const normalizedPhone = senderPhone.trim();
    if (!senderName.trim()) {
      setErrorMessage("Enter the name of the person who will submit the appeal.");
      return;
    }
    if (!normalizedEmail && !normalizedPhone) {
      setErrorMessage("Add an email address or phone number so the payer can contact the sender.");
      return;
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMessage("Enter a valid sender email address or leave it blank when a phone number is provided.");
      return;
    }
    if (!contextAcknowledged) {
      setErrorMessage("Confirm that the entries are drawn from the available record and that blanks mean unavailable.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await updateAppealContextMutation({
        claimId: extractedResult.claimId as any,
        sender: {
          name: senderName.trim(),
          credentials: senderCredentials.trim() || undefined,
          email: normalizedEmail || undefined,
          phone: normalizedPhone || undefined,
        },
        clinicalFacts: {
          ...clinicalFacts,
          symptomsAndFunctionalImpact: clinicalFacts.symptomsAndFunctionalImpact?.trim() || undefined,
          examinationFindings: clinicalFacts.examinationFindings?.trim() || undefined,
          imagingAndDiagnostics: clinicalFacts.imagingAndDiagnostics?.trim() || undefined,
          treatmentHistoryAndResponse: clinicalFacts.treatmentHistoryAndResponse?.trim() || undefined,
          otherDocumentedFacts: clinicalFacts.otherDocumentedFacts?.trim() || undefined,
        },
        physicianNotes: physicianNotes.trim() || undefined,
      });

      let pipelineResult = null;
      if (autoPilotEnabled) pipelineResult = await executePostExtractionPipeline(extractedResult.claimId);
      setExtractedResult((current) => current ? { ...current, pipelineResult } : current);
      setContextSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err?.message || "Could not save the case context. Please try again.");
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6 gap-5">
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
                    onClick={() => !isProcessing && handleProcessPreset(preset)}
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
                    ClaimHero Electronic Intake
                  </span>
                  <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30">
                    <span className="size-1.5 rounded-full bg-emerald-500"></span>
                    Live inbound digestion
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="claimhero-intake@agentmail.to"
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
                  <li>Forward a denial letter or EOB here from an authorized patient or clinic mailbox.</li>
                  <li>ClaimHero reads the email body and supported PDF, image, or text attachments.</li>
                  <li>The denial is extracted into a new case and appears in Case Radar for context confirmation.</li>
                </ul>
              </Card>

              <div className="rounded-lg border border-border bg-muted/20 p-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="size-4 shrink-0 text-foreground" />
                <span>AgentMail transport and Convex storage handle the inbound document securely. Send only records you are authorized to share.</span>
              </div>
            </TabsContent>
          </Tabs>
        ) : !contextSubmitted ? (
          <Card className="p-5 space-y-6 border-border bg-card/85 shadow-sm rounded-xl">
            {/* Header Status Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Confirm Case Context & Records
                  </h3>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] font-mono px-2 py-0.5">
                    Drafting Paused
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {activePreset
                    ? "Verified clinical records and appellate submitter coordinates have been loaded for this case preset. Review findings or edit any field before generating the appeal."
                    : "The denial has been extracted. Document what the medical charts explicitly state; leave fields blank when unrecorded to avoid unsupported assertions."}
                </p>
              </div>
            </div>

            {/* Section 1: Authorized Submitter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-[11px]">
                    Authorized Submitter
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Person or coordinator submitting the formal appeal.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                  Required
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ingest-sender-name" className="mb-1 block text-[11px] font-medium text-foreground">
                    Full Name
                  </label>
                  <Input
                    id="ingest-sender-name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Jordan Lee"
                    maxLength={200}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ingest-sender-role" className="mb-1 block text-[11px] font-medium text-foreground">
                    Credentials or Role <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    id="ingest-sender-role"
                    value={senderCredentials}
                    onChange={(e) => setSenderCredentials(e.target.value)}
                    placeholder="Appeals Coordinator"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label htmlFor="ingest-sender-email" className="mb-1 block text-[11px] font-medium text-foreground">
                    Email Address <span className="font-normal text-muted-foreground">(or phone)</span>
                  </label>
                  <Input
                    id="ingest-sender-email"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="jordan.lee@clinic.org"
                    maxLength={320}
                  />
                </div>
                <div>
                  <label htmlFor="ingest-sender-phone" className="mb-1 block text-[11px] font-medium text-foreground">
                    Phone Number <span className="font-normal text-muted-foreground">(or email)</span>
                  </label>
                  <Input
                    id="ingest-sender-phone"
                    type="tel"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    placeholder="(555) 010-0142"
                    maxLength={80}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Documented Clinical Findings */}
            <div className="space-y-4 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-[11px]">
                    Documented Clinical Findings
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {activePreset
                      ? "Objective clinical findings, functional limitations, and diagnostic results loaded from this case preset."
                      : "Prompts tailored to this denial. Enter factual findings from the medical records; leave blank if unavailable."}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                  {activePreset ? "Preset Clinical Facts" : "Clinical Prompts"}
                </Badge>
              </div>

              {isPreparingContext ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground" role="status">
                  <CircleNotch className="size-3.5 animate-spin text-primary" />
                  <span>Preparing denial-specific clinical prompts...</span>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {intakeQuestions.map((question) => (
                    <div key={question.field} className="space-y-1">
                      <label htmlFor={`clinical-${question.field}`} className="block text-xs font-medium leading-relaxed text-foreground">
                        {question.question}
                      </label>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">{question.whyItMatters}</p>
                      <Textarea
                        id={`clinical-${question.field}`}
                        rows={3}
                        value={clinicalFacts[question.field] || ""}
                        onChange={(e) => setClinicalFacts((current) => ({ ...current, [question.field]: e.target.value }))}
                        placeholder="Leave blank if this is not documented in available records."
                        maxLength={10000}
                        className="bg-background text-xs leading-relaxed"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 3: Treating Physician Notes & Clinical Addendum */}
            <div className="space-y-3 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-[11px]">
                    Treating Physician Notes & Clinical Addendum
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {activePreset
                      ? "Pre-filled treating physician clinical chart notes, therapy logs, and surgical necessity attestation."
                      : "Optional clinical narrative, therapy logs, or physician statement. Incorporated directly into the synthesized appeal brief."}
                  </p>
                </div>
                <Badge variant={physicianNotes ? "secondary" : "outline"} className="text-[10px] font-mono shrink-0">
                  {physicianNotes ? "Notes Loaded" : "Optional"}
                </Badge>
              </div>
              <Textarea
                id="ingest-physician-notes"
                rows={8}
                value={physicianNotes}
                onChange={(e) => setPhysicianNotes(e.target.value)}
                placeholder="Paste treating physician clinical chart notes, therapy logs, or medical necessity statement..."
                maxLength={15000}
                className="bg-background text-xs font-mono leading-relaxed"
              />
            </div>

            {/* Section 4: Attestation */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3.5 text-[11px] leading-relaxed text-muted-foreground hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={contextAcknowledged}
                onChange={(e) => setContextAcknowledged(e.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 accent-primary"
              />
              <span>
                {activePreset
                  ? "I confirm that the clinical entries and submitter details above reflect the verified case records and are ready for policy citation and appeal brief synthesis."
                  : "I confirm that the entries above reflect the available medical record. Blank sections mean the information is unrecorded; ClaimHero will not infer medical necessity."}
              </span>
            </label>

            {/* Section 5: Action Footer */}
            <div className="flex flex-col-reverse justify-between gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExtractedResult(null)}
                disabled={isProcessing}
                className="gap-1.5 text-xs"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to intake</span>
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmContext}
                disabled={isProcessing || isPreparingContext || !contextAcknowledged}
                className="gap-1.5 text-xs font-semibold"
              >
                {isProcessing ? (
                  <>
                    <CircleNotch className="size-3.5 animate-spin" />
                    <span>{autoPilotEnabled ? "Saving context & analyzing..." : "Saving context..."}</span>
                  </>
                ) : (
                  <>
                    <span>{autoPilotEnabled ? "Save context & run analysis" : "Save context"}</span>
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            </div>
          </Card>
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

            {extractedResult.pipelineResult ? (
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
            ) : (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                Case context saved. Automated analysis is paused; you can run it later from the Evidence or Appeal Studio view.
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
                onClick={() => handleDone(autoPilotEnabled ? "evidence" : "studio")}
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
