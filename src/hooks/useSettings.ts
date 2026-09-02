import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCallback, useState } from "react";

export interface AdvocateProfile {
  name: string;
  credentials: string;
  organization: string;
  phone: string;
  state: string;
}

export interface UserSettings {
  approvalMode: "manual_review" | "autonomous_high_confidence";
  followUpCadenceDays: number;
  defaultLegalPosture:
    | "administrative_reconsideration"
    | "procedural_grievance_bad_faith"
    | "external_iro_erisa_502_petition";
  autoReplyInbound: boolean;
  autoRescanPolicies: boolean;
  criticalDeadlineAlerts: boolean;
  advocateProfile: AdvocateProfile;
  lastSyncTimestamp?: number;
}

export function useSettings() {
  const rawSettings = useQuery(api.settings.getSettings, {});
  const updateSettingsMutation = useMutation(api.settings.updateSettings);
  const triggerSyncMutation = useMutation(api.settings.triggerManualSweepAndSync);
  const resetPortfolioMutation = useMutation(api.settings.resetPortfolio);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const saveSettings = useCallback(
    async (newSettings: UserSettings) => {
      setIsSaving(true);
      try {
        await updateSettingsMutation({
          approvalMode: newSettings.approvalMode,
          followUpCadenceDays: newSettings.followUpCadenceDays,
          defaultLegalPosture: newSettings.defaultLegalPosture,
          autoReplyInbound: newSettings.autoReplyInbound,
          autoRescanPolicies: newSettings.autoRescanPolicies,
          criticalDeadlineAlerts: newSettings.criticalDeadlineAlerts,
          advocateProfile: newSettings.advocateProfile,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [updateSettingsMutation]
  );

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      return await triggerSyncMutation();
    } finally {
      setIsSyncing(false);
    }
  }, [triggerSyncMutation]);

  const resetPortfolio = useCallback(
    async (confirmText: string) => {
      setIsResetting(true);
      try {
        return await resetPortfolioMutation({ confirmText });
      } finally {
        setIsResetting(false);
      }
    },
    [resetPortfolioMutation]
  );

  return {
    settings: rawSettings as UserSettings | undefined,
    isLoading: rawSettings === undefined,
    isSaving,
    isSyncing,
    isResetting,
    saveSettings,
    syncNow,
    resetPortfolio,
  };
}
