import { describe, it, expect, vi, afterEach } from "vitest";
import {
  shouldUseWebGLBackground,
  isWebGLAvailable,
} from "../src/components/landing/UnicornBackground";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stub a minimal browser surface. `matchMedia` answers `matches: true` for
 * every query and the connection reports data-saver, so a test passing under
 * these stubs proves those signals no longer gate the scene off.
 */
function stubClient(opts: { webgl2: boolean; webgl: boolean }) {
  const loseContext = vi.fn();
  const makeGl = () => ({ getExtension: vi.fn(() => ({ loseContext })) });
  const canvas = {
    getContext: vi.fn((kind: string) => {
      if (kind === "webgl2") return opts.webgl2 ? makeGl() : null;
      if (kind === "webgl") return opts.webgl ? makeGl() : null;
      return null;
    }),
  };
  vi.stubGlobal("window", {
    innerWidth: 360,
    matchMedia: vi.fn(() => ({ matches: true })),
  });
  vi.stubGlobal("navigator", { connection: { saveData: true } });
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  return { loseContext, canvas };
}

describe("Unicorn 3D backdrop availability", () => {
  it("renders the scene host during SSR so markup stays stable", () => {
    expect(shouldUseWebGLBackground()).toBe(true);
  });

  it("reports no WebGL when context creation returns null", () => {
    stubClient({ webgl2: false, webgl: false });
    expect(isWebGLAvailable()).toBe(false);
    expect(shouldUseWebGLBackground()).toBe(false);
  });

  it("shows the scene with only a WebGL1 context on a constrained device", () => {
    stubClient({ webgl2: false, webgl: true });
    expect(shouldUseWebGLBackground()).toBe(true);
  });

  it("shows the scene on touch-first, small, data-saver, reduced-motion devices when WebGL exists", () => {
    // All gating signals active at once (coarse pointer via matchMedia,
    // 360px viewport, saveData) — the 3D asset must still render.
    stubClient({ webgl2: true, webgl: true });
    expect(shouldUseWebGLBackground()).toBe(true);
  });

  it("releases the probe context so it never occupies a live-context slot", () => {
    const { loseContext } = stubClient({ webgl2: true, webgl: true });
    expect(isWebGLAvailable()).toBe(true);
    expect(loseContext).toHaveBeenCalled();
  });

  it("fails closed to the gradient when context probing throws", () => {
    vi.stubGlobal("window", { innerWidth: 1280 });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        throw new Error("blocked");
      }),
    });
    expect(isWebGLAvailable()).toBe(false);
    expect(shouldUseWebGLBackground()).toBe(false);
  });
});
