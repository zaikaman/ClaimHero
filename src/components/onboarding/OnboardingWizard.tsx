import React, { useState } from "react";
import {
  Scales,
  User,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkle,
  Lightning,
  CloudArrowUp,
  Check,
  CircleNotch,
  Stethoscope,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
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

const convexApi = api as any;

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
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
  },
  {
    id: "advocate",
    title: "Patient Advocate / ERISA Legal Counsel",
    description: "Healthcare law firms, statutory ERISA litigators, and claims advocacy specialists.",
    icon: Scales,
  },
  {
    id: "individual",
    title: "Independent Patient / Healthcare Consumer",
    description: "Self-advocates seeking to overturn surprise out-of-pocket medical bills and adverse determinations.",
    icon: User,
  },
];

const JURISDICTIONS = [
  { code: "CA", label: "California — DMHC / CDI & Knox-Keene Standards" },
  { code: "NY", label: "New York — DFS Independent Dispute Resolution" },
  { code: "TX", label: "Texas — TDI Standard Review Guidelines" },
  { code: "FL", label: "Florida — OIR External Grievance Rules" },
  { code: "IL", label: "Illinois — DOI Consumer Protections" },
  { code: "FED", label: "Federal ERISA 29 CFR § 2560.503-1 Universal" },
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

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onClose,
  onParseText,
  onOpenIngestionModal,
  onSuccess,
}) => {
  const [step, setStep] = useState<number>(1);
  const [selectedRole, setSelectedRole] = useState<string>("provider");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("CA");
  const [selectedPayers, setSelectedPayers] = useState<string[]>([
    "Molina Healthcare",
    "GeoBlue",
    "Blue Cross Blue Shield",
  ]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("molina_knee");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const updateAppealContextMutation = useMutation(convexApi.claims.updateAppealContext);

  const togglePayer = (payer: string) => {
    setSelectedPayers((prev) =>
      prev.includes(payer) ? prev.filter((p) => p !== payer) : [...prev, payer]
    );
  };

  const handleFinish = async () => {
    localStorage.setItem("claimhero_onboarding_completed", "true");
    localStorage.setItem(
      "claimhero_user_profile",
      JSON.stringify({
        role: selectedRole,
        jurisdiction: selectedJurisdiction,
        payers: selectedPayers,
      })
    );

    if (selectedCaseId === "custom") {
      onClose();
      onOpenIngestionModal();
      return;
    }

    const preset = STARTER_CASES.find((c) => c.id === selectedCaseId) || STARTER_CASES[0];
    setIsProcessing(true);

    try {
      const result = await onParseText(preset.content, selectedJurisdiction);
      if (updateAppealContextMutation && preset.sender && preset.clinicalFacts) {
        try {
          await updateAppealContextMutation({
            claimId: result.claimId as any,
            sender: preset.sender,
            clinicalFacts: preset.clinicalFacts,
          });
        } catch (contextErr) {
          console.warn("Could not pre-seed onboarding appeal context:", contextErr);
        }
      }
      setIsProcessing(false);
      onSuccess(result.claimId);
      onClose();
    } catch (err) {
      setIsProcessing(false);
      console.error("Error loading onboarding starter case:", err);
      onClose();
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

              <div className="space-y-2.5">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const isSelected = selectedRole === r.id;
                  return (
                    <Card
                      key={r.id}
                      onClick={() => setSelectedRole(r.id)}
                      className={`p-3.5 transition-all cursor-pointer flex items-start gap-3 border ${
                        isSelected
                          ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80"
                      }`}
                    >
                      <div
                        className={`size-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        <Icon className="size-4.5" />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium text-foreground">
                            {r.title}
                          </span>
                          {isSelected && (
                            <CheckCircle className="size-4 text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-light leading-relaxed">
                          {r.description}
                        </p>
                      </div>
                    </Card>
                  );
                })}
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
                        className={`h-7 px-3 rounded-full text-xs font-medium gap-1.5 transition-all ${
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
                <h3 className="text-sm font-semibold text-foreground">Initialize Your First Sentinel Case</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Load a verified high-value denial letter to instantly experience the full AI defense workflow.
                </p>
              </div>

              <div className="space-y-2.5">
                {STARTER_CASES.map((c) => {
                  const isSelected = selectedCaseId === c.id;
                  return (
                    <Card
                      key={c.id}
                      onClick={() => setSelectedCaseId(c.id)}
                      className={`p-3.5 transition-all cursor-pointer flex items-start gap-3 border ${
                        isSelected
                          ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80"
                      }`}
                    >
                      <div
                        className={`size-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        <Lightning className="size-4.5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium text-foreground">
                            {c.title}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {c.badge}
                          </Badge>
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

                {/* Option to Upload Custom PDF */}
                <Card
                  onClick={() => setSelectedCaseId("custom")}
                  className={`p-3.5 transition-all cursor-pointer flex items-center gap-3 border ${
                    selectedCaseId === "custom"
                      ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                      : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80"
                  }`}
                >
                  <div className="size-9 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                    <CloudArrowUp className="size-4.5" />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs sm:text-sm font-medium text-foreground">
                      Upload Custom Denial Notice (PDF / Image)
                    </span>
                    <p className="text-xs text-muted-foreground font-light">
                      Use your own real adverse determination letter or explanation of benefits document.
                    </p>
                  </div>
                  {selectedCaseId === "custom" && (
                    <CheckCircle className="size-4 text-primary shrink-0" />
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
                ) : (
                  <>
                    <Sparkle className="size-3.5" />
                    <span>Complete Setup & Launch Sentinel</span>
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
