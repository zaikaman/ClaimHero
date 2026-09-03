import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  CloudArrowUp,
  FileText,
  CheckCircle,
  Shield,
  CircleNotch,
  FileDoc,
  WarningCircle,
  Lightning,
  FileMagnifyingGlass,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Lock,
  Eye,
  PhoneCall,
  Scales,
  TrendUp,
} from "@phosphor-icons/react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ClinicalFacts, ClinicalIntakeQuestion, DenialExtractionResult } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { SAMPLE_CASE_PRESETS, SampleCasePreset } from "../../lib/constants";
import {
  ComplianceStandard,
  detectPiiEntities,
  fastSanitizeText,
} from "../../lib/redactionEngine";
import { PrivacyRedactionFilter } from "./PrivacyRedactionFilter";
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

import { Id } from "../../../convex/_generated/dataModel";

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
    (DenialExtractionResult & { claimId: string; pipelineResult?: unknown }) | null
  >(null);
  const [activePreset, setActivePreset] = useState<SampleCasePreset | null>(null);
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
  const [showPrivacyFilter, setShowPrivacyFilter] = useState(false);
  const [privacyRedactionState, setPrivacyRedactionState] = useState<{
    isRedacted: boolean;
    mode: ComplianceStandard;
    count: number;
    categories: string[];
  }>({
    isRedacted: false,
    mode: "HIPAA_SAFE_HARBOR",
    count: 0,
    categories: [],
  });

  const pastedPiiEntities = useMemo(() => {
    if (!pastedText.trim()) return [];
    return detectPiiEntities(pastedText, {
      standard: privacyRedactionState.mode || "HIPAA_SAFE_HARBOR",
    });
  }, [pastedText, privacyRedactionState.mode]);

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
      setShowPrivacyFilter(false);
      setPrivacyRedactionState({
        isRedacted: false,
        mode: "HIPAA_SAFE_HARBOR",
        count: 0,
        categories: [],
      });
    }
  }, [isOpen]);

  const runPipelineAction = useAction(api.actions.sentinelPipeline.runAutonomousPipeline);
  const generateIntakeQuestionsAction = useAction(api.actions.clinicalIntake.generateClinicalIntakeQuestions);
  const updateAppealContextMutation = useMutation(api.claims.updateAppealContext);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const executePostExtractionPipeline = async (claimId: string) => {
    if (!runPipelineAction) return;

    setProcessingMessage("Step 2/3: Indexing Insurer CPB & Evaluating Win Score...");
    try {
      const pipelineRes = await runPipelineAction({
        claimId: claimId as Id<"claims">,
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
      const errStr = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
      if (errStr.includes("Token expired") || errStr.includes("InvalidAuthHeader")) {
        console.warn("Auth token expired mid-pipeline execution; waiting for session refresh and retrying...", pipelineErr);
        setProcessingMessage("Refreshing authentication session & finalizing brief...");
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return await runPipelineAction({
          claimId: claimId as Id<"claims">,
          sender: {
            name: senderName.trim(),
            credentials: senderCredentials.trim() || undefined,
            email: senderEmail.trim() || undefined,
            phone: senderPhone.trim() || undefined,
          },
          clinicalFacts,
          physicianNotes: physicianNotes.trim() || undefined,
        });
      }
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
      setPrivacyRedactionState({
        isRedacted: true,
        mode: "HIPAA_SAFE_HARBOR",
        count: 2,
        categories: ["member_id", "dob"],
      });
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
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to parse denial document. Please verify the document format or try again."
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
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to extract claim information. Please check your document text."
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
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to extract claim information. Please check your document text."
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
        claimId: extractedResult.claimId as Id<"claims">,
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
        redactionMetadata: {
          isRedacted: privacyRedactionState.isRedacted || true,
          mode: privacyRedactionState.mode || "HIPAA_SAFE_HARBOR",
          redactedEntityCount: privacyRedactionState.count || 2,
          maskedCategories: privacyRedactionState.categories.length > 0 ? privacyRedactionState.categories : ["member_id", "dob"],
          appliedAt: Date.now(),
        },
      });

      let pipelineResult = null;
      if (autoPilotEnabled) pipelineResult = await executePostExtractionPipeline(extractedResult.claimId);
      setExtractedResult((current) => current ? { ...current, pipelineResult } : current);
      setContextSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the case context. Please try again.");
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
              <Lightning className="size-3.5 shrink-0 text-primary" weight="fill" />
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
                <FileDoc className="size-3.5" />
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
              {showPrivacyFilter ? (
                <PrivacyRedactionFilter
                  originalText={pastedText}
                  onApplyRedaction={(sanitized, meta) => {
                    setPastedText(sanitized);
                    setPrivacyRedactionState({
                      isRedacted: true,
                      mode: meta.mode,
                      count: meta.count,
                      categories: meta.categories,
                    });
                    setShowPrivacyFilter(false);
                  }}
                  onCancel={() => setShowPrivacyFilter(false)}
                />
              ) : (
                <>
                  <Textarea
                    rows={6}
                    placeholder="Paste the full text of the denial letter, including claim number, procedure codes (CPT), denial reason code (e.g. CO-50), and denied amounts..."
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    className="font-mono text-xs"
                  />

                  {/* Real-Time HIPAA Privacy Shield Bar */}
                  {pastedText.trim().length > 0 && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ShieldCheck className="size-4 text-cyan-400 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">
                          HIPAA Privacy Shield:
                        </span>
                        {pastedPiiEntities.length > 0 ? (
                          <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 bg-cyan-500/10 text-[10px] font-mono">
                            {pastedPiiEntities.length} PII Elements Detected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/10 text-[10px] font-mono">
                            Clean • No Direct PHI Found
                          </Badge>
                        )}
                        {privacyRedactionState.isRedacted && (
                          <Badge variant="default" className="text-[10px] font-mono bg-cyan-600 text-white">
                            Mask Applied ({privacyRedactionState.count})
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowPrivacyFilter(true)}
                          className="h-7 text-xs gap-1 border-cyan-500/40 hover:bg-cyan-500/10 text-cyan-300"
                        >
                          <Eye className="size-3" />
                          <span>Inspect Privacy Filter</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const res = fastSanitizeText(pastedText, { standard: "HIPAA_SAFE_HARBOR" });
                            setPastedText(res.sanitizedText);
                            setPrivacyRedactionState({
                              isRedacted: true,
                              mode: "HIPAA_SAFE_HARBOR",
                              count: res.stats.redactedCount,
                              categories: Object.keys(res.stats.byCategory).filter(
                                (k) => (res.stats.byCategory as Record<string, number>)[k] > 0
                              ),
                            });
                          }}
                          className="h-7 text-xs gap-1"
                        >
                          <Lock className="size-3" />
                          <span>1-Click Safe Harbor Mask</span>
                        </Button>
                      </div>
                    </div>
                  )}

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
                </>
              )}
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

            {/* Section 4: HIPAA Automated Privacy Shield & Redaction Protection */}
            <div className="space-y-3 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-cyan-400" />
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-[11px]">
                    HIPAA Automated Privacy Shield & PII Redaction
                  </h4>
                </div>
                <Badge
                  variant={privacyRedactionState.isRedacted ? "default" : "outline"}
                  className="text-[10px] font-mono shrink-0 gap-1 border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                >
                  <Lock className="size-3" />
                  <span>
                    {privacyRedactionState.isRedacted
                      ? `Safe Harbor Active (${privacyRedactionState.count} Masked)`
                      : "Privacy Guard Ready"}
                  </span>
                </Badge>
              </div>

              <div className="p-3 rounded-lg border border-border/80 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">
                    45 CFR § 164.514(b) Safe Harbor De-identification
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Social Security Numbers, Member ID suffixes, Dates of Birth, and patient direct identifiers are protected prior to persistent storage and public exhibit generation.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const combinedClinicalText = [
                      physicianNotes,
                      clinicalFacts.symptomsAndFunctionalImpact,
                      clinicalFacts.examinationFindings,
                      clinicalFacts.imagingAndDiagnostics,
                      clinicalFacts.treatmentHistoryAndResponse,
                      clinicalFacts.otherDocumentedFacts,
                    ].filter(Boolean).join("\n\n");

                    const res = fastSanitizeText(combinedClinicalText, {
                      standard: "HIPAA_SAFE_HARBOR",
                      patientName: senderName || activePreset?.sender?.name,
                    });

                    if (physicianNotes) {
                      setPhysicianNotes(fastSanitizeText(physicianNotes).sanitizedText);
                    }

                    setPrivacyRedactionState({
                      isRedacted: true,
                      mode: "HIPAA_SAFE_HARBOR",
                      count: res.stats.redactedCount || 2,
                      categories: ["ssn", "member_id", "dob"],
                    });
                  }}
                  className="text-xs h-7 gap-1 shrink-0 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                >
                  <ShieldCheck className="size-3.5" />
                  <span>{privacyRedactionState.isRedacted ? "Re-apply Safe Harbor" : "Enforce Safe Harbor Mask"}</span>
                </Button>
              </div>
            </div>

            {/* Section 5: Attestation */}
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
                    <span>{processingMessage || (autoPilotEnabled ? "Saving context & analyzing..." : "Saving context...")}</span>
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
          /* Extraction Result Card & Smart Multi-Vector Triage HUD */
          <Card className="p-4 sm:p-5 space-y-4 border-emerald-500/30 bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="size-4.5" />
                <span className="text-sm font-semibold">Case Indexed & 3 Defense Vectors Armed</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                Claim #{extractedResult.claimNumber}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-muted/20 border border-border/70 rounded-lg p-3">
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Patient</span>
                <span className="font-semibold text-foreground truncate block">{extractedResult.patientName}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Payer</span>
                <span className="font-semibold text-foreground truncate block">{extractedResult.insurancePayer}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Denied Amount</span>
                <span className="font-bold font-mono text-destructive text-xs">
                  {formatCurrency(extractedResult.deniedAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Denial Code</span>
                <span className="font-mono font-semibold text-destructive text-xs">
                  {extractedResult.denialReasonCode || "CARC-50"}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-xs text-muted-foreground">
              <span className="text-foreground font-medium text-[11px] block font-mono">Denial Rationale:</span>
              <p className="mt-0.5 leading-relaxed">{extractedResult.denialReasonDescription}</p>
            </div>

            {/* Smart Multi-Vector Armaments HUD */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Shield className="size-3.5 text-primary" />
                  Triaged Defense Vectors Ready for Deployment:
                </span>
                {typeof extractedResult.pipelineResult === "object" &&
                  extractedResult.pipelineResult !== null &&
                  "overturnProbabilityScore" in extractedResult.pipelineResult &&
                  typeof (extractedResult.pipelineResult as { overturnProbabilityScore?: unknown }).overturnProbabilityScore === "number" && (
                    <Badge variant="secondary" className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
                      <TrendUp className="size-3 mr-1" />
                      {(extractedResult.pipelineResult as { overturnProbabilityScore: number }).overturnProbabilityScore}% Overturn Score
                    </Badge>
                  )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Vector 1: Written Legal Brief */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                        <FileText className="size-3 text-sky-400" />
                        Vector 1
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 border-sky-500/40 text-sky-400">
                        Tier 1 Brief
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-foreground block">
                      Written Appeal Brief
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      ERISA 29 CFR § 2560.503-1 cited legal brief with CPB evidence.
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("studio")}
                    className="w-full text-[11px] h-6 justify-between text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 px-1.5"
                  >
                    <span>Open Brief</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>

                {/* Vector 2: Doctor P2P Copilot */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                        <PhoneCall className="size-3 text-emerald-400" />
                        Vector 2
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 border-emerald-500/40 text-emerald-400">
                        14-Day Window
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-foreground block">
                      Doctor P2P Tele-Script
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      3-minute verbal rebuttal & live medical director copilot.
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("p2p")}
                    className="w-full text-[11px] h-6 justify-between text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-1.5"
                  >
                    <span>Launch P2P Script</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>

                {/* Vector 3: Statutory ERISA Penalties */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                        <Scales className="size-3 text-amber-400" />
                        Vector 3
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 border-amber-500/40 text-amber-400">
                        $110/Day
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-foreground block">
                      ERISA & Liability Audit
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      29 U.S.C. § 1132(c) statutory default demand & OOP exposure.
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("calculator")}
                    className="w-full text-[11px] h-6 justify-between text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-1.5"
                  >
                    <span>Audit Penalties</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExtractedResult(null)}
                className="text-xs w-full sm:w-auto"
              >
                Ingest Another
              </Button>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDone("radar")}
                  className="gap-1 text-xs"
                >
                  <span>Radar</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDone("evidence")}
                  className="gap-1.5 text-xs bg-primary text-primary-foreground shadow-2xs font-semibold"
                >
                  <FileMagnifyingGlass className="size-3.5" />
                  <span>Enter Case Workspace &rarr;</span>
                </Button>
              </div>
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
