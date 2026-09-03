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
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSettings, UserSettings } from "../../hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";

interface SettingsPageProps {
  onNavigateToRadar?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigateToRadar }) => {
  const { settings, isLoading, isSaving, isSyncing, isResetting, saveSettings, syncNow, resetPortfolio } = useSettings();

  const [formState, setFormState] = useState<UserSettings | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [copiedSender, setCopiedSender] = useState(false);
  const [copiedAdjudicator, setCopiedAdjudicator] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isClearingDemo, setIsClearingDemo] = useState(false);
  const [demoPurgeMessage, setDemoPurgeMessage] = useState<string | null>(null);

  const clearDemoDataMutation = useMutation(api.claims.clearDemoData);

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

  const senderEmail = import.meta.env.VITE_AGENTMAIL_SENDER_EMAIL || "claimhero-sender@agentmail.to";
  const adjudicatorEmail = import.meta.env.VITE_AGENTMAIL_ADJUDICATOR_EMAIL || "claimhero-adjudicator@agentmail.to";

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

  const handleCopyAdjudicator = () => {
    navigator.clipboard.writeText(adjudicatorEmail);
    setCopiedAdjudicator(true);
    setTimeout(() => setCopiedAdjudicator(false), 2000);
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
    <div className="flex flex-col h-full overflow-y-auto bg-background/50 p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Top Banner & Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground tracking-tight font-sans">
              Sentinel Settings
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
              v1.45 Engine
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure autonomous appeal dispatching, inbound determination routing, and advocate signature defaults.
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
                  Whether drafted appeals require clinician review in Appeal Studio or dispatch autonomously once overturn probability is verified.
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
                  <option value="autonomous_high_confidence">Autonomous dispatch (Score &ge; 80%)</option>
                </Select>
              </div>
            </div>

            {/* Follow-up Delay */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/30">
              <div className="space-y-0.5 max-w-lg">
                <div className="text-xs font-semibold text-foreground">Statutory follow-up delay</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  After this many quiet days post-submission, Sentinel prepares a statutory 29 CFR § 2560.503-1 bad-faith demand.
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
                <div className="text-xs font-semibold text-foreground">Default statutory posture</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Baseline legal aggressiveness applied when generating new appeal briefs.
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
                  <option value="external_iro_erisa_502_petition">ERISA § 502 / State IRO Petition</option>
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
                  Regularly re-crawls Firecrawl CPB databases, PubMed, and legal precedents to update overturn probability scores for pending cases.
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
                    <span>State / Jurisdiction</span>
                  </label>
                  <Input
                    value={formState.advocateProfile.state}
                    onChange={(e) => handleAdvocateProfileChange("state", e.target.value)}
                    placeholder="e.g. CA"
                    maxLength={2}
                    className="text-xs bg-background/80 font-mono uppercase text-center"
                  />
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
              Configured shared mailboxes for outbound appeal dispatch and two-way simulated payer correspondence.
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
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/30">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground">Simulated Payer Review Inbox</div>
                <div className="text-[11px] text-muted-foreground">
                  AI adjudicator mailbox receiving simulated payer review requests.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 font-mono text-xs text-foreground shadow-2xs">
                  <span className="size-2 rounded-full bg-sky-500" />
                  <span>{adjudicatorEmail}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAdjudicator}
                  className="h-8 gap-1 text-xs cursor-pointer"
                  title="Copy Adjudicator Address"
                >
                  {copiedAdjudicator ? (
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
