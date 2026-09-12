import { useState, useEffect, useCallback } from "react";
import { soundEffects, SoundEffectType, AudioSettings } from "../lib/soundEffects";

const SETTINGS_EVENT = "claimhero:audio-settings-changed";

export function useSoundEffects() {
  const [settings, setSettingsState] = useState<AudioSettings>(() => soundEffects.getSettings());

  useEffect(() => {
    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<AudioSettings>;
      if (customEvent.detail) {
        setSettingsState(customEvent.detail);
      } else {
        setSettingsState(soundEffects.getSettings());
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "claimhero_audio_settings") {
        setSettingsState(soundEffects.getSettings());
      }
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const playSound = useCallback((type: SoundEffectType, overrideVolume?: number) => {
    soundEffects.play(type, overrideVolume);
  }, []);

  const toggleMute = useCallback(() => {
    return soundEffects.toggleMute();
  }, []);

  const setVolume = useCallback((volume: number) => {
    soundEffects.setSettings({ volume });
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    soundEffects.setSettings({ enabled });
  }, []);

  return {
    playSound,
    isMuted: !settings.enabled,
    isEnabled: settings.enabled,
    volume: settings.volume,
    toggleMute,
    setVolume,
    setEnabled,
  };
}
