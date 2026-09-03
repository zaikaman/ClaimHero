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
  User,
  FileText,
  X,
  Shield,
  ShieldCheck,
  Lock,
  TrendUp,
  PhoneCall,
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
import {
  fastSanitizeText,
  ComplianceStandard,
} from "../../lib/redactionEngine";

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile?: (
    file: File,
    patientState?: string
  ) => Promise<DenialExtractionResult & { claimId: string }>;
  onParseText: (
    text: string,
    patientState?: string
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
    description: "Hospitals, orthopedic clinics, surgical centers, and healthcare billing departments.",
    icon: Stethoscope,
    defaultName: "Dr. Sarah Chen, MD, FACP",
    defaultCredentials: "Board Certified Internal Medicine / Clinical Advocate",
    defaultOrg: "ClaimHero Health Advocacy Group",
    defaultPhone: "",
  },
  {
    id: "advocate",
    title: "Patient Advocate / ERISA Legal Counsel",
    description: "Healthcare law firms, statutory ERISA litigators, and claims advocacy specialists.",
    icon: Scales,
    defaultName: "Alex Vance, Esq. / ERISA Counsel",
    defaultCredentials: "Healthcare Litigator & Patient Rights Advocate",
    defaultOrg: "Appellate Health Law Practice",
    defaultPhone: "",
  },
  {
    id: "patient",
    title: "Patient / Policyholder Individual",
    description: "Self-insured employees, private insurance members, and surprise-billed consumers.",
    icon: ShieldWarning,
    defaultName: "Patient Self-Representative",
    defaultCredentials: "Pro Se Insured Policyholder",
    defaultOrg: "Individual Policyholder",
    defaultPhone: "",
  },
];

const JURISDICTIONS = [
  { code: "FL", label: "Florida (11th Circuit / AHCA Guidelines)" },
  { code: "CA", label: "California (9th Circuit / Knox-Keene Act & DMHC)" },
  { code: "TX", label: "Texas (5th Circuit / TDI Protections)" },
  { code: "NY", label: "New York (2nd Circuit / DFS Independent Dispute Resolution)" },
  { code: "IL", label: "Illinois (7th Circuit / IDOI Mandates)" },
  { code: "FED", label: "Federal ERISA Statutory Default (29 U.S.C. § 1133)" },
];

const TARGET_PAYERS = [
  "Molina Healthcare",
  "GeoBlue",
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
  const [step, setStep] = useState<number>(1);
  const [selectedRole, setSelectedRole] = useState<string>("provider");
  const [advocateName, setAdvocateName] = useState<string>("Dr. Sarah Chen, MD, FACP");
  const [advocateCredentials, setAdvocateCredentials] = useState<string>("Board Certified Internal Medicine / Clinical Advocate");
  const [advocateOrg, setAdvocateOrg] = useState<string>("ClaimHero Health Advocacy Group");
  const [advocatePhone, setAdvocatePhone] = useState<string>("");

  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("CA");
  const [selectedPayers, setSelectedPayers] = useState<string[]>([
    "Molina Healthcare",
    "GeoBlue",
    "Blue Cross Blue Shield",
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
  const [autoPilotEnabled, setAutoPilotEnabled] = useState<boolean>(true);
  const [privacyRedactionState, setPrivacyRedactionState] = useState<{
    isRedacted: boolean;
    mode: ComplianceStandard;
    count: number;
    categories: string[];
  }>({
    isRedacted: true,
    mode: "HIPAA_SAFE_HARBOR",
    count: 2,
    categories: ["member_id", "dob"],
  });

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

  const handleFileSelect = (file: File) => {
    setCustomFile(file);
    setSelectedCaseId("custom");
    setErrorMessage(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const saveProfileSettings = async () => {
    localStorage.setItem("claimhero_onboarding_completed", "true");
    localStorage.setItem(
      "claimhero_user_profile",
      JSON.stringify({
        role: selectedRole,
        name: advocateName,
        credentials: advocateCredentials,
        organization: advocateOrg,
        phone: advocatePhone,
        jurisdiction: selectedJurisdiction,
        payers: selectedPayers,
      })
    );

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

    setProcessingMessage("Step 2/3: Indexing Insurer CPB & Evaluating Win Score...");
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
      if (!onUploadFile) {
        setIsProcessing(false);
        return;
      }

      setProcessingMessage("Step 1/3: Optical document analysis & clinical entity extraction...");
      try {
        const result = await onUploadFile(customFile, selectedJurisdiction);
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

    setProcessingMessage("Step 1/3: Optical document analysis & clinical entity extraction...");
    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const uniqueContent = preset.content.replace(
        /(CLM-[A-Za-z0-9-]+)/g,
        `$1-${randomSuffix}`
      );
      const result = await onParseText(uniqueContent, selectedJurisdiction);
      setExtractedResult({ ...result, pipelineResult: null });
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
      setPrivacyRedactionState({
        isRedacted: true,
        mode: "HIPAA_SAFE_HARBOR",
        count: 2,
        categories: ["member_id", "dob"],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
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
          isRedacted: privacyRedactionState.isRedacted,
          mode: privacyRedactionState.mode,
          redactedEntityCount: privacyRedactionState.count,
          maskedCategories: privacyRedactionState.categories.length > 0 ? privacyRedactionState.categories : ["member_id", "dob"],
          appliedAt: Date.now(),
        },
      });

      let pipelineResult = null;
      if (autoPilotEnabled) {
        pipelineResult = await executePostExtractionPipeline(extractedResult.claimId);
      }
      setExtractedResult((current) => (current ? { ...current, pipelineResult } : current));
      setContextSubmitted(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save case context.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = (targetView?: string) => {
    localStorage.setItem("claimhero_onboarding_completed", "true");
    if (extractedResult?.claimId) {
      onSuccess(extractedResult.claimId, targetView || "evidence");
    }
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem("claimhero_onboarding_completed", "true");
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
                  Configure your appellate profile and initialize your autonomous defense sentinel
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">
              {extractedResult ? "Case Review" : `Step ${step} of 3`}
            </Badge>
          </div>

          {/* Progress Indicators */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { num: 1, label: "Appellate Role" },
              { num: 2, label: "Jurisdiction & Payers" },
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
                <h3 className="text-sm font-semibold text-foreground">Choose Your Primary Appellate Role</h3>
                <p className="text-xs text-muted-foreground">
                  Tailors legal posture, ERISA statutory notice templates, and signature blocks.
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
                          className={`size-8 rounded-lg flex items-center justify-center ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          <Icon className="size-4" />
                        </div>
                        {isSelected && <CheckCircle className="size-4 text-primary shrink-0" />}
                      </div>
                      <div>
                        <span className="text-xs font-semibold block text-foreground">{role.title}</span>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{role.description}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Profile Coordinates Form */}
              <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <User className="size-3.5 text-primary" />
                    Appellate Submitter Coordinates
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">Used for Brief Signatures</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Advocate / Clinician Name</label>
                    <Input
                      value={advocateName}
                      onChange={(e) => setAdvocateName(e.target.value)}
                      placeholder="e.g. Dr. Sarah Chen, MD"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Credentials & Title</label>
                    <Input
                      value={advocateCredentials}
                      onChange={(e) => setAdvocateCredentials(e.target.value)}
                      placeholder="e.g. MD, Board Certified Orthopedics"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Organization / Clinic</label>
                    <Input
                      value={advocateOrg}
                      onChange={(e) => setAdvocateOrg(e.target.value)}
                      placeholder="e.g. Spine & Neurosurgery Associates"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Official Contact Phone</label>
                    <Input
                      value={advocatePhone}
                      onChange={(e) => setAdvocatePhone(e.target.value)}
                      placeholder="e.g. +1 (800) 555-0199"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: Jurisdiction & Payers ================= */}
          {!extractedResult && step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Primary State Jurisdiction</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Governs statutory review timelines (ERISA 180-day clock vs. California DMHC/CDI standards).
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
                        <span className="text-xs font-medium truncate">{j.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-border/60">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Frequently Targeted Payers</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pre-indexes insurer Clinical Policy Bulletins (CPBs) and overturn precedents.
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
                  Pick a sample medical denial notice to test the full autonomous defense engine, upload your own, or continue to an empty portfolio.
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
                {STARTER_CASES.map((c) => {
                  const isSelected = selectedCaseId === c.id;
                  return (
                    <Card
                      key={c.id}
                      onClick={() => {
                        setSelectedCaseId((prev) => (prev === c.id ? null : c.id));
                        setCustomFile(null);
                      }}
                      className={cn(
                        "p-3.5 transition-all cursor-pointer flex items-start gap-3 border",
                        isSelected
                          ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80"
                      )}
                    >
                      <div
                        className={cn(
                          "size-9 rounded-lg flex items-center justify-center shrink-0 border",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        <Lightning className="size-4.5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium text-foreground">
                            {c.title}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="font-mono text-[9px] text-amber-500 bg-amber-500/10 border-amber-500/20">
                              Synthetic demo — not real PHI
                            </Badge>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {c.badge}
                            </Badge>
                            {isSelected && (
                              <CheckCircle className="size-4 text-primary shrink-0" />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                          <span className="text-emerald-500 font-semibold">{c.amount}</span>
                          <span>•</span>
                          <span>{c.cpt}</span>
                          <span>•</span>
                          <span className="text-rose-500">{c.carc}</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}

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
                      Confirm Case Context & Clinical Records
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
                    <label htmlFor="onboard-sender-name" className="mb-1 block text-[11px] font-medium text-foreground">
                      Full Name
                    </label>
                    <Input
                      id="onboard-sender-name"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Jordan Lee"
                      maxLength={200}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="onboard-sender-role" className="mb-1 block text-[11px] font-medium text-foreground">
                      Credentials or Role
                    </label>
                    <Input
                      id="onboard-sender-role"
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
                  id="onboard-physician-notes"
                  rows={6}
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
                      Social Security Numbers, Member ID suffixes, Dates of Birth, and patient direct identifiers are protected prior to persistent storage.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (physicianNotes) {
                        setPhysicianNotes(fastSanitizeText(physicianNotes).sanitizedText);
                      }
                      setPrivacyRedactionState({
                        isRedacted: true,
                        mode: "HIPAA_SAFE_HARBOR",
                        count: 2,
                        categories: ["ssn", "member_id", "dob"],
                      });
                    }}
                    className="text-xs h-7 gap-1 shrink-0 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                  >
                    <ShieldCheck className="size-3.5" />
                    <span>Re-apply Safe Harbor Mask</span>
                  </Button>
                </div>
              </div>

              {/* Section 5: Auto-Pilot Switch */}
              <div
                onClick={() => setAutoPilotEnabled(!autoPilotEnabled)}
                className={cn(
                  "flex items-center justify-between gap-2 border p-3 rounded-lg text-xs cursor-pointer transition-all",
                  autoPilotEnabled
                    ? "bg-primary/10 border-primary/40 text-primary font-medium"
                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <Lightning className="size-4 shrink-0 text-primary" weight="fill" />
                  <div>
                    <span className="font-semibold block">Autonomous Auto-Pilot Pipeline</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      Automatically crawls insurer CPBs via Firecrawl and synthesizes cited ERISA appeal brief.
                    </span>
                  </div>
                </div>
                <Badge
                  variant={autoPilotEnabled ? "default" : "outline"}
                  className="text-[10px] font-mono shrink-0 px-2 py-0.5"
                >
                  {autoPilotEnabled ? "ON (Recommended)" : "OFF (Manual)"}
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
                    ? "I confirm that the clinical entries and submitter details above reflect the verified case records and are ready for policy citation and appeal brief synthesis."
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
                      <span>{autoPilotEnabled ? "Save Context & Initialize Sentinel Pipeline" : "Save Context"}</span>
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

              {/* Defense Vectors HUD */}
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
                      size="sm"
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
                      size="sm"
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
                      size="sm"
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
                    <span>Go to Radar</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDone("evidence")}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <span>Review Clinical Evidence</span>
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
