export type SoundEffectType =
  | "appeal_synthesis_complete"
  | "extraction_complete"
  | "dossier_compiled"
  | "transmission_dispatched"
  | "copilot_citation"
  | "p2p_overturned_victory"
  | "mic_toggle_on"
  | "mic_toggle_off"
  | "tactile_click"
  | "deadline_alert";

export interface AudioSettings {
  enabled: boolean;
  volume: number; // 0.0 to 1.0
}

const STORAGE_KEY = "claimhero_audio_settings";
const SETTINGS_EVENT = "claimhero:audio-settings-changed";

const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  volume: 0.35,
};

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private settings: AudioSettings = DEFAULT_SETTINGS;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = {
          enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
          volume:
            typeof parsed.volume === "number" && !isNaN(parsed.volume)
              ? Math.max(0, Math.min(1, parsed.volume))
              : DEFAULT_SETTINGS.volume,
        };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public setSettings(partial: Partial<AudioSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      volume:
        partial.volume !== undefined
          ? Math.max(0, Math.min(1, partial.volume))
          : this.settings.volume,
    };

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: this.settings }));
      } catch {
        // ignore localStorage quota errors
      }
    }
  }

  public toggleMute(): boolean {
    const nextState = !this.settings.enabled;
    this.setSettings({ enabled: nextState });
    return nextState;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;
      try {
        this.ctx = new AudioCtxClass();
      } catch (e) {
        console.warn("Unable to initialize AudioContext:", e);
        return null;
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public play(type: SoundEffectType, overrideVolume?: number): void {
    if (!this.settings.enabled && overrideVolume === undefined) {
      return;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const baseVol = overrideVolume !== undefined ? overrideVolume : this.settings.volume;
    if (baseVol <= 0.001) return;

    try {
      switch (type) {
        case "appeal_synthesis_complete":
          this.synthesizeAppealComplete(ctx, baseVol);
          break;
        case "extraction_complete":
          this.synthesizeExtractionComplete(ctx, baseVol);
          break;
        case "dossier_compiled":
          this.synthesizeDossierCompiled(ctx, baseVol);
          break;
        case "transmission_dispatched":
          this.synthesizeTransmissionDispatched(ctx, baseVol);
          break;
        case "copilot_citation":
          this.synthesizeCopilotCitation(ctx, baseVol);
          break;
        case "p2p_overturned_victory":
          this.synthesizeVictoryTriad(ctx, baseVol);
          break;
        case "mic_toggle_on":
          this.synthesizeMicChirp(ctx, baseVol, true);
          break;
        case "mic_toggle_off":
          this.synthesizeMicChirp(ctx, baseVol, false);
          break;
        case "tactile_click":
          this.synthesizeTactileClick(ctx, baseVol);
          break;
        case "deadline_alert":
          this.synthesizeDeadlineAlert(ctx, baseVol);
          break;
      }
    } catch (err) {
      // Audio autoplay policy or synthesis error
      console.debug("Audio synthesis skipped:", err);
    }
  }

  /**
   * Ascending harmonic chime: C5 (523.25Hz) to G5 (783.99Hz) with crystalline harmonic decay.
   * Tailored for One-Click Appeal Brief completion.
   */
  private synthesizeAppealComplete(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const duration = 0.45;

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVolume * 0.45, now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    masterGain.connect(ctx.destination);

    // Primary lower tone: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    osc1.frequency.exponentialRampToValueAtTime(587.33, now + 0.12); // subtle slide into D5
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.8, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(masterGain);

    // Harmonic upper chime: G5 (783.99 Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, now + 0.06);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0, now + 0.06);
    gain2.gain.linearRampToValueAtTime(0.9, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc2.connect(gain2);
    gain2.connect(masterGain);

    // High crystalline resonance: C6 (1046.5 Hz)
    const osc3 = ctx.createOscillator();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(1046.5, now + 0.1);
    const gain3 = ctx.createGain();
    gain3.gain.setValueAtTime(0, now);
    gain3.gain.setValueAtTime(0, now + 0.1);
    gain3.gain.linearRampToValueAtTime(0.35, now + 0.12);
    gain3.gain.exponentialRampToValueAtTime(0.0005, now + duration);
    osc3.connect(gain3);
    gain3.connect(masterGain);

    osc1.start(now);
    osc2.start(now + 0.06);
    osc3.start(now + 0.1);

    osc1.stop(now + 0.38);
    osc2.stop(now + duration);
    osc3.stop(now + duration);
  }

  /**
   * Fast tactile dual-tick (bandpass filtered at 1800 Hz).
   * Tailored for optical document scan and CPT/CARC parsing completion.
   */
  private synthesizeExtractionComplete(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;

    const playClick = (time: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(freq, time);
      filter.Q.setValueAtTime(2.5, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(masterVolume * 0.3, time + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + duration);
    };

    playClick(now, 1600, 0.025);
    playClick(now + 0.045, 2200, 0.03);
  }

  /**
   * Resonant low-mid pulse transitioning into a crystalline harmonic shimmer.
   * Tailored for Court-Ready Dossier compilation and download.
   */
  private synthesizeDossierCompiled(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const duration = 0.55;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVolume * 0.4, now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    masterGain.connect(ctx.destination);

    // Warm deep foundation: G3 (196 Hz)
    const lowOsc = ctx.createOscillator();
    lowOsc.type = "sine";
    lowOsc.frequency.setValueAtTime(196, now);
    lowOsc.frequency.exponentialRampToValueAtTime(220, now + 0.2);
    const lowGain = ctx.createGain();
    lowGain.gain.setValueAtTime(0, now);
    lowGain.gain.linearRampToValueAtTime(0.7, now + 0.03);
    lowGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    lowOsc.connect(lowGain);
    lowGain.connect(masterGain);

    // Shimmer chord: D5 (587.33 Hz) and A5 (880 Hz)
    const midOsc = ctx.createOscillator();
    midOsc.type = "sine";
    midOsc.frequency.setValueAtTime(587.33, now + 0.08);
    const midGain = ctx.createGain();
    midGain.gain.setValueAtTime(0, now);
    midGain.gain.setValueAtTime(0, now + 0.08);
    midGain.gain.linearRampToValueAtTime(0.6, now + 0.1);
    midGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    midOsc.connect(midGain);
    midGain.connect(masterGain);

    const highOsc = ctx.createOscillator();
    highOsc.type = "sine";
    highOsc.frequency.setValueAtTime(880, now + 0.14);
    const highGain = ctx.createGain();
    highGain.gain.setValueAtTime(0, now);
    highGain.gain.setValueAtTime(0, now + 0.14);
    highGain.gain.linearRampToValueAtTime(0.5, now + 0.16);
    highGain.gain.exponentialRampToValueAtTime(0.0005, now + duration);
    highOsc.connect(highGain);
    highGain.connect(masterGain);

    lowOsc.start(now);
    midOsc.start(now + 0.08);
    highOsc.start(now + 0.14);

    lowOsc.stop(now + 0.35);
    midOsc.stop(now + duration);
    highOsc.stop(now + duration);
  }

  /**
   * Filtered air whoosh and snap.
   * Tailored for AgentMail outbound appeal transmissions.
   */
  private synthesizeTransmissionDispatched(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const duration = 0.28;

    // Filtered white noise burst
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(600, now + duration);
    filter.Q.setValueAtTime(1.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(masterVolume * 0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // Subtle closing click tone
    const snapOsc = ctx.createOscillator();
    snapOsc.type = "triangle";
    snapOsc.frequency.setValueAtTime(440, now + 0.05);
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0, now);
    snapGain.gain.setValueAtTime(0, now + 0.05);
    snapGain.gain.linearRampToValueAtTime(masterVolume * 0.25, now + 0.055);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    snapOsc.connect(snapGain);
    snapGain.connect(ctx.destination);

    noise.start(now);
    snapOsc.start(now + 0.05);

    noise.stop(now + duration);
    snapOsc.stop(now + 0.14);
  }

  /**
   * High-clarity clinical sonar pip (C6, 1046.5 Hz).
   * Tailored for live P2P Copilot refutations and clinical citations surfaced.
   */
  private synthesizeCopilotCitation(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const duration = 0.12;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(masterVolume * 0.35, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Ascending clinical triad: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz).
   * Tailored for P2P victory and denial overturned events.
   */
  private synthesizeVictoryTriad(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    const duration = 0.5;

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.08;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(masterVolume * 0.32, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }

  /**
   * Frequency sweep chirp for mic stream start/stop.
   */
  private synthesizeMicChirp(ctx: AudioContext, masterVolume: number, isStart: boolean): void {
    const now = ctx.currentTime;
    const duration = 0.08;

    const osc = ctx.createOscillator();
    osc.type = "sine";

    const startFreq = isStart ? 320 : 640;
    const endFreq = isStart ? 640 : 320;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(masterVolume * 0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Subtle 20ms tactile click for command palette and quick actions.
   */
  private synthesizeTactileClick(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const duration = 0.02;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(masterVolume * 0.18, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Soft double-pulse beacon for urgent deadline / ERISA statutory threshold warnings.
   */
  private synthesizeDeadlineAlert(ctx: AudioContext, masterVolume: number): void {
    const now = ctx.currentTime;
    const pulseDuration = 0.09;

    const playPulse = (startTime: number) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(261.63, startTime); // C4

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(masterVolume * 0.3, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + pulseDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + pulseDuration);
    };

    playPulse(now);
    playPulse(now + 0.14);
  }
}

// Global Singleton Instance
export const soundEffects = new SoundEffectsEngine();
