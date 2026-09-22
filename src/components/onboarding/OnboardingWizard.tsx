import React, { useState, useRef } from "react";
import {
  Scales,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Lightning,
  CloudArrowUp,
  Check,
  CircleNotch,
  Stethoscope,
  ShieldWarning,
  FileText,
  X,
  Shield,
  ShieldCheck,
  Lock,
  TrendUp,
  PhoneCall,
  FileMagnifyingGlass,
  Envelope,
} from "@phosphor-icons/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BrandIcon } from "../common/BrandLogo";
import { ClinicalFacts, ClinicalIntakeQuestion, DenialExtractionResult } from "../../types";
import { DEMO_CASE_FIXTURES, DemoCaseFixture } from "../../lib/constants";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Id } from "../../../convex/_generated/dataModel";
import { cn, formatCurrency } from "../../lib/utils";
import { resolvePatientDisplayName } from "../../lib/displaySafety";
import { useDetailMode } from "../../hooks/useDetailMode";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { PLAIN_FIRST_RUN } from "../../lib/plainCopy";

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile?: (
    file: File,
    patientState?: string,
    onProgress?: (progressText: string) => void
  ) => Promise<(DenialExtractionResult & { claimId: string }) | undefined>;
  onParseText: (
    text: string,
    patientState?: string,
    origin?: string
  ) => Promise<DenialExtractionResult & { claimId: string }>;
  onOpenIngestionModal: () => void;
  onSuccess: (claimId: string, directView?: string) => void;
}

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

const ROLES = [
  {
    id: "provider",
    title: "Healthcare Provider / Medical Practice",
    plainTitle: "Doctor or clinic",
    description: "Hospitals, orthopedic clinics, surgical centers, and healthcare billing departments.",
    plainDescription: "You bill patients and insurers for care you provide.",
    icon: Stethoscope,
    defaultName: "Dr. Sarah Chen, MD, FACP",
    defaultCredentials: "Board Certified Internal Medicine / Clinical Advocate",
    defaultOrg: "ClaimHero Health Advocacy Group",
    defaultPhone: "",
  },
  {
    id: "advocate",
    title: "Patient Advocate / ERISA Legal Counsel",
    plainTitle: "Advocate or attorney",
    description: "Healthcare law firms, statutory ERISA litigators, and claims advocacy specialists.",
    plainDescription: "You help people fight denials, professionally or as a volunteer.",
    icon: Scales,
    defaultName: "Alex Vance, Esq. / ERISA Counsel",
    defaultCredentials: "Healthcare Litigator & Patient Rights Advocate",
    defaultOrg: "Appellate Health Law Practice",
    defaultPhone: "",
  },
  {
    id: "patient",
    title: "Patient / Policyholder Individual",
    plainTitle: "Patient or family member",
    description: "Self-insured employees, private insurance members, and surprise-billed consumers.",
    plainDescription: "You are appealing a bill for yourself or a family member.",
    icon: ShieldWarning,
    defaultName: "Patient Self-Representative",
    defaultCredentials: "Pro Se Insured Policyholder",
    defaultOrg: "Individual Policyholder",
    defaultPhone: "",
  },
];

const JURISDICTIONS = [
  { code: "FL", label: "Florida — FL AHCA/OIR reference (federal ERISA engine)", plainLabel: "Florida" },
  { code: "CA", label: "California — CA DMHC/CDI reference (federal ERISA engine)", plainLabel: "California" },
  { code: "TX", label: "Texas — TX TDI reference (federal ERISA engine)", plainLabel: "Texas" },
  { code: "NY", label: "New York — NY DFS reference (federal ERISA engine)", plainLabel: "New York" },
  { code: "IL", label: "Illinois — IL IDOI reference (federal ERISA engine)", plainLabel: "Illinois" },
  { code: "FED", label: "Federal default — no state DOI (ERISA engine)", plainLabel: "Federal rules (job-based plans)" },
];

const TARGET_PAYERS = [
  "Cigna Global",
  "GeoBlue",
  "Aetna International",
  "Molina Healthcare",
  "Blue Cross Blue Shield",
  "UnitedHealthcare",
  "Aetna",
  "Cigna",
];

const STARTER_CASES = DEMO_CASE_FIXTURES;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onClose,
  onUploadFile,
  onParseText,
  onSuccess,
}) => {
  const { isDetailed } = useDetailMode();
  const [step, setStep] = useState<number>(1);
  const [selectedRole, setSelectedRole] = useState<string>("provider");
  const [advocateName, setAdvocateName] = useState<string>("Dr. Sarah Chen, MD, FACP");
  const [advocateCredentials, setAdvocateCredentials] = useState<string>("Board Certified Internal Medicine / Clinical Advocate");
  const [advocateOrg, setAdvocateOrg] = useState<string>("ClaimHero Health Advocacy Group");
  const [advocatePhone, setAdvocatePhone] = useState<string>("");

  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("CA");
  const [selectedPayers, setSelectedPayers] = useState<string[]>([
    "Cigna Global",
    "GeoBlue",
    "Aetna International",
  ]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>("Analyzing denial document...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Ingestion parity state matching Case Radar flow
  const [extractedResult, setExtractedResult] = useState<
    (DenialExtractionResult & { claimId: string; pipelineResult?: unknown }) | null
  >(null);
  const [activePreset, setActivePreset] = useState<DemoCaseFixture | null>(null);
  const [contextSubmitted, setContextSubmitted] = useState<boolean>(false);
  const [isPreparingContext, setIsPreparingContext] = useState<boolean>(false);
  const [intakeQuestions, setIntakeQuestions] = useState<ClinicalIntakeQuestion[]>(DEFAULT_CLINICAL_QUESTIONS);
  const [senderName, setSenderName] = useState<string>("");
  const [senderCredentials, setSenderCredentials] = useState<string>("");
  const [senderEmail, setSenderEmail] = useState<string>("");
  const [senderPhone, setSenderPhone] = useState<string>("");
  const [clinicalFacts, setClinicalFacts] = useState<ClinicalFacts>(EMPTY_CLINICAL_FACTS);
  const [physicianNotes, setPhysicianNotes] = useState<string>("");
  const [contextAcknowledged, setContextAcknowledged] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingSettings = useQuery(api.settings.getSettings, {});
  const updateSettingsMutation = useMutation(api.settings.updateSettings);
  const updateAppealContextMutation = useMutation(api.claims.updateAppealContext);
  const runPipelineAction = useAction(api.actions.sentinelPipeline.runAutonomousPipeline);
  const generateIntakeQuestionsAction = useAction(api.actions.clinicalIntake.generateClinicalIntakeQuestions);

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
    const roleDef = ROLES.find((r) => r.id === roleId);
    if (roleDef) {
      setAdvocateName(roleDef.defaultName);
      setAdvocateCredentials(roleDef.defaultCredentials);
      setAdvocateOrg(roleDef.defaultOrg);
      setAdvocatePhone(roleDef.defaultPhone);
    }
  };

  const togglePayer = (payer: string) => {
    setSelectedPayers((prev) =>
      prev.includes(payer) ? prev.filter((p) => p !== payer) : [...prev, payer]
    );
  };

  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("File exceeds the maximum 10MB size limit. Please upload a smaller PDF or image.");
      setCustomFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    setCustomFile(file);
    setSelectedCaseId("custom");
    setErrorMessage(null);
  };

  const { user } = useCurrentUser();

  const markOnboardingCompleted = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("claimhero_onboarding_completed", "true");
      if (user?._id) {
        localStorage.setItem(`claimhero_onboarding_completed_${user._id}`, "true");
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const saveProfileSettings = async () => {
    markOnboardingCompleted();
    const profileData = {
      role: selectedRole,
      name: advocateName,
      credentials: advocateCredentials,
      organization: advocateOrg,
      phone: advocatePhone,
      jurisdiction: selectedJurisdiction,
      payers: selectedPayers,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("claimhero_user_profile", JSON.stringify(profileData));
      if (user?._id) {
        localStorage.setItem(`claimhero_user_profile_${user._id}`, JSON.stringify(profileData));
      }
    }

    try {
      await updateSettingsMutation({
        approvalMode: existingSettings?.approvalMode || "manual_review",
        followUpCadenceDays: existingSettings?.followUpCadenceDays || 14,
        defaultLegalPosture: existingSettings?.defaultLegalPosture || "administrative_reconsideration",
        autoReplyInbound: existingSettings?.autoReplyInbound ?? true,
        autoRescanPolicies: existingSettings?.autoRescanPolicies ?? true,
        criticalDeadlineAlerts: existingSettings?.criticalDeadlineAlerts ?? true,
        advocateProfile: {
          name: advocateName,
          credentials: advocateCredentials,
          organization: advocateOrg,
          phone: advocatePhone,
          state: selectedJurisdiction === "FED" ? "US" : selectedJurisdiction,
        },
      });
    } catch (settingsErr) {
      console.warn("Could not save onboarding profile to settings:", settingsErr);
    }
  };

  const executePostExtractionPipeline = async (claimId: string) => {
    if (!runPipelineAction) return;

    setProcessingMessage(
      isDetailed
        ? "Step 2/3: Indexing Insurer CPB & Auditing Statutory Appeal Readiness..."
        : "Step 2/3: Checking Insurer Rules & Scoring Case Strength..."
    );
    try {
      const pipelineRes = await runPipelineAction({
        claimId: claimId as Id<"claims">,
        sender: {
          name: senderName.trim() || advocateName.trim(),
          credentials: senderCredentials.trim() || advocateCredentials.trim() || undefined,
          email: senderEmail.trim() || undefined,
          phone: senderPhone.trim() || advocatePhone.trim() || undefined,
        },
        clinicalFacts,
        physicianNotes: physicianNotes.trim() || undefined,
      });
      setProcessingMessage(
        isDetailed
          ? "Step 3/3: Synthesizing cited ERISA medical appeal brief..."
          : "Step 3/3: Writing evidence-backed appeal letter..."
      );
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
            name: senderName.trim() || advocateName.trim(),
            credentials: senderCredentials.trim() || advocateCredentials.trim() || undefined,
            email: senderEmail.trim() || undefined,
            phone: senderPhone.trim() || advocatePhone.trim() || undefined,
          },
          clinicalFacts,
          physicianNotes: physicianNotes.trim() || undefined,
        });
      }
      console.warn("Pipeline stopped because clinical policy evidence could not be retrieved:", pipelineErr);
      throw pipelineErr;
    }
  };

  const handleProcessPreset = async (preset: DemoCaseFixture) => {
    setSelectedCaseId(preset.id);
    setCustomFile(null);
    setErrorMessage(null);
    setIsProcessing(true);
    setProcessingMessage("Step 1/3: Optical document analysis & clinical entity extraction...");

    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const uniqueContent = preset.content.replace(
        /(CLM-[A-Za-z0-9-]+)/g,
        `$1-${randomSuffix}`
      );
      const result = await onParseText(uniqueContent, selectedJurisdiction, preset.origin || "demo-fixture");
      setExtractedResult({ ...result, memberId: result.memberId || preset.memberId, pipelineResult: null });
      setContextSubmitted(false);
      setActivePreset(preset);
      setIntakeQuestions(preset.questions);
      setClinicalFacts({ ...preset.clinicalFacts });
      setPhysicianNotes(preset.physicianNotes || "");
      setSenderName(advocateName || preset.sender.name);
      setSenderCredentials(advocateCredentials || preset.sender.credentials);
      setSenderEmail(preset.sender.email || "advocate@claimhero.internal");
      setSenderPhone(advocatePhone || preset.sender.phone);
      setContextAcknowledged(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartExtraction = async () => {
    if (!selectedCaseId) {
      await saveProfileSettings();
      onClose();
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    if (selectedCaseId === "custom") {
      if (!customFile) {
        fileInputRef.current?.click();
        setIsProcessing(false);
        return;
      }
      if (customFile.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage("File exceeds the maximum 10MB size limit. Please upload a smaller PDF or image.");
        setIsProcessing(false);
        return;
      }
      if (!onUploadFile) {
        setIsProcessing(false);
        return;
      }

      setProcessingMessage("Step 1/3: Optical document analysis & clinical entity extraction...");
      try {
        const result = await onUploadFile(customFile, selectedJurisdiction);
        if (!result) {
          setIsProcessing(false);
          return;
        }
        setExtractedResult({ ...result, pipelineResult: null });
        setContextSubmitted(false);
        setActivePreset(null);
        setSenderName(advocateName);
        setSenderCredentials(advocateCredentials);
        setSenderEmail("advocate@claimhero.internal");
        setSenderPhone(advocatePhone);
        setClinicalFacts(EMPTY_CLINICAL_FACTS);
        setPhysicianNotes("");
        setContextAcknowledged(false);
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Preset case selection
    const preset = STARTER_CASES.find((c) => c.id === selectedCaseId);
    if (!preset) {
      setIsProcessing(false);
      return;
    }

    await handleProcessPreset(preset);
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
      setErrorMessage("Confirm that the entries reflect the available clinical records.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // Save profile settings to Convex & localStorage
    await saveProfileSettings();

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

      const pipelineResult = await executePostExtractionPipeline(extractedResult.claimId);
      setExtractedResult((current) => (current ? { ...current, pipelineResult } : current));
      setContextSubmitted(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save case context.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = (targetView?: string) => {
    markOnboardingCompleted();
    if (extractedResult?.claimId) {
      onSuccess(extractedResult.claimId, targetView || "evidence");
    }
    onClose();
  };

  const handleSkip = () => {
    markOnboardingCompleted();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl p-0 gap-0 border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header & Step Progress Bar */}
        <div className="p-5 sm:p-6 pb-4 border-b border-border/80 bg-muted/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <BrandIcon size="sm" />
              <div>
                <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
                  Sentinel Defense Setup
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Configure your appellate profile and initialize your evidence-grounded appeal workspace
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">
                {extractedResult ? "Case Review" : `Step ${step} of 3`}
              </Badge>
              {(step === 2 || step === 3) && !extractedResult && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                >
                  Skip
                </Button>
              )}
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { num: 1, label: "Appellate Role" },
              { num: 2, label: "State Reference & Payers" },
              { num: 3, label: "First Sentinel Case" },
            ].map((s) => (
              <div key={s.num} className="space-y-1">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    extractedResult || step >= s.num
                      ? "bg-primary"
                      : "bg-muted border border-border/60"
                  }`}
                />
                <span
                  className={`text-[10px] font-mono block truncate ${
                    extractedResult || step >= s.num
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.num}. {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* ================= STEP 1: Appellate Role & Profile ================= */}
          {!extractedResult && step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  {isDetailed ? "Choose Your Primary Appellate Role" : "How Will You Use ClaimHero?"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isDetailed
                    ? "Tailors legal posture, ERISA statutory notice templates, and signature blocks."
                    : "Tailors letters, rights notices, and signature blocks for you."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const isSelected = selectedRole === role.id;
                  return (
                    <Card
                      key={role.id}
                      onClick={() => handleRoleSelect(role.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                        isSelected
                          ? "bg-primary/10 border-primary text-foreground shadow-xs ring-1 ring-primary/20"
                          : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className={`size-8 rounded-lg flex items-center justify-center border ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          <Icon className="size-4" />
                        </div>
                        {isSelected && (
                          <Badge variant="default" className="text-[10px] h-5 px-1.5 font-mono">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground block font-sans">
                          {isDetailed ? role.title : role.plainTitle}
                        </span>
                        <span className="text-[11px] text-muted-foreground block leading-tight mt-1">
                          {isDetailed ? role.description : role.plainDescription}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Advocate Signature & Organization Defaults
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {isDetailed ? "Editable on every brief" : "Editable on every letter"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Full Name & Title
                    </label>
                    <Input
                      value={advocateName}
                      onChange={(e) => setAdvocateName(e.target.value)}
                      placeholder="e.g. Dr. Sarah Chen, MD"
                      className="h-8 text-xs font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Professional Credentials
                    </label>
                    <Input
                      value={advocateCredentials}
                      onChange={(e) => setAdvocateCredentials(e.target.value)}
                      placeholder="e.g. Board Certified Oncology"
                      className="h-8 text-xs font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Practice / Advocacy Organization
                    </label>
                    <Input
                      value={advocateOrg}
                      onChange={(e) => setAdvocateOrg(e.target.value)}
                      placeholder="e.g. Bay Area Patient Rights Law"
                      className="h-8 text-xs font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Direct Contact Phone (Optional)
                    </label>
                    <Input
                      value={advocatePhone}
                      onChange={(e) => setAdvocatePhone(e.target.value)}
                      placeholder="e.g. (415) 890-2341"
                      className="h-8 text-xs font-sans"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: State Reference & Payers ================= */}
          {!extractedResult && step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {isDetailed ? "Patient State & Regulatory Jurisdiction" : "Patient State or Region"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isDetailed
                      ? "Governs State Department of Insurance (DOI) oversight and external review statutory timelines alongside the federal ERISA baseline."
                      : "Sets your state Department of Insurance and statutory external review rules alongside federal ERISA protections."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {JURISDICTIONS.map((j) => {
                    const isSelected = selectedJurisdiction === j.code;
                    return (
                      <div
                        key={j.code}
                        onClick={() => setSelectedJurisdiction(j.code)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                          isSelected
                            ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/20"
                            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <div
                          className={`size-6 rounded font-mono text-[10px] font-bold flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {j.code}
                        </div>
                        <span className="text-xs font-medium truncate">
                          {isDetailed ? j.label : j.plainLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-border/60">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {isDetailed ? "Frequently Targeted Payers" : "Common Health Insurers"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isDetailed
                      ? "Pre-indexes insurer Clinical Policy Bulletins (CPBs) and appeal precedents."
                      : "Helps quickly find insurer rules and similar past appeals."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {TARGET_PAYERS.map((payer) => {
                    const isSelected = selectedPayers.includes(payer);
                    return (
                      <Button
                        key={payer}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePayer(payer)}
                        className={`h-7 px-3 rounded-md text-xs font-medium gap-1.5 transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {isSelected && <Check className="size-3" />}
                        <span>{payer}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: Case Selection ================= */}
          {!extractedResult && step === 3 && (
            <div className="space-y-3.5 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Initialize Your First Sentinel Case</h3>
                  {selectedCaseId && (
                    <button
                      onClick={() => {
                        setSelectedCaseId(null);
                        setCustomFile(null);
                        setErrorMessage(null);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick a sample medical denial notice to test the full appeal preparation engine, upload your own, or continue to an empty portfolio.
                </p>
              </div>

              {/* Error Alert Banner */}
              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-600/60 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <ShieldWarning className="size-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <span className="font-semibold block text-rose-200">Invalid Document Detected</span>
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-rose-400 hover:text-rose-200 p-0.5 cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Fictional EOB for evaluation. Runs live extraction/crawl/scoring, no mocked results.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2.5">
                  {STARTER_CASES.map((c) => {
                    const isSelected = selectedCaseId === c.id;
                    return (
                      <Card
                        key={c.id}
                        onClick={() => !isProcessing && handleProcessPreset(c)}
                        className={cn(
                          "p-3.5 hover:bg-muted/40 transition-all cursor-pointer space-y-2",
                          isSelected && "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/20"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-foreground">
                            {c.title}
                          </span>
                          <span className="font-mono font-bold text-destructive text-xs">
                            {c.amount}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                          <Badge variant="secondary" className="font-mono text-[9px] text-amber-500 bg-amber-500/10 border-amber-500/20">
                            Synthetic demo — not real PHI
                          </Badge>
                          <Badge variant="secondary">CPT {c.cpt}</Badge>
                          <Badge variant="outline" className="text-muted-foreground">
                            {c.carc}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                          <span>Click to load & analyze case</span>
                          <span className="text-primary font-medium">1-Click &rarr;</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {isProcessing && selectedCaseId && selectedCaseId !== "custom" && (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground animate-pulse">
                    <CircleNotch className="size-4 animate-spin text-primary" />
                    <span>{processingMessage}</span>
                  </div>
                )}

                {/* Option to Upload Custom PDF / Image */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <Card
                  onClick={() => {
                    setSelectedCaseId("custom");
                    if (!customFile) {
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className={cn(
                    "p-3.5 transition-all cursor-pointer flex flex-col gap-2.5 border",
                    selectedCaseId === "custom"
                      ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/20"
                      : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80",
                    isDragging && "border-primary bg-primary/10 border-dashed"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                      <CloudArrowUp className="size-4.5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs sm:text-sm font-medium text-foreground">
                        Upload Custom Denial Notice (PDF / Image)
                      </span>
                      <p className="text-xs text-muted-foreground font-light">
                        Click to browse or drag and drop your adverse determination letter.
                      </p>
                    </div>
                    {selectedCaseId === "custom" && !customFile && (
                      <CheckCircle className="size-4 text-primary shrink-0" />
                    )}
                  </div>

                  {/* Selected File Chip */}
                  {customFile && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between p-2 rounded-md bg-background/80 border border-border/80 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="size-4 text-primary shrink-0" />
                        <span className="truncate text-foreground font-medium">{customFile.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ({formatFileSize(customFile.size)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-6 px-2 text-[11px] text-primary hover:text-primary"
                        >
                          Change
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomFile(null);
                            setSelectedCaseId(null);
                          }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Remove file"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ================= STEP 4: Confirm Case Context & Records (Parity with Case Radar) ================= */}
          {extractedResult && !contextSubmitted && (
            <Card className="p-5 space-y-6 border-border bg-card/90 shadow-sm rounded-xl animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {isDetailed ? "Confirm Case Context & Clinical Records" : "Case Details & Doctor Notes"}
                    </h3>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] font-mono px-2 py-0.5">
                      {isDetailed ? "Required for AI Brief" : "Needed for your letter"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provide treating provider coordinates and clinical facts so the AI can draft an evidence-grounded appeal.
                  </p>
                </div>
                {activePreset && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSenderName(advocateName || activePreset.sender.name);
                      setSenderCredentials(advocateCredentials || activePreset.sender.credentials || "");
                      setSenderEmail(activePreset.sender.email || "");
                      setSenderPhone(advocatePhone || activePreset.sender.phone || "");
                      setClinicalFacts({ ...activePreset.clinicalFacts });
                      setPhysicianNotes(activePreset.physicianNotes || "");
                    }}
                    className="h-7 text-xs gap-1.5 font-mono text-primary border-primary/30 hover:bg-primary/10"
                  >
                    <Lightning className="size-3 text-primary" />
                    Reset to Preset
                  </Button>
                )}
              </div>

              {/* Section 1: Submitter / Treating Provider Coordinates */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider text-[11px]">
                    Treating Provider / Submitter Coordinates
                  </h4>
                  <span className="text-[11px] text-muted-foreground font-mono">Appears in letterhead & signature block</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="onboard-sender-name" className="mb-1 block text-[11px] font-medium text-foreground">
                      Full Name & Title <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="onboard-sender-name"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Dr. Jordan Lee, MD"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label htmlFor="onboard-sender-cred" className="mb-1 block text-[11px] font-medium text-foreground">
                      Credentials / Role
                    </label>
                    <Input
                      id="onboard-sender-cred"
                      value={senderCredentials}
                      onChange={(e) => setSenderCredentials(e.target.value)}
                      placeholder="Appeals Coordinator"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label htmlFor="onboard-sender-email" className="mb-1 block text-[11px] font-medium text-foreground">
                      Email Address
                    </label>
                    <Input
                      id="onboard-sender-email"
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="jordan.lee@clinic.org"
                      maxLength={320}
                    />
                  </div>
                  <div>
                    <label htmlFor="onboard-sender-phone" className="mb-1 block text-[11px] font-medium text-foreground">
                      Phone Number
                    </label>
                    <Input
                      id="onboard-sender-phone"
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
                      {isDetailed ? "Documented Clinical Findings" : "Medical Details"}
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
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                    <CircleNotch className="size-3.5 animate-spin text-primary" />
                    <span>Preparing denial-specific clinical prompts...</span>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {intakeQuestions.map((question) => (
                      <div key={question.field} className="space-y-1">
                        <label htmlFor={`onboard-clinical-${question.field}`} className="block text-xs font-medium leading-relaxed text-foreground">
                          {question.question}
                        </label>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{question.whyItMatters}</p>
                        <Textarea
                          id={`onboard-clinical-${question.field}`}
                          rows={3}
                          value={clinicalFacts[question.field] || ""}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setClinicalFacts((current: ClinicalFacts) => ({
                              ...current,
                              [question.field]: e.target.value,
                            }))
                          }
                          placeholder="Leave blank if this is not documented in available records."
                          className="bg-background text-xs"
                          maxLength={4000}
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
                      {isDetailed ? "Treating Physician Notes & Clinical Addendum" : "Doctor Notes & Extra Details"}
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
                  id="onboard-physician-notes"
                  rows={6}
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

              {/* Section 5: Mandatory Human Review Gate */}
              <div className="flex items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-3 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-primary" />
                  <div>
                    <span className="font-semibold block text-foreground">Mandatory Human Review Gate</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {isDetailed
                        ? "AI prepares policy research and synthesizes the legal brief. An authorized human must review and approve before any transmission."
                        : "We research the insurer's rules and write the letter. You review and approve before anything is sent."}
                    </span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono shrink-0 px-2 py-0.5 border-primary/40 text-primary"
                >
                  ENFORCED
                </Badge>
              </div>

              {/* Section 6: Attestation */}
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

              {/* Action Footer */}
              <div className="flex flex-col-reverse justify-between gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtractedResult(null)}
                  disabled={isProcessing}
                  className="gap-1.5 text-xs"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to case selection</span>
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
                      <span>{processingMessage}</span>
                    </>
                  ) : (
                    <>
                      <span>Save Context &amp; Initialize Sentinel Pipeline</span>
                      <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* ================= STEP 5: Ingestion Complete & Multi-Vector Armaments HUD ================= */}
          {extractedResult && contextSubmitted && (
            <Card className="p-4 sm:p-5 space-y-4 border-emerald-500/30 bg-card shadow-xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="size-4.5" />
                  <span className="text-sm font-semibold">
                    {isDetailed ? "Case Indexed & Appeal Pipeline Initialized" : "Case added — ready for your appeal"}
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
                      size="sm"
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
                      size="sm"
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
                          ? "AgentMail review-gated delivery, tracking, and reply inbox."
                          : "You approve first. Their reply lands back here."}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
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
                      size="sm"
                      onClick={() => handleDone("p2p")}
                      className="h-6 px-2 text-[11px] gap-1 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 cursor-pointer"
                    >
                      <PhoneCall className="size-3" />
                      <span>{isDetailed ? "Doctor P2P Copilot" : "Doctor call prep"}</span>
                    </Button>
                    <div className="h-3 w-px bg-border shrink-0" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDone("calculator")}
                      className="h-6 px-2 text-[11px] gap-1 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 cursor-pointer"
                    >
                      <Scales className="size-3" />
                      <span>{isDetailed ? "ERISA Audit" : "Cost & Rights"}</span>
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
                    <span>Go to Radar</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDone("evidence")}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <span>{isDetailed ? "Review Clinical Evidence" : "See your proof"}</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Modal Footer Controls (shown only when not in Context Review or Success state) */}
        {!extractedResult && (
          <div className="p-4 sm:p-5 border-t border-border/80 bg-muted/20 flex items-center justify-between">
            <div>
              {step > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  className="gap-1.5 text-xs"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Previous</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  I&apos;ll configure later
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step < 3 ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  className="gap-1.5 text-xs"
                >
                  <span>Continue</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleStartExtraction}
                  disabled={isProcessing}
                  className="gap-2 text-xs font-semibold px-4 shadow-sm"
                >
                  {isProcessing ? (
                    <>
                      <CircleNotch className="size-3.5 animate-spin" />
                      <span>{processingMessage}</span>
                    </>
                  ) : selectedCaseId ? (
                    <>
                      <Lightning className="size-3.5" weight="fill" />
                      <span>Analyze Case & Review Context</span>
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      <span>Complete Setup without Case</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
