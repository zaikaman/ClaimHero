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
  Certificate,
  Buildings,
  Phone,
  FileText,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BrandIcon } from "../common/BrandLogo";
import { DenialExtractionResult } from "../../types";
import { SAMPLE_CASE_PRESETS } from "../../lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/utils";

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
  onSuccess: (claimId: string) => void;
}

const ROLES = [
  {
    id: "provider",
    title: "Healthcare Provider / Medical Practice",
    description: "Hospitals, orthopedic clinics, surgical centers, and healthcare billing departments.",
    icon: Stethoscope,
    defaultName: "Dr. Sarah Chen, MD, FACP",
    defaultCredentials: "Board Certified Internal Medicine / Clinical Advocate",
    defaultOrg: "ClaimHero Health Advocacy Group",
    defaultPhone: "+1 (800) 555-0199",
  },
  {
    id: "advocate",
    title: "Patient Advocate / ERISA Legal Counsel",
    description: "Healthcare law firms, statutory ERISA litigators, and claims advocacy specialists.",
    icon: Scales,
    defaultName: "Alex Vance, Esq. / ERISA Counsel",
    defaultCredentials: "Healthcare Litigator & Patient Rights Advocate",
    defaultOrg: "Appellate Health Law Practice",
    defaultPhone: "+1 (800) 555-0188",
  },
  {
    id: "patient",
    title: "Patient / Policyholder Individual",
    description: "Self-insured employees, private insurance members, and surprise-billed consumers.",
    icon: ShieldWarning,
    defaultName: "Patient Self-Representative",
    defaultCredentials: "Pro Se Insured Policyholder",
    defaultOrg: "Individual Policyholder",
    defaultPhone: "+1 (800) 555-0177",
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

const STARTER_CASES = SAMPLE_CASE_PRESETS;

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
  const [advocatePhone, setAdvocatePhone] = useState<string>("+1 (800) 555-0199");

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingSettings = useQuery(api.settings.getSettings, {});
  const updateSettingsMutation = useMutation(api.settings.updateSettings);
  const updateAppealContextMutation = useMutation(api.claims.updateAppealContext);

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

  const handleFinish = async () => {
    setErrorMessage(null);
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

    // Save advocate profile to Convex userSettings
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

    // If user did not pick any case, complete setup directly
    if (!selectedCaseId) {
      onClose();
      return;
    }

    // If custom file was chosen
    if (selectedCaseId === "custom") {
      if (!customFile) {
        // Trigger file picker if no file selected yet
        fileInputRef.current?.click();
        return;
      }

      setIsProcessing(true);
      try {
        if (onUploadFile) {
          const result = await onUploadFile(customFile, selectedJurisdiction);
          if (updateAppealContextMutation) {
            try {
              await updateAppealContextMutation({
                claimId: result.claimId as Id<"claims">,
                sender: {
                  name: advocateName,
                  credentials: advocateCredentials,
                  email: "advocate@claimhero.internal",
                  phone: advocatePhone,
                },
                clinicalFacts: {
                  symptomsAndFunctionalImpact: "Documented in attached clinical record.",
                  examinationFindings: "Documented in attached clinical record.",
                  imagingAndDiagnostics: "Documented in attached clinical record.",
                  treatmentHistoryAndResponse: "Documented in attached clinical record.",
                  otherDocumentedFacts: "Uploaded via Sentinel Onboarding.",
                  recordsAreIncomplete: false,
                },
                physicianNotes: undefined,
              });
            } catch (err) {
              console.warn("Could not attach onboarding sender context:", err);
            }
          }
          setIsProcessing(false);
          onSuccess(result.claimId);
          onClose();
        }
      } catch (err: unknown) {
        setIsProcessing(false);
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      }
      return;
    }

    // Preset case selected
    const preset = STARTER_CASES.find((c) => c.id === selectedCaseId);
    if (!preset) {
      onClose();
      return;
    }

    setIsProcessing(true);
    try {
      const result = await onParseText(preset.content, selectedJurisdiction);
      if (updateAppealContextMutation && preset.sender && preset.clinicalFacts) {
        try {
          await updateAppealContextMutation({
            claimId: result.claimId as Id<"claims">,
            sender: {
              name: advocateName || preset.sender.name,
              credentials: advocateCredentials || preset.sender.credentials,
              email: preset.sender.email,
              phone: advocatePhone || preset.sender.phone,
            },
            clinicalFacts: preset.clinicalFacts,
            physicianNotes: preset.physicianNotes || undefined,
          });
        } catch (contextErr) {
          console.warn("Could not pre-seed onboarding appeal context:", contextErr);
        }
      }
      setIsProcessing(false);
      onSuccess(result.claimId);
      onClose();
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("claimhero_onboarding_completed", "true");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl p-0 gap-0 border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header & Step Progress Bar */}
        <div className="p-5 sm:p-6 pb-4 border-b border-border/80 bg-muted/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <BrandIcon size="sm" glow interactive />
              <DialogHeader className="space-y-0.5 text-left">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold">
                    ClaimHero Sentinel Setup Guide
                  </DialogTitle>
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    Onboarding
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Configure your adjudication parameters and initialize your first clinical appeal.
                </DialogDescription>
              </DialogHeader>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
            >
              Skip Setup
            </Button>
          </div>

          {/* Step Indicator Progress Bar */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[
              { num: 1, label: "Role & Practice" },
              { num: 2, label: "Jurisdiction & Payers" },
              { num: 3, label: "Starter Appeal Case" },
            ].map((s) => (
              <div key={s.num} className="space-y-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step >= s.num
                      ? "bg-primary shadow-[0_0_8px_rgba(0,229,255,0.3)]"
                      : "bg-muted"
                  }`}
                />
                <div className="text-[11px] font-mono flex items-center justify-between text-muted-foreground">
                  <span className={step === s.num ? "text-foreground font-semibold" : ""}>
                    Step {s.num}
                  </span>
                  <span className="hidden sm:inline text-[10px] opacity-75 truncate max-w-[100px]">
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto text-left">
          
          {/* ================= STEP 1: Role Selection ================= */}
          {step === 1 && (
            <div className="space-y-3.5 animate-fadeIn">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Select Your Adjudication Role</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This tailors your appeal brief arguments, statutory citations, and clinical evidence parameters.
                </p>
              </div>

              <div className="space-y-2">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const isSelected = selectedRole === r.id;
                  return (
                    <Card
                      key={r.id}
                      onClick={() => handleRoleSelect(r.id)}
                      className={`p-3 transition-all cursor-pointer flex items-start gap-3 border ${
                        isSelected
                          ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80"
                      }`}
                    >
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            {r.title}
                          </span>
                          {isSelected && (
                            <CheckCircle className="size-4 text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-light leading-relaxed">
                          {r.description}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Advocate & Clinical Signatory Profile Inputs */}
              <div className="pt-3 border-t border-border/60 space-y-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <User className="size-3.5 text-primary" />
                    <span>Advocate & Clinical Signatory Profile</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Default credentials pre-populated in synthesized appeal briefs, letters of medical necessity, and P2P defense scripts.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <User className="size-3" />
                      <span>Advocate / Physician Name</span>
                    </label>
                    <Input
                      value={advocateName}
                      onChange={(e) => setAdvocateName(e.target.value)}
                      placeholder="e.g. Dr. Sarah Chen, MD, FACP"
                      className="text-xs bg-background/80 h-8"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Certificate className="size-3" />
                      <span>Credentials & Specialty</span>
                    </label>
                    <Input
                      value={advocateCredentials}
                      onChange={(e) => setAdvocateCredentials(e.target.value)}
                      placeholder="e.g. Board Certified Internal Medicine"
                      className="text-xs bg-background/80 h-8"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Buildings className="size-3" />
                      <span>Organization / Clinic</span>
                    </label>
                    <Input
                      value={advocateOrg}
                      onChange={(e) => setAdvocateOrg(e.target.value)}
                      placeholder="e.g. ClaimHero Health Advocacy Group"
                      className="text-xs bg-background/80 h-8"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Phone className="size-3" />
                      <span>Contact Phone</span>
                    </label>
                    <Input
                      value={advocatePhone}
                      onChange={(e) => setAdvocatePhone(e.target.value)}
                      placeholder="+1 (800) 555-0199"
                      className="text-xs bg-background/80 h-8 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: Jurisdiction & Payers ================= */}
          {step === 2 && (
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

          {/* ================= STEP 3: Starter Appeal Case ================= */}
          {step === 3 && (
            <div className="space-y-3.5 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Initialize Your First Sentinel Case (Optional)</h3>
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
                  Pick a sample denial notice to immediately test the defense engine, upload your own, or continue to an empty workspace.
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
                          ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
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
                      ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
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
        </div>

        {/* Modal Footer Controls */}
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
                onClick={handleFinish}
                disabled={isProcessing}
                className="gap-2 text-xs font-semibold px-4 shadow-sm"
              >
                {isProcessing ? (
                  <>
                    <CircleNotch className="size-3.5 animate-spin" />
                    <span>Ingesting & Parsing Case...</span>
                  </>
                ) : selectedCaseId ? (
                  <>
                    <Lightning className="size-3.5" weight="fill" />
                    <span>Complete Setup & Launch Sentinel</span>
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    <span>Complete Setup</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
