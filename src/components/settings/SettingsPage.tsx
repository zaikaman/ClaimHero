import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  Copy,
  Check,
  ArrowsClockwise,
  Scales,
  EnvelopeSimple,
  WarningCircle,
  CircleNotch,
  User,
  Phone,
  Buildings,
  Certificate,
  MapPin,
  FloppyDisk,
  Sparkle,
  Trash,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Play,
  ShieldCheck,
  GraduationCap,
  Flask,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSettings, UserSettings } from "../../hooks/useSettings";
import { useSoundEffects } from "../../hooks/useSoundEffects";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import { useDetailMode } from "../../hooks/useDetailMode";
import { DetailModeToggle } from "../common/DetailModeToggle";

interface SettingsPageProps {
  onNavigateToRadar?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigateToRadar }) => {
  const { isDetailed, setDetailMode } = useDetailMode();
  const { settings, isLoading, isSaving, isSyncing, isResetting, saveSettings, syncNow, resetPortfolio } = useSettings();
  const {
    isEnabled: isAudioEnabled,
    volume: audioVolume,
    setEnabled: setAudioEnabled,
    setVolume: setAudioVolume,
    playSound,
  } = useSoundEffects();

  const [formState, setFormState] = useState<UserSettings | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [copiedSender, setCopiedSender] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isClearingDemo, setIsClearingDemo] = useState(false);
  const [demoPurgeMessage, setDemoPurgeMessage] = useState<string | null>(null);

  const clearDemoDataMutation = useMutation(api.claims.clearDemoData);
  const seedDemoCasesMutation = useMutation(api.demoSeeder.seedDemoCases);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  const handleSeedDemoData = async () => {
    try {
      setIsSeedingDemo(true);
      const res = await seedDemoCasesMutation({});
      if (res.alreadySeeded) {
        setDemoPurgeMessage("Evaluation demo cases are already active in your workspace.");
      } else {
        setDemoPurgeMessage("Successfully loaded 3 comprehensive evaluation demo cases.");
      }
      setTimeout(() => setDemoPurgeMessage(null), 4000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to load demo cases");
    } finally {
      setIsSeedingDemo(false);
    }
  };

  const handleClearDemoData = async () => {
    try {
      setIsClearingDemo(true);
      const res = await clearDemoDataMutation({});
      setDemoPurgeMessage(`Successfully purged ${res.deletedClaimsCount} synthetic demo cases.`);
      setTimeout(() => setDemoPurgeMessage(null), 4000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to purge demo cases");
    } finally {
      setIsClearingDemo(false);
    }
  };

  const senderEmail = import.meta.env.VITE_AGENTMAIL_SENDER_EMAIL || "";
  const isSenderConfigured = Boolean(senderEmail && senderEmail.trim().length > 0);

  // Initialize local form state once settings are loaded
  useEffect(() => {
    if (settings && !formState) {
      setFormState(settings);
    }
  }, [settings, formState]);

  const handleFieldChange = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!formState) return;
    setFormState({
      ...formState,
      [key]: value,
    });
    setHasUnsavedChanges(true);
    setSaveSuccessMessage(null);
  };

  const handleAdvocateProfileChange = (key: keyof UserSettings["advocateProfile"], value: string) => {
    if (!formState) return;
    setFormState({
      ...formState,
      advocateProfile: {
        ...formState.advocateProfile,
        [key]: value,
      },
    });
    setHasUnsavedChanges(true);
    setSaveSuccessMessage(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formState) return;

    await saveSettings(formState);
    setHasUnsavedChanges(false);
    setSaveSuccessMessage("Settings saved successfully to Sentinel core.");
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleCopySender = () => {
    navigator.clipboard.writeText(senderEmail);
    setCopiedSender(true);
    setTimeout(() => setCopiedSender(false), 2000);
  };


  const handleSync = async () => {
    setSyncFeedback(null);
    const result = await syncNow();
    if (result) {
      setSyncFeedback(
        `Synchronized ${result.activeClaimsChecked} cases (${result.deadlinesUpdated} deadlines updated).`
      );
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleConfirmReset = async () => {
    if (resetConfirmInput !== "RESET_PORTFOLIO") {
      setResetError("Please enter exact confirmation phrase: RESET_PORTFOLIO");
      return;
    }

    try {
      setResetError(null);
      await resetPortfolio(resetConfirmInput);
      setIsResetModalOpen(false);
      setResetConfirmInput("");
      if (onNavigateToRadar) {
        onNavigateToRadar();
      }
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Failed to reset portfolio");
    }
  };

  if (isLoading || !formState) {
    return (
      <div className="flex h-full items-center justify-center space-y-3 flex-col">
        <CircleNotch className="size-6 text-foreground animate-spin" />
        <span className="text-xs font-mono text-muted-foreground">Loading Sentinel settings...</span>
      </div>
    );
  }

  const lastSyncDate = formState.lastSyncTimestamp
    ? new Date(formState.lastSyncTimestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Just now";

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background/50 p-3.5 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Top Banner & Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground tracking-tight font-sans">
              {isDetailed ? "Sentinel Settings" : "App Settings"}
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
              v1.45 Engine
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure review-gated appeal dispatching, inbound determination routing, and advocate signature defaults.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccessMessage && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
              <CheckCircle className="size-4 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-[11px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">
              Unsaved changes
            </Badge>
          )}
          <Button
            onClick={() => handleSave()}
            disabled={isSaving || !hasUnsavedChanges}
            size="sm"
            className="h-8 gap-1.5 px-3.5 text-xs font-medium cursor-pointer"
          >
            {isSaving ? (
              <CircleNotch className="size-3.5 animate-spin" />
            ) : (
              <FloppyDisk className="size-3.5" />
            )}
            <span>Save Settings</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* System Language & Scope Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground shrink-0">System Jurisdiction:</span>
            <span className="text-muted-foreground truncate">
              {isDetailed ? "United States Healthcare • ERISA / ACA / CMS" : "United States Healthcare Plans"}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/10 shrink-0 self-start sm:self-auto">
            EN-US • ERISA 29 U.S.C. § 1133
          </Badge>
        </div>

        {/* Card 1: Outreach & Appeal Dispatch */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Scales className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Outreach & Appeal Dispatch</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Determine how synthesized appeal briefs and statutory demands are authorized and transmitted.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-5">
            {/* Approval Mode */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Approval mode</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Whether drafted appeals require clinician review in Appeal Studio or enter review-gated staging once Evidence Coverage is verified.
                </div>
              </div>
              <div className="w-full sm:w-64">
                <Select
                  value={formState.approvalMode}
                  onChange={(e) =>
                    handleFieldChange(
                      "approvalMode",
                      e.target.value as "manual_review" | "autonomous_high_confidence"
                    )
                  }
                  className="w-full text-xs bg-background/80"
                >
                  <option value="manual_review">I approve each appeal brief</option>
                  <option value="autonomous_high_confidence" disabled={!isSenderConfigured}>
                    Review-gated dispatch (Score &ge; 80%){!isSenderConfigured ? " (Requires AgentMail sender env)" : ""}
                  </option>
                </Select>
                {!isSenderConfigured && (
                  <p className="text-[10px] text-amber-400 font-mono mt-1">
                    Review-gated dispatch unconfigured: VITE_AGENTMAIL_SENDER_EMAIL is not configured in environment.
                  </p>
                )}
              </div>
            </div>

            {/* Follow-up Delay */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">
                  {isDetailed ? "Statutory follow-up delay" : "Follow-up reminder delay"}
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {isDetailed
                    ? "After this many quiet days post-submission, Sentinel prepares a statutory 29 CFR § 2560.503-1 bad-faith demand."
                    : "After this many days without an insurer response, an escalation reminder is prepared."}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={formState.followUpCadenceDays}
                  onChange={(e) =>
                    handleFieldChange(
                      "followUpCadenceDays",
                      parseInt(e.target.value, 10) || 14
                    )
                  }
                  className="w-20 text-xs font-mono text-center bg-background/80"
                />
                <span className="text-xs text-muted-foreground font-mono">days</span>
              </div>
            </div>

            {/* Default Legal Posture */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">
                  {isDetailed ? "Default statutory posture" : "Default appeal tone"}
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {isDetailed
                    ? "Baseline legal aggressiveness applied when generating new appeal briefs."
                    : "Tone and legal urgency applied when drafting new appeal letters."}
                </div>
              </div>
              <div className="w-full sm:w-64">
                <Select
                  value={formState.defaultLegalPosture}
                  onChange={(e) =>
                    handleFieldChange(
                      "defaultLegalPosture",
                      e.target.value as
                        | "administrative_reconsideration"
                        | "procedural_grievance_bad_faith"
                        | "external_iro_erisa_502_petition"
                    )
                  }
                  className="w-full text-xs bg-background/80"
                >
                  <option value="administrative_reconsideration">Standard Reconsideration</option>
                  <option value="procedural_grievance_bad_faith">Elevated Bad-Faith Grievance</option>
                  <option value="external_iro_erisa_502_petition">
                    {isDetailed ? "ERISA § 502 / State IRO Petition" : "External State Review / Legal Petition"}
                  </option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Agent Autonomy & Intelligence */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Sparkle className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Autonomy & Intelligence</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Automated background intelligence pipelines, payer response routing, and compliance monitors.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-5">
            {/* Auto-reply on inbound determinations */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Auto-reply to payer determinations</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  When a payer emails requests for records or upholds a denial, Sentinel immediately analyzes clinical codes and drafts a targeted rebuttal.
                </div>
              </div>
              <Switch
                checked={formState.autoReplyInbound}
                onCheckedChange={(checked) => handleFieldChange("autoReplyInbound", checked)}
              />
            </div>

            {/* Weekly automatic policy bulletin rescan */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Automatic clinical guideline rescan</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {isDetailed
                    ? "Regularly re-crawls Firecrawl CPB databases, PubMed, and legal precedents to update Statutory Appeal Readiness scores for pending cases."
                    : "Regularly checks insurer rules, medical studies, and legal wins to update case strength scores."}
                </div>
              </div>
              <Switch
                checked={formState.autoRescanPolicies}
                onCheckedChange={(checked) => handleFieldChange("autoRescanPolicies", checked)}
              />
            </div>

            {/* Critical Statutory Expiry Alarms */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Critical statutory deadline alarms</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Surfaces urgent platform notifications and elevates cases with fewer than 14 days before statute of limitations expiry.
                </div>
              </div>
              <Switch
                checked={formState.criticalDeadlineAlerts}
                onCheckedChange={(checked) => handleFieldChange("criticalDeadlineAlerts", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Advocate & Clinical Profile Defaults */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <User className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Advocate & Clinical Profile</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Default signatory credentials pre-populated in synthesized appeal briefs, letters of medical necessity, and P2P defense scripts.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <User className="size-3.5" />
                  <span>Advocate / Physician Name</span>
                </label>
                <Input
                  value={formState.advocateProfile.name}
                  onChange={(e) => handleAdvocateProfileChange("name", e.target.value)}
                  placeholder="e.g. Dr. Sarah Chen, MD, FACP"
                  className="text-xs bg-background/80"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Certificate className="size-3.5" />
                  <span>Credentials & Specialty</span>
                </label>
                <Input
                  value={formState.advocateProfile.credentials}
                  onChange={(e) => handleAdvocateProfileChange("credentials", e.target.value)}
                  placeholder="e.g. Board Certified Internal Medicine"
                  className="text-xs bg-background/80"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Buildings className="size-3.5" />
                  <span>Organization / Clinic</span>
                </label>
                <Input
                  value={formState.advocateProfile.organization}
                  onChange={(e) => handleAdvocateProfileChange("organization", e.target.value)}
                  placeholder="e.g. ClaimHero Health Advocacy Group"
                  className="text-xs bg-background/80"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                    <Phone className="size-3.5" />
                    <span>Contact Phone</span>
                  </label>
                  <Input
                    value={formState.advocateProfile.phone}
                    onChange={(e) => handleAdvocateProfileChange("phone", e.target.value)}
                    placeholder="+1 (800) 555-0199"
                    className="text-xs bg-background/80 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    <span>Patient State (DOI Ref.)</span>
                  </label>
                  <Input
                    value={formState.advocateProfile.state}
                    onChange={(e) => handleAdvocateProfileChange("state", e.target.value)}
                    placeholder="e.g. CA"
                    maxLength={2}
                    className="text-xs bg-background/80 font-mono uppercase text-center"
                    title="Federal ERISA engine only; used for DOI references in letters"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Federal ERISA engine only; used for DOI references in letters.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: AgentMail Communications Gateway */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <EnvelopeSimple className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">AgentMail Communications Gateway</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Configured shared mailbox for outbound appeal dispatch and two-way payer correspondence.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/30">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground">Appeals Transmission Outbox</div>
                <div className="text-[11px] text-muted-foreground">
                  Outbound appeal briefs and case correspondence transmission address.
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSenderConfigured ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 font-mono text-xs text-foreground shadow-2xs">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{senderEmail}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySender}
                      className="h-8 gap-1 text-xs cursor-pointer"
                      title="Copy Sender Address"
                    >
                      {copiedSender ? (
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
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 font-mono text-xs shadow-2xs">
                      <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-500/30 bg-amber-500/10">
                        Not configured
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">VITE_AGENTMAIL_SENDER_EMAIL absent</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="h-8 gap-1 text-xs opacity-50 cursor-not-allowed"
                      title="Sender address not configured in environment"
                    >
                      <Copy className="size-3.5" />
                      <span>Copy</span>
                    </Button>
                  </>
                )}
              </div>
            </div>


            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground">Real-time gateway synchronization</div>
                <div className="text-[11px] text-muted-foreground">
                  Last synchronized: <span className="font-mono text-foreground">{lastSyncDate}</span>
                </div>
                {syncFeedback && (
                  <div className="text-[11px] text-emerald-500 font-medium pt-0.5">{syncFeedback}</div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
                className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
              >
                <ArrowsClockwise className={cn("size-3.5", isSyncing && "animate-spin")} />
                <span>{isSyncing ? "Synchronizing..." : "Sync Inboxes & Sweep Deadlines"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card: Interface Language & Terminology Mode */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  {isDetailed ? "Interface Language & Terminology Mode" : "Language & Details"}
                </CardTitle>
              </div>
              <DetailModeToggle />
            </div>
            <CardDescription className="text-xs">
              {isDetailed
                ? "Configure plain language translation layer. Simple mode presents everyday advocate language; Detailed mode displays clinical and statutory citations (CPT codes, CARC reason, CPB bulletins, ERISA 29 CFR § 2560)."
                : "Choose whether you want everyday simple words or expert medical billing codes and law citations."}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDetailMode("simple")}
                className={cn(
                  "flex flex-col text-left p-3.5 rounded-lg border transition-all cursor-pointer",
                  !isDetailed
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-foreground">Simple Mode (Everyday Language)</span>
                  {!isDetailed && <Badge variant="default" className="text-[10px] h-4 px-1.5">Active</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Clear, human language designed for patients and everyday advocates. Labels say &ldquo;My Cases&rdquo;, &ldquo;Your proof&rdquo;, and &ldquo;Fees they may owe&rdquo;.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDetailMode("detailed")}
                className={cn(
                  "flex flex-col text-left p-3.5 rounded-lg border transition-all cursor-pointer",
                  isDetailed
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-foreground">Detailed Mode (Expert & Statutory)</span>
                  {isDetailed && <Badge variant="default" className="text-[10px] h-4 px-1.5">Active</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Reveals exact medical billing codes (CPT/HCPCS, CARC/RARC), published Clinical Policy Bulletins (CPB), and federal citations (ERISA 29 CFR § 2560.503-1).
                </p>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Card: Acoustic Sentinel Sensory Feedback */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              {isAudioEnabled ? (
                <SpeakerSimpleHigh className="size-4 text-primary" />
              ) : (
                <SpeakerSimpleSlash className="size-4 text-muted-foreground/60" />
              )}
              <CardTitle className="text-sm font-semibold">Acoustic Sentinel Sensory Feedback</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Configure precision Web Audio acoustic tones for synthesis completion, document extractions, dossier compilations, and P2P defense alerts.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-5">
            {/* Master Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Acoustic feedback cues</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Synthesize clinical acoustic feedback when long background jobs resolve or real-time citations surface.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">
                  {isAudioEnabled ? "Enabled" : "Muted"}
                </span>
                <Switch
                  checked={isAudioEnabled}
                  onCheckedChange={(checked) => {
                    setAudioEnabled(checked);
                    if (checked) {
                      playSound("tactile_click");
                    }
                  }}
                />
              </div>
            </div>

            {/* Volume Control */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Master acoustic volume</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Adjust procedural synthesizer amplitude. Kept soft and clinical by default to prevent alarm fatigue.
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-64">
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={audioVolume}
                  disabled={!isAudioEnabled}
                  aria-label="Master acoustic volume"
                  onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                />
                <span className="text-xs font-mono text-foreground w-10 text-right">
                  {Math.round(audioVolume * 100)}%
                </span>
              </div>
            </div>

            {/* Audition Tones Grid */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-foreground">Audition Sentinel Acoustic Profiles</div>
              <div className="text-[11px] text-muted-foreground">
                Preview real-time synthesized tones directly generated through Web Audio API:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                {[
                  {
                    name: "Appeal Synthesis",
                    desc: "Harmonic dual chime on brief ready",
                    cue: "appeal_synthesis_complete" as const,
                  },
                  {
                    name: "Ingestion / OCR",
                    desc: "Dual micro-tick on entity parse",
                    cue: "extraction_complete" as const,
                  },
                  {
                    name: "Dossier Compiled",
                    desc: "Resonant pulse on legal binder",
                    cue: "dossier_compiled" as const,
                  },
                  {
                    name: "AgentMail Dispatch",
                    desc: "Acoustic whoosh on transmission",
                    cue: "transmission_dispatched" as const,
                  },
                  {
                    name: "P2P Copilot Citation",
                    desc: "Clinical sonar pip on live rebuttal",
                    cue: "copilot_citation" as const,
                  },
                  {
                    name: "P2P Overturn Victory",
                    desc: "Ascending triad on authorization",
                    cue: "p2p_overturned_victory" as const,
                  },
                  {
                    name: "Deadline Urgency",
                    desc: "Double-pulse beacon on ERISA limit",
                    cue: "deadline_alert" as const,
                  },
                  {
                    name: "Command Palette",
                    desc: "Tactile micro-click on navigation",
                    cue: "tactile_click" as const,
                  },
                ].map((item) => (
                  <button
                    key={item.cue}
                    type="button"
                    aria-label={`Preview ${item.name} acoustic cue`}
                    onClick={() => playSound(item.cue, Math.max(audioVolume, 0.25))}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-background/60 hover:bg-muted/50 hover:border-border transition-all text-left group cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">
                        {item.desc}
                      </div>
                    </div>
                    <div className="size-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0">
                      <Play className="size-3 fill-current" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Danger Zone */}
        <Card className="border-destructive/30 bg-destructive/5 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-destructive/20">
            <div className="flex items-center gap-2 text-destructive">
              <WarningCircle className="size-4" />
              <CardTitle className="text-sm font-semibold text-destructive">Danger Zone</CardTitle>
            </div>
            <CardDescription className="text-xs text-destructive/80">
              Irreversible workspace operations. Please proceed with caution.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {demoPurgeMessage && (
              <div className="text-[11px] text-emerald-500 font-medium bg-emerald-500/10 border border-emerald-500/30 rounded px-2.5 py-1.5">
                {demoPurgeMessage}
              </div>
            )}

            {/* Load / Restore Demo Data */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Load synthetic evaluation demo data</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Seeds 3 authentic, comprehensive evaluation cases (Cigna, GeoBlue, Aetna) with Firecrawl policy bulletins, cited briefs, and P2P defense scripts.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedDemoData}
                disabled={isSeedingDemo}
                className="h-8 text-xs font-medium text-primary hover:bg-primary/10 border-primary/30 shrink-0 cursor-pointer"
              >
                <Flask className="size-3.5 mr-1" />
                <span>{isSeedingDemo ? "Loading Cases..." : "Load Demo Cases"}</span>
              </Button>
            </div>

            {/* Scoped Demo Purge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-destructive/15">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Purge synthetic evaluation demo data</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Removes only evaluation demo fixtures, associated evidence, and simulated review threads without touching your real patient cases.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearDemoData}
                disabled={isClearingDemo}
                className="h-8 text-xs font-medium text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 cursor-pointer"
              >
                <Trash className="size-3.5 mr-1" />
                <span>{isClearingDemo ? "Purging..." : "Purge Demo Data"}</span>
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Reset case portfolio</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Permanently deletes all claims, crawled clinical policy evidence, briefs, and email threads in this workspace.
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setResetConfirmInput("");
                  setResetError(null);
                  setIsResetModalOpen(true);
                }}
                className="h-8 text-xs font-medium shrink-0 cursor-pointer"
              >
                Reset Portfolio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Danger Zone Confirmation Modal */}
      <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <WarningCircle className="size-5" />
              <span>Confirm Portfolio Reset</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              This action will permanently delete all claims, associated evidence files, appeal drafts, and communication threads. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">
              To confirm, type <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">RESET_PORTFOLIO</span> below:
            </div>
            <Input
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="RESET_PORTFOLIO"
              className="font-mono text-xs"
            />
            {resetError && <div className="text-xs text-destructive font-medium">{resetError}</div>}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmReset}
              disabled={isResetting || resetConfirmInput !== "RESET_PORTFOLIO"}
              className="gap-1.5"
            >
              {isResetting && <CircleNotch className="size-3.5 animate-spin" />}
              <span>Permanently Reset</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
