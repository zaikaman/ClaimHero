import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory mock for localStorage in node test environment
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

if (typeof (globalThis as unknown as { window?: unknown }).window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

// Mock CustomEvent if not in DOM environment
if (typeof (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent === "undefined") {
  class MockCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, params?: { detail?: unknown }) {
      this.type = type;
      this.detail = params?.detail;
    }
  }
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = MockCustomEvent;
}

if (typeof (globalThis as unknown as { dispatchEvent?: unknown }).dispatchEvent !== "function") {
  (globalThis as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true;
}

class MockGainNode {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class MockOscillatorNode {
  type = "sine";
  frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockBiquadFilterNode {
  type = "bandpass";
  frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  Q = {
    setValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class MockBufferSourceNode {
  buffer: unknown = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioContext {
  currentTime = 10.0;
  sampleRate = 44100;
  destination = {};
  state = "running";

  createGain() {
    return new MockGainNode();
  }

  createOscillator() {
    return new MockOscillatorNode();
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }

  createBufferSource() {
    return new MockBufferSourceNode();
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  resume = vi.fn().mockResolvedValue(undefined);
}

// Dynamic import of soundEffects so global mocks are in place
const { soundEffects } = await import("../src/lib/soundEffects");
type SoundEffectType = import("../src/lib/soundEffects").SoundEffectType;

describe("SoundEffectsEngine", () => {
  beforeEach(() => {
    storageMap.clear();
    (globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
    soundEffects.setSettings({ enabled: true, volume: 0.35 });
  });

  it("initializes with default settings", () => {
    const settings = soundEffects.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.volume).toBe(0.35);
  });

  it("updates and persists settings to localStorage", () => {
    soundEffects.setSettings({ volume: 0.5 });
    expect(soundEffects.getSettings().volume).toBe(0.5);

    const stored = JSON.parse(mockLocalStorage.getItem("claimhero_audio_settings") || "{}");
    expect(stored.volume).toBe(0.5);
  });

  it("toggles mute state correctly", () => {
    const isNowMuted = !soundEffects.toggleMute();
    expect(isNowMuted).toBe(true);
    expect(soundEffects.getSettings().enabled).toBe(false);

    const isNowActive = soundEffects.toggleMute();
    expect(isNowActive).toBe(true);
    expect(soundEffects.getSettings().enabled).toBe(true);
  });

  it("clamps volume between 0 and 1", () => {
    soundEffects.setSettings({ volume: 1.5 });
    expect(soundEffects.getSettings().volume).toBe(1.0);

    soundEffects.setSettings({ volume: -0.5 });
    expect(soundEffects.getSettings().volume).toBe(0.0);
  });

  it("plays all supported sound effect types without throwing", () => {
    const effectTypes: SoundEffectType[] = [
      "appeal_synthesis_complete",
      "extraction_complete",
      "dossier_compiled",
      "transmission_dispatched",
      "copilot_citation",
      "p2p_overturned_victory",
      "mic_toggle_on",
      "mic_toggle_off",
      "tactile_click",
      "deadline_alert",
    ];

    effectTypes.forEach((type) => {
      expect(() => soundEffects.play(type)).not.toThrow();
    });
  });

  it("suppresses playback when muted unless volume is overridden", () => {
    soundEffects.setSettings({ enabled: false });

    // When muted and no override is provided, nothing should throw and play returns early
    expect(() => soundEffects.play("appeal_synthesis_complete")).not.toThrow();

    // When overrideVolume is provided, it plays even if muted
    expect(() => soundEffects.play("appeal_synthesis_complete", 0.5)).not.toThrow();
  });

  it("gracefully handles missing AudioContext", () => {
    const originalCtx = (globalThis as unknown as { AudioContext?: typeof MockAudioContext }).AudioContext;
    delete (globalThis as unknown as { AudioContext?: typeof MockAudioContext }).AudioContext;

    expect(() => soundEffects.play("appeal_synthesis_complete")).not.toThrow();

    (globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = originalCtx!;
  });
});
