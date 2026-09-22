import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    UnicornStudio?: {
      isInitialized?: boolean;
      init?: () => void;
    };
  }
}

const UNICORN_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.34/dist/unicornStudio.umd.js";
const UNICORN_PROJECT_ID = "bmaMERjX2VZDtPrh4Zwx";

/** Max CDN fetch attempts before conceding to the gradient underlay. */
const MAX_SCRIPT_ATTEMPTS = 3;
/** Per-attempt network timeout (ms) so a hanging CDN never blocks the scene forever. */
const SCRIPT_TIMEOUT_MS = 12000;

/**
 * Probe for a real GPU-backed WebGL context. This is the ONLY gate left in
 * front of the scene: without a context there is no WebGL to show on any
 * device, so the static gradient carries the section instead.
 *
 * The probe context is released immediately via WEBGL_lose_context so it
 * never occupies one of the browser's limited (~8-16) live-context slots.
 */
export function isWebGLAvailable(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGLRenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) return false;
    try {
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      // Releasing is best-effort; the probe result still stands.
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide whether this device should run the full-viewport Unicorn Studio
 * WebGL scene.
 *
 * The scene renders on every device with a working WebGL context: capable
 * desktops, lower-end laptops, and mobile alike. Pointer type, viewport
 * width, reduced-motion preference, and data-saver mode no longer gate the
 * scene off; they only describe how constrained the GPU budget is, which is
 * handled by non-blocking load scheduling (idle-deferred CDN fetch,
 * low-priority script, fade-in over an always-painted gradient) rather than
 * by omission.
 *
 * Server-side rendering (and unit tests) have no `window`: default to `true`
 * there so the scene host markup stays stable and the client boots the same
 * tree the server rendered.
 */
export function shouldUseWebGLBackground(): boolean {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return true;
    }
    return isWebGLAvailable();
  } catch {
    return false;
  }
}

/**
 * Run `fn` once the browser is idle (or shortly after first paint where the
 * idle primitive is unavailable, e.g. older Safari), so the player CDN fetch
 * and scene boot never contend with hero text / LCP paint.
 */
function runWhenIdle(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const idle = (window as unknown as {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  if (typeof idle === "function") {
    const id = idle.call(window, fn, { timeout: 2000 });
    return () => {
      try {
        (window as unknown as {
          cancelIdleCallback?: (id: number) => void;
        }).cancelIdleCallback?.(id);
      } catch {
        // Cleanup is best-effort.
      }
    };
  }
  // Fallback path: two frames past paint, then boot. Cheap and paint-safe.
  let rafA = 0;
  let rafB = 0;
  let timer = 0;
  rafA = window.requestAnimationFrame(() => {
    rafB = window.requestAnimationFrame(() => {
      timer = window.setTimeout(fn, 0);
    });
  });
  return () => {
    window.cancelAnimationFrame(rafA);
    window.cancelAnimationFrame(rafB);
    window.clearTimeout(timer);
  };
}

/**
 * Shared backdrop for the public surface (landing + login).
 *
 * Every WebGL-capable device gets the Unicorn Studio scene; the static
 * gradient underneath is always painted first, so first paint is instant and
 * the scene fades in over it when the player is ready. If the 3D CDN is
 * unreachable after retries, or the device genuinely has no WebGL, the
 * gradient still carries the section and the page never looks broken.
 *
 * Stacking is deliberately flat: an `absolute inset-0 z-0` layer inside the
 * relatively-positioned, isolated PublicExperience root. No `position: fixed`,
 * no negative z-index children, and no `mask-image` on the container (masks
 * over WebGL children are a known iOS Safari compositing hazard). Edge fades
 * are plain background overlays, which composite safely everywhere.
 */
export function UnicornBackground() {
  const [useWebGL] = useState<boolean>(() => shouldUseWebGLBackground());
  const [sceneReady, setSceneReady] = useState<boolean>(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!useWebGL) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    let retryTimer = 0;

    const boot = () => {
      if (cancelled || !host.isConnected) return;
      try {
        window.UnicornStudio?.init?.();
      } catch {
        // Player failed to boot; gradient underlay still carries the section.
      }
      if (window.UnicornStudio) {
        window.UnicornStudio.isInitialized = true;
      }
    };

    // Fade the scene in the moment the player injects its canvas, so the
    // backdrop cross-fades instead of popping over the gradient.
    const observer = new MutationObserver(() => {
      if (host.querySelector("canvas")) {
        if (!cancelled) setSceneReady(true);
        observer.disconnect();
      }
    });
    observer.observe(host, { childList: true, subtree: true });

    const clearRetryTimer = () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = 0;
      }
    };

    const injectScript = (attempt: number) => {
      if (cancelled || !host.isConnected) return;
      if (window.UnicornStudio?.isInitialized) {
        boot();
        return;
      }
      const existing =
        document.querySelector<HTMLScriptElement>("script[data-unicorn-studio]");
      if (existing) {
        // A parallel mount is already fetching the player; ride along.
        existing.addEventListener("load", boot, { once: true });
        existing.addEventListener(
          "error",
          () => {
            if (!cancelled && attempt + 1 < MAX_SCRIPT_ATTEMPTS) {
              retryTimer = window.setTimeout(
                () => injectScript(attempt + 1),
                750 * (attempt + 1),
              );
            }
          },
          { once: true },
        );
        return;
      }
      if (!window.UnicornStudio) {
        window.UnicornStudio = { isInitialized: false };
      }
      const script = document.createElement("script");
      script.src = UNICORN_SCRIPT_SRC;
      script.async = true;
      // Never let the ambient scene contend with LCP-critical fetches.
      script.fetchPriority = "low";
      script.setAttribute("data-unicorn-studio", "true");
      const timeoutId = window.setTimeout(() => {
        script.onload = null;
        script.onerror = null;
        script.remove();
        if (!cancelled && attempt + 1 < MAX_SCRIPT_ATTEMPTS) {
          retryTimer = window.setTimeout(
            () => injectScript(attempt + 1),
            750 * (attempt + 1),
          );
        }
      }, SCRIPT_TIMEOUT_MS);
      script.onload = () => {
        window.clearTimeout(timeoutId);
        boot();
      };
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        script.remove();
        if (!cancelled && attempt + 1 < MAX_SCRIPT_ATTEMPTS) {
          retryTimer = window.setTimeout(
            () => injectScript(attempt + 1),
            750 * (attempt + 1),
          );
        }
      };
      document.head.appendChild(script);
    };

    // Defer the CDN fetch past first paint so low-end devices paint hero
    // content first and stream the scene in behind it.
    cancelIdle = runWhenIdle(() => injectScript(0));

    return () => {
      cancelled = true;
      cancelIdle?.();
      clearRetryTimer();
      observer.disconnect();
      host.innerHTML = "";
    };
  }, [useWebGL]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
      style={{ contain: "strict" }}
    >
      {/* Static gradient underlay: always painted, carries the section while
          the scene streams in or when WebGL is genuinely unavailable. */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 70% 15%, rgba(37, 99, 235, 0.22), transparent 70%), radial-gradient(ellipse 50% 40% at 15% 85%, rgba(14, 165, 233, 0.12), transparent 70%)",
        }}
      />
      {useWebGL ? (
        <div
          ref={hostRef}
          data-us-project={UNICORN_PROJECT_ID}
          className="absolute inset-0 transition-opacity duration-1000 ease-out"
          style={{ opacity: sceneReady ? 1 : 0 }}
        />
      ) : null}
      {/* Edge fade overlay (plain backgrounds only, no mask-image). */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
    </div>
  );
}
