import React, { useState, useRef, useEffect } from "react";
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
  PhoneCall,
  Scales,
  TrendUp,
  ArrowCounterClockwise,
  Envelope,
  Trash,
} from "@phosphor-icons/react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Claim, ClinicalFacts, ClinicalIntakeQuestion, DenialExtractionResult } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { resolvePatientDisplayName, resolveMemberIdDisplay } from "../../lib/displaySafety";
import { DEMO_CASE_FIXTURES, DemoCaseFixture, SampleCasePreset } from "../../lib/constants";
import { soundEffects } from "../../lib/soundEffects";
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
import { useDetailMode } from "../../hooks/useDetailMode";
import { PLAIN_FIRST_RUN } from "../../lib/plainCopy";
import { toast } from "sonner";

type IngestionStage = "idle" | "extracting" | "preparing_questions" | "saving";

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
    patientState?: string,
    onProgress?: (progressText: string) => void
  ) => Promise<DenialExtractionResult & { claimId: string }>;
  onParseText: (
    text: string,
    patientState?: string,
    origin?: string
  ) => Promise<DenialExtractionResult & { claimId: string }>;
  onSuccess: (claimId: string, directView?: string) => void;
  initialClaim?: Claim | null;
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onUploadFile,
  onParseText,
  onSuccess,
  initialClaim,
}) => {
  const { isDetailed } = useDetailMode();
  const [activeTab, setActiveTab] = useState("presets");
  const [patientState, setPatientState] = useState("California");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState(
    "Analyzing denial document..."
  );
  const [processingStage, setProcessingStage] = useState<IngestionStage>("idle");
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [processingElapsedSec, setProcessingElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<
    (DenialExtractionResult & { claimId: string; pipelineResult?: unknown }) | null
  >(null);
  const [activePreset, setActivePreset] = useState<DemoCaseFixture | null>(null);
  const clearDemoDataMutation = useMutation(api.claims.clearDemoData);
  const [isClearingDemo, setIsClearingDemo] = useState<boolean>(false);
  const [demoFeedback, setDemoFeedback] = useState<string | null>(null);

  const handleClearDemoData = async () => {
    try {
      setIsClearingDemo(true);
      setDemoFeedback(null);
      const res = await clearDemoDataMutation({});
      setDemoFeedback(`Cleared ${res.deletedClaimsCount} demo cases.`);
      setTimeout(() => setDemoFeedback(null), 4000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to clear demo cases");
    } finally {
      setIsClearingDemo(false);
    }
  };
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

  const runPipelineAction = useAction(api.actions.sentinelPipeline.runAutonomousPipeline);
  const generateIntakeQuestionsAction = useAction(api.actions.clinicalIntake.generateClinicalIntakeQuestions);
  const updateAppealContextMutation = useMutation(api.claims.updateAppealContext);

  // Elapsed-time ticker so long extractions feel alive instead of frozen.
  useEffect(() => {
    if (!isProcessing || processingStartedAt === null) return;
    const timer = window.setInterval(() => {
      setProcessingElapsedSec(Math.floor((Date.now() - processingStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isProcessing, processingStartedAt]);

  const beginProcessing = (stage: IngestionStage, message: string) => {
    setIsProcessing(true);
    setProcessingStage(stage);
    setProcessingMessage(message);
    setProcessingStartedAt(Date.now());
    setProcessingElapsedSec(0);
    setErrorMessage(null);
  };

  const endProcessing = () => {
    setIsProcessing(false);
    setProcessingStage("idle");
    setProcessingStartedAt(null);
    setProcessingElapsedSec(0);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const executePostExtractionPipeline = async (
    claimId: string,
    snapshot?: {
      senderName: string;
      senderCredentials: string;
      senderEmail: string;
      senderPhone: string;
      clinicalFacts: ClinicalFacts;
      physicianNotes: string;
    }
  ) => {
    if (!runPipelineAction) return;
    const sender = snapshot
      ? {
          name: snapshot.senderName.trim(),
          credentials: snapshot.senderCredentials.trim() || undefined,
          email: snapshot.senderEmail.trim() || undefined,
          phone: snapshot.senderPhone.trim() || undefined,
        }
      : {
          name: senderName.trim(),
          credentials: senderCredentials.trim() || undefined,
          email: senderEmail.trim() || undefined,
          phone: senderPhone.trim() || undefined,
        };
    const facts = snapshot?.clinicalFacts ?? clinicalFacts;
    const notes = (snapshot?.physicianNotes ?? physicianNotes).trim() || undefined;

    try {
      return await runPipelineAction({
        claimId: claimId as Id<"claims">,
        sender,
        clinicalFacts: facts,
        physicianNotes: notes,
      });
    } catch (pipelineErr) {
      const errStr = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
      if (errStr.includes("Token expired") || errStr.includes("InvalidAuthHeader")) {
        console.warn("Auth token expired mid-pipeline execution; waiting for session refresh and retrying...", pipelineErr);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return await runPipelineAction({
          claimId: claimId as Id<"claims">,
          sender,
          clinicalFacts: facts,
          physicianNotes: notes,
        });
      }
      console.warn("Pipeline stopped because clinical policy evidence could not be retrieved:", pipelineErr);
      throw pipelineErr;
    }
  };

  const fetchIntakeQuestionsInBackground = (
    result: DenialExtractionResult & { claimId: string }
  ) => {
    if (!generateIntakeQuestionsAction) {
      setIsPreparingContext(false);
      return;
    }
    setIsPreparingContext(true);
    setProcessingStage("preparing_questions");
    void generateIntakeQuestionsAction({
      denialReasonCode: result.denialReasonCode,
      denialReasonDescription: result.denialReasonDescription,
      cptCodes: result.cptCodes,
      icd10Codes: result.icd10Codes,
    })
      .then((generated) => {
        if (generated?.questions?.length) setIntakeQuestions(generated.questions);
      })
      .catch((questionErr) => {
        console.warn("Using neutral clinical intake questions:", questionErr);
        setIntakeQuestions(DEFAULT_CLINICAL_QUESTIONS);
      })
      .finally(() => {
        setIsPreparingContext(false);
      });
  };

  const prepareContextReview = (
    result: DenialExtractionResult & { claimId: string },
    preset?: SampleCasePreset
  ) => {
    soundEffects.play("extraction_complete");
    // Show the context form instantly with safe defaults; denial-specific
    // prompts upgrade in the background without blocking the user.
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
    fetchIntakeQuestionsInBackground(result);
  };

  useEffect(() => {
    if (isOpen) {
      if (initialClaim?._id) {
        const result: DenialExtractionResult & { claimId: string; pipelineResult?: unknown } = {
          claimId: initialClaim._id,
          claimNumber: initialClaim.claimNumber,
          patientName: initialClaim.patientName || initialClaim.patient?.name || "Patient Record",
          memberId: resolveMemberIdDisplay(initialClaim.patient?.memberId, "PENDING"),
          insurancePayer: initialClaim.insurancePayer || initialClaim.patient?.insurancePayer || "Health Insurer",
          serviceDate: initialClaim.serviceDate || "",
          providerName: initialClaim.providerName || "",
          deniedAmount: initialClaim.deniedAmount || 0,
          patientOwedAmount: initialClaim.patientOwedAmount || 0,
          cptCodes: initialClaim.cptCodes || [],
          icd10Codes: initialClaim.icd10Codes || [],
          denialReasonCode: initialClaim.denialReasonCode || "CO-50",
          denialReasonDescription: initialClaim.denialReasonDescription || "",
          appealFilingDeadlineDays: initialClaim.daysRemaining || 180,
          pipelineResult: null,
        };

        const matchedPreset =
          initialClaim.isDemo ||
          initialClaim.dataOrigin === "demo-fixture" ||
          initialClaim.origin === "demo-fixture"
            ? DEMO_CASE_FIXTURES.find((f) => {
                const baseNum = f.content.match(/CLM-[A-Za-z0-9-]+/)?.[0];
                if (baseNum && initialClaim.claimNumber?.startsWith(baseNum.slice(0, 8))) return true;
                if (f.cpt && initialClaim.cptCodes?.includes(f.cpt)) return true;
                return false;
              })
            : null;

        if (initialClaim.appealContext) {
          const ctx = initialClaim.appealContext;
          setExtractedResult(result);
          setContextSubmitted(false);
          setActivePreset(matchedPreset || null);
          setIntakeQuestions(matchedPreset ? matchedPreset.questions : DEFAULT_CLINICAL_QUESTIONS);
          setClinicalFacts({
            symptomsAndFunctionalImpact: ctx.clinicalFacts?.symptomsAndFunctionalImpact || "",
            examinationFindings: ctx.clinicalFacts?.examinationFindings || "",
            imagingAndDiagnostics: ctx.clinicalFacts?.imagingAndDiagnostics || "",
            treatmentHistoryAndResponse: ctx.clinicalFacts?.treatmentHistoryAndResponse || "",
            otherDocumentedFacts: ctx.clinicalFacts?.otherDocumentedFacts || "",
            recordsAreIncomplete: ctx.clinicalFacts?.recordsAreIncomplete ?? true,
          });
          setPhysicianNotes(ctx.physicianNotes || "");
          setSenderName(ctx.sender?.name || "");
          setSenderCredentials(ctx.sender?.credentials || "");
          setSenderEmail(ctx.sender?.email || "");
          setSenderPhone(ctx.sender?.phone || "");
          setContextAcknowledged(Boolean(ctx.confirmedAt));
          setIsPreparingContext(false);
        } else {
          prepareContextReview(result, matchedPreset || undefined);
        }

        setSelectedFile(null);
        setPastedText("");
        setIsProcessing(false);
        setProcessingMessage("Analyzing denial document...");
        setProcessingStage("idle");
        setProcessingStartedAt(null);
        setProcessingElapsedSec(0);
        setErrorMessage(null);
        return;
      }

      setActiveTab("presets");
      setSelectedFile(null);
      setPastedText("");
      setIsProcessing(false);
      setProcessingMessage("Analyzing denial document...");
      setProcessingStage("idle");
      setProcessingStartedAt(null);
      setProcessingElapsedSec(0);
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
    }
  }, [isOpen, initialClaim]);

  const handleProcessFile = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select a denial letter PDF or image file.");
      return;
    }

    const isPdf = selectedFile.type.includes("pdf") || selectedFile.name.toLowerCase().endsWith(".pdf");
    beginProcessing(
      "extracting",
      isDetailed
        ? isPdf
          ? "Step 1/2: On-device PDF extraction (pdf.js) and Safe Harbor de-identification. Original retained in encrypted storage for audit; only redacted text reaches AI models..."
          : "Step 1/2: On-device OCR (tesseract.js) and Safe Harbor de-identification. Original retained in encrypted storage for audit; only redacted text reaches AI models..."
        : "Step 1/2: Reading your denial letter on-device, then saving the encrypted original for audit..."
    );

    try {
      const result = await onUploadFile(selectedFile, patientState, (progressMsg) => {
        setProcessingMessage(isDetailed ? `Step 1/2: ${progressMsg}` : progressMsg);
      });
      prepareContextReview(result);
      endProcessing();
    } catch (err) {
      endProcessing();
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to parse denial document. Please verify the document format or try again."
      );
    }
  };

  const handleProcessPreset = async (preset: SampleCasePreset) => {
    beginProcessing(
      "extracting",
      isDetailed
        ? "Step 1/2: Extracting CPT, CARC and ERISA statutory deadlines..."
        : "Step 1/2: Reading the letter — treatment, why they said no, and your deadline..."
    );

    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const uniqueContent = preset.content.replace(
        /(CLM-[A-Za-z0-9-]+)/g,
        `$1-${randomSuffix}`
      );
      const result = await onParseText(uniqueContent, patientState, preset.origin || "demo-fixture");
      prepareContextReview(result, preset);
      endProcessing();
    } catch (err) {
      endProcessing();
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to extract claim information. Please check your document text."
      );
    }
  };

  const handleProcessText = async () => {
    if (!pastedText.trim()) {
      setErrorMessage(
        "Please paste the denial letter or Explanation of Benefits text."
      );
      return;
    }

    beginProcessing(
      "extracting",
      isDetailed
        ? "Step 1/2: Parsing clinical records and denial rationale..."
        : "Step 1/2: Reading your denial letter..."
    );

    try {
      const result = await onParseText(pastedText, patientState);
      prepareContextReview(result);
      endProcessing();
    } catch (err) {
      endProcessing();
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to extract claim information. Please check your document text."
      );
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

    beginProcessing("saving", "Saving context and opening workspace...");
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
          isRedacted: false,
          mode: "BALANCED_APPELLATE",
          redactedEntityCount: 0,
          maskedCategories: [],
          appliedAt: Date.now(),
        },
        launchAutoPilot: true,
      });

      const claimId = extractedResult.claimId;
      const snapshot = {
        senderName,
        senderCredentials,
        senderEmail: normalizedEmail,
        senderPhone: normalizedPhone,
        clinicalFacts,
        physicianNotes,
      };

      // Enter the workspace instantly; the crawl / score / synthesis pipeline
      // continues in the background with live status in Evidence Matrix.
      setContextSubmitted(true);
      setExtractedResult((current) => current ? { ...current, pipelineResult: null } : current);
      endProcessing();
      toast.info(
        isDetailed
          ? "Sentinel pipeline activated. Indexing policy guidelines and compiling appeal brief..."
          : "We've started your appeal. Checking their rules and writing your letter..."
      );
      onSuccess(claimId, "evidence");
      onClose();
      void executePostExtractionPipeline(claimId, snapshot)
        .then((pipelineResult) => {
          if (pipelineResult && typeof pipelineResult === "object") {
            soundEffects.play("appeal_synthesis_complete");
            toast.success(
              isDetailed
                ? "Case indexed and appeal brief compiled. Review it in the Studio."
                : "Your appeal letter is ready to review."
            );
          }
        })
        .catch((pipelineErr) => {
          toast.error(
            pipelineErr instanceof Error
              ? pipelineErr.message
              : "Sentinel pipeline encountered an issue. Retry from the Evidence Matrix."
          );
        });
      return;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the case context. Please try again.");
    } finally {
      setIsProcessing(false);
      setProcessingStage("idle");
      setProcessingStartedAt(null);
      setProcessingElapsedSec(0);
    }
  };

  const handleRunPipelineNow = async () => {
    if (!extractedResult?.claimId) return;
    const claimId = extractedResult.claimId;
    // Manual-pipeline mode: enter the workspace instantly and run in background.
    setContextSubmitted(true);
    toast.info(
      isDetailed
        ? "Autonomous Sentinel activated. Indexing policy guidelines and compiling appeal brief..."
        : "We've started your appeal. Checking their rules and writing your letter..."
    );
    onSuccess(claimId, "evidence");
    onClose();
    void executePostExtractionPipeline(claimId)
      .then((pipelineResult) => {
        if (pipelineResult && typeof pipelineResult === "object") {
          soundEffects.play("appeal_synthesis_complete");
          toast.success("Case indexed and appeal brief compiled. Review it in the Studio.");
        }
      })
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Autonomous pipeline encountered an issue. Retry from the Evidence Matrix."
        );
      });
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
              <div className="flex items-center gap-2">
                <DialogTitle>{isDetailed ? "Ingest Denial Document" : "Add denial letter"}</DialogTitle>
                <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/5">
                  {isDetailed ? "US Healthcare Appeals" : "Takes ~1 min"}
                </Badge>
              </div>
              <DialogDescription>
                {isDetailed
                  ? "Automated clinical record extraction & real-time case indexing (EOBs and denial notices)"
                  : "Upload a photo or PDF of your denial — we pull out the important parts for you."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Patient State (DOI Reference) & Mandatory Human Review Gate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="flex items-center justify-between gap-2 bg-muted/40 border border-border p-2 rounded-lg text-xs">
            <span className="text-muted-foreground font-medium truncate">
              {isDetailed ? "Patient state (DOI ref):" : "Your state:"}
            </span>
            <Select
              value={patientState}
              onChange={(e) => setPatientState(e.target.value)}
              className="h-7 text-xs font-sans border-border/80"
              title="Federal 180-day clock applies in every state; state names only the DOI reference"
            >
              <option value="California">California — CA DOI ref</option>
              <option value="New York">New York — NY DOI ref</option>
              <option value="Texas">Texas — TX DOI ref</option>
              <option value="Florida">Florida — FL DOI ref</option>
              <option value="Illinois">Illinois — IL DOI ref</option>
              <option value="Pennsylvania">Pennsylvania — PA DOI ref</option>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2 border border-primary/30 bg-primary/5 p-2 rounded-lg text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" />
              <span className="truncate text-foreground font-medium">Human Review Gate</span>
            </div>
            <Badge
              variant="outline"
              className="text-[9px] font-mono shrink-0 px-1.5 py-0 border-primary/40 text-primary"
            >
              MANDATORY APPROVAL
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
                <span>Try demo case (synthetic)</span>
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

            {/* Tab 1: Demo Fixtures */}
            <TabsContent value="presets" className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Fictional EOB for evaluation. Runs live extraction/crawl/scoring, no mocked results.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleClearDemoData}
                  disabled={isClearingDemo}
                  className="h-7 text-[11px] gap-1 text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 cursor-pointer"
                >
                  <Trash className="size-3" />
                  <span>{isClearingDemo ? "Clearing..." : "Clear demo data"}</span>
                </Button>
              </div>

              {demoFeedback && (
                <div className="text-[11px] text-emerald-500 font-medium bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1">
                  {demoFeedback}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {DEMO_CASE_FIXTURES.map((preset) => (
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
                      <Badge variant="secondary" className="font-mono text-[9px] text-amber-500 bg-amber-500/10 border-amber-500/20">
                        Synthetic demo — not real PHI
                      </Badge>
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
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2" role="status">
                  <div className="flex items-center gap-2 text-xs text-foreground">
                    <CircleNotch className="size-4 animate-spin text-primary shrink-0" />
                    <span className="font-medium">{processingMessage}</span>
                    {processingElapsedSec > 0 && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {processingElapsedSec}s elapsed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                    <span className={cn("inline-flex items-center gap-1", processingStage === "extracting" ? "text-primary font-semibold" : "text-emerald-500")}>
                      {processingStage !== "extracting" && <CheckCircle className="size-3 text-emerald-500 shrink-0" />}
                      <span>{processingStage === "extracting" ? "Extracting" : "Extracted"}</span>
                    </span>
                    <span aria-hidden="true">→</span>
                    <span className={processingStage === "preparing_questions" ? "text-primary font-semibold" : ""}>
                      Preparing prompts
                    </span>
                    <span aria-hidden="true">→</span>
                    <span>Context form opens instantly</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Extraction runs live against the denial document. The context form appears
                    as soon as extraction finishes; clinical prompts refine in the background.
                  </p>
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
                    : "Supports PDF, PNG, JPG, JPEG, and TXT denial notices"}
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <Lock className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <p>
                  Text is extracted on-device and de-identified before analysis. The original
                  file is stored encrypted for audit and attached to your appeal packet,
                  deleted when you delete the case. AI models receive redacted text only,
                  never the original file.
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
                        <span>{processingElapsedSec > 0 ? `${processingMessage} (${processingElapsedSec}s)` : processingMessage}</span>
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
                placeholder="Paste the English text of the denial letter or Explanation of Benefits, including claim number, procedure codes (CPT), denial reason code (e.g. CO-50), and denied amounts..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="font-mono text-xs"
              />

              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <Lock className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <p>
                  Privacy protected automatically. Personal details are removed
                  before AI review, but kept in your payer letter where required.
                </p>
              </div>

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
                      <span>{processingElapsedSec > 0 ? `${processingMessage} (${processingElapsedSec}s)` : processingMessage}</span>
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

              {isPreparingContext && !activePreset && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground" role="status">
                  <CircleNotch className="size-3.5 animate-spin text-primary shrink-0" />
                  <span>Refining denial-specific prompts in the background. You can start filling the form now.</span>
                </div>
              )}
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
                      : "Optional clinical narrative, therapy logs, or physician statement. Added straight into your letter."}
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

            {/* Privacy note: protection is automatic, no action needed */}
            <div className="flex items-start gap-2 border-t border-border/70 pt-4 text-[11px] leading-relaxed text-muted-foreground">
              <Lock className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <p>
                Privacy protected automatically. Personal details are removed
                before AI review, but kept in your payer letter where required.
              </p>
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
                  ? isDetailed
                    ? "I confirm that the clinical entries and submitter details above reflect the verified case records and are ready for policy citation and appeal brief synthesis."
                    : "I confirm the entries above match the case records, so they can be cited in my appeal letter."
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
                disabled={isProcessing || !contextAcknowledged}
                className="gap-1.5 text-xs font-semibold"
                title={isPreparingContext ? "Prompts are still refining in the background; safe defaults are used" : undefined}
              >
                {isProcessing ? (
                  <>
                    <CircleNotch className="size-3.5 animate-spin" />
                    <span>{processingMessage || "Saving context and opening workspace..."}</span>
                  </>
                ) : (
                  <>
                    <span>Save Context &amp; Open Workspace</span>
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isDetailed
                ? "The evidence crawl, readiness audit, and brief synthesis run in the background. In accordance with clinical safety protocols, a human must approve every clinical assertion, legal assertion, recipient, and outbound message before dispatch."
                : "We check their rules and write the letter in the background. Nothing is ever sent until you approve every statement and recipient."}
            </p>
          </Card>
        ) : (
          /* Extraction Result Card & Smart Multi-Vector Triage HUD */
          <Card className="p-4 sm:p-5 space-y-4 border-emerald-500/30 bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="size-4.5" />
                <span className="text-sm font-semibold">
                  {isDetailed
                    ? extractedResult.pipelineResult
                      ? "Case Indexed & Appeal Pipeline Initialized"
                      : "Case Indexed — Autonomous Pipeline Ready"
                    : extractedResult.pipelineResult
                      ? "Case added — appeal in progress"
                      : "Case added — ready for your appeal"}
                </span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                Claim #{extractedResult.claimNumber}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-muted/20 border border-border/70 rounded-lg p-3">
              <div>
                <span className="text-[10px] text-muted-foreground block font-mono">Patient</span>
                <span className="font-semibold text-foreground truncate block">{resolvePatientDisplayName(extractedResult.patientName)}</span>
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
                <span className="text-[10px] text-muted-foreground block font-mono">
                  {isDetailed ? "Denial Code" : PLAIN_FIRST_RUN.whyDenied}
                </span>
                <span className="font-mono font-semibold text-destructive text-xs">
                  {extractedResult.denialReasonCode || (isDetailed ? "CARC-50" : "Not stated")}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-xs text-muted-foreground">
              <span className="text-foreground font-medium text-[11px] block font-mono">
                {isDetailed ? "Denial Rationale:" : "Their reason:"}
              </span>
              <p className="mt-0.5 leading-relaxed">{extractedResult.denialReasonDescription}</p>
            </div>

            {/* Pipeline Execution Banner when Analysis Pipeline Pending */}
            {!extractedResult.pipelineResult && (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lightning className="size-3.5 text-sky-400" />
                      {isDetailed ? "Sentinel Pipeline Ready" : "Ready to build your appeal"}
                    </span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {isDetailed
                        ? `Case #${extractedResult.claimNumber} is indexed with confirmed clinical facts. Run the pipeline now to crawl insurer policy bulletins, evaluate Statutory Appeal Readiness, and synthesize the cited legal brief for your review and approval.`
                        : `Case #${extractedResult.claimNumber} is saved with your confirmed details. Next we check the insurer's own rules, score your proof, and write the letter for you to review and approve.`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="xs"
                    onClick={handleRunPipelineNow}
                    disabled={isProcessing}
                    className="h-7 px-3 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs"
                  >
                    {isProcessing ? (
                      <>
                        <CircleNotch className="size-3 animate-spin" />
                        <span>
                          {processingMessage || (isDetailed ? "Executing pipeline..." : "Working on it...")}
                        </span>
                      </>
                    ) : (
                      <>
                        <Lightning className="size-3.5" />
                        <span>{isDetailed ? "Run Sentinel Pipeline" : "Build my appeal"}</span>
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setContextSubmitted(false)}
                    disabled={isProcessing}
                    className="h-7 px-2.5 text-xs gap-1"
                  >
                    <ArrowLeft className="size-3" />
                    <span>{isDetailed ? "Edit Clinical Context" : "Edit my details"}</span>
                  </Button>
                  {errorMessage && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleRunPipelineNow}
                      disabled={isProcessing}
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                    >
                      <ArrowCounterClockwise className="size-3" />
                      <span>{isDetailed ? "Retry Analysis" : "Try again"}</span>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Core 3-Step Appeal Pipeline HUD */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Shield className="size-3.5 text-primary" />
                  {isDetailed ? "Core Appeal Pipeline:" : "What happens next:"}
                </span>
                {typeof extractedResult.pipelineResult === "object" &&
                  extractedResult.pipelineResult !== null &&
                  (("appealReadinessScore" in extractedResult.pipelineResult &&
                    typeof (extractedResult.pipelineResult as { appealReadinessScore?: unknown }).appealReadinessScore === "number") ||
                   ("evidenceCoverageScore" in extractedResult.pipelineResult &&
                    typeof (extractedResult.pipelineResult as { evidenceCoverageScore?: unknown }).evidenceCoverageScore === "number") ||
                   ("overturnProbabilityScore" in extractedResult.pipelineResult &&
                    typeof (extractedResult.pipelineResult as { overturnProbabilityScore?: unknown }).overturnProbabilityScore === "number")) && (
                    <Badge variant="secondary" className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">
                      <TrendUp className="size-3 mr-1" />
                      {Number(
                        (extractedResult.pipelineResult as { appealReadinessScore?: number; evidenceCoverageScore?: number; overturnProbabilityScore?: number }).appealReadinessScore ??
                        (extractedResult.pipelineResult as { appealReadinessScore?: number; evidenceCoverageScore?: number; overturnProbabilityScore?: number }).evidenceCoverageScore ??
                        (extractedResult.pipelineResult as { appealReadinessScore?: number; evidenceCoverageScore?: number; overturnProbabilityScore?: number }).overturnProbabilityScore
                      )}/100 {isDetailed ? "Readiness Score" : "Case strength"}
                    </Badge>
                  )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Step 1: Evidence & CPB */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                        <FileMagnifyingGlass className="size-3 text-cyan-400" />
                        Step 1
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 border-cyan-500/40 text-cyan-400">
                        Evidence
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-foreground block">
                      {isDetailed ? "Evidence & CPB Matrix" : "Your proof"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      {isDetailed
                        ? "Clinical Policy Bulletins matched against denial reason codes."
                        : "Their own rules checked against why they said no."}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("evidence")}
                    className="w-full text-[11px] h-6 justify-between text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 px-1.5 cursor-pointer"
                  >
                    <span>{isDetailed ? "View Evidence" : "See your proof"}</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>

                {/* Step 2: Appeal Brief */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                        <FileText className="size-3 text-sky-400" />
                        Step 2
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 border-sky-500/40 text-sky-400">
                        {isDetailed ? "Legal Brief" : PLAIN_FIRST_RUN.yourLetter}
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-foreground block">
                      {isDetailed ? "Appeal Brief" : PLAIN_FIRST_RUN.yourLetter}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      {isDetailed
                        ? "ERISA 29 CFR § 2560.503-1 cited appeal brief with CPB evidence."
                        : "A formal letter that answers their reason with your records and their own rules."}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("studio")}
                    className="w-full text-[11px] h-6 justify-between text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 px-1.5 cursor-pointer"
                  >
                    <span>{isDetailed ? "Open Brief" : "Open your letter"}</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>

                {/* Step 3: Payer Dispatch */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                        <Envelope className="size-3 text-indigo-400" />
                        Step 3
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 border-indigo-500/40 text-indigo-400">
                        Dispatch
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-foreground block">
                      {isDetailed ? "Payer Dispatch" : "Send & track"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      {isDetailed
                        ? "AgentMail review-gated delivery, tracking, and reply sentinel."
                        : "You approve first. Their reply lands back here."}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("communications")}
                    className="w-full text-[11px] h-6 justify-between text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-1.5 cursor-pointer"
                  >
                    <span>{isDetailed ? "Dispatch Gateway" : "Go to send"}</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>
              </div>

              {/* Companion Tools Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg border border-border/60 bg-muted/10 text-xs">
                <span className="text-[10px] font-mono uppercase text-muted-foreground font-semibold">
                  {isDetailed ? "Companion Tools Available:" : "Also available:"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("p2p")}
                    className="h-6 px-2 text-[11px] gap-1 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 cursor-pointer"
                  >
                    <PhoneCall className="size-3" />
                    <span>{isDetailed ? "Doctor P2P Copilot" : "Doctor call prep"}</span>
                  </Button>
                  <div className="h-3 w-px bg-border shrink-0" />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDone("calculator")}
                    className="h-6 px-2 text-[11px] gap-1 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 cursor-pointer"
                  >
                    <Scales className="size-3" />
                    <span>{isDetailed ? "ERISA Audit" : "Cost & rights"}</span>
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
                {isDetailed ? "Ingest Another" : "Add another letter"}
              </Button>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDone("radar")}
                  className="gap-1 text-xs"
                >
                  <span>{isDetailed ? "Radar" : "My cases"}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDone("evidence")}
                  className="gap-1.5 text-xs bg-primary text-primary-foreground shadow-2xs font-semibold"
                >
                  <FileMagnifyingGlass className="size-3.5" />
                  <span>{isDetailed ? "Enter Case Workspace" : "See what to do next"} &rarr;</span>
                </Button>
              </div>
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
