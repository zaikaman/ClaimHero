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

/**
 * Decide whether this device should run the full-viewport Unicorn Studio
 * WebGL scene.
 *
 * Mobile Safari is the reason this gate exists: a fixed, full-viewport WebGL
 * canvas combined with mask-image compositing can paint as an opaque black
 * plane over the landing content (or exhaust the mobile GPU entirely),
 * leaving visitors with a blank black page. Touch-first viewports, small
 * screens, reduced-motion preferences, and data-saver mode all receive the
 * static CSS gradient backdrop instead, which is GPU-cheap and cannot cover
 * content.
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
    const connection = (
      navigator as unknown as { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return false;
    const matchMediaFn = window.matchMedia;
    if (typeof matchMediaFn !== "function") return false;
    if (
      matchMediaFn.call(window, "(prefers-reduced-motion: reduce)").matches
    ) {
      return false;
    }
    if (!matchMediaFn.call(window, "(pointer: fine)").matches) return false;
    if (!matchMediaFn.call(window, "(min-width: 768px)").matches) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared backdrop for the public surface (landing + login).
 *
 * Capable desktops get the Unicorn Studio WebGL scene; every other device
 * gets a static gradient that is always painted underneath, so the section
 * never depends on the 3D CDN or a mobile GPU to look intentional.
 *
 * Stacking is deliberately flat: an `absolute inset-0 z-0` layer inside the
 * relatively-positioned, isolated PublicExperience root. No `position: fixed`,
 * no negative z-index children, and no `mask-image` on the container (masks
 * over WebGL children are a known iOS Safari compositing hazard). Edge fades
 * are plain background overlays, which composite safely everywhere.
 */
export function UnicornBackground() {
  const [useWebGL] = useState<boolean>(() => shouldUseWebGLBackground());
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!useWebGL) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

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

    if (window.UnicornStudio?.isInitialized) {
      boot();
    } else {
      const existing =
        document.querySelector<HTMLScriptElement>("script[data-unicorn-studio]");
      if (existing) {
        existing.addEventListener("load", boot, { once: true });
      } else {
        if (!window.UnicornStudio) {
          window.UnicornStudio = { isInitialized: false };
        }
        const script = document.createElement("script");
        script.src = UNICORN_SCRIPT_SRC;
        script.async = true;
        script.setAttribute("data-unicorn-studio", "true");
        script.onload = () => {
          if (!window.UnicornStudio?.isInitialized) {
            boot();
          }
        };
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [useWebGL]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
    >
      {/* Static gradient underlay: always painted, carries the section when
          WebGL is gated off or the 3D CDN is unreachable. */}
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
          className="absolute inset-0"
        />
      ) : null}
      {/* Edge fade overlay (plain backgrounds only, no mask-image). */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
    </div>
  );
}
