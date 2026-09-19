import { useEffect, useRef } from "react";

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
 * Fixed WebGL background from the approved template: a Unicorn Studio scene
 * pinned behind the public surface with a bottom alpha fade. Mounted once at
 * the PublicExperience root so landing and login share a single WebGL
 * instance. The ambient video stays beneath as a fallback if the 3D CDN is
 * unreachable. The player script is injected once at runtime (never bundled),
 * and the canvas is torn down when the public surface unmounts so entering
 * the console stops the render loop.
 */
export function UnicornBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    const boot = () => {
      if (cancelled || !host.isConnected) return;
      try {
        window.UnicornStudio?.init?.();
      } catch {
        // Player failed to boot; hero gradient still carries the section.
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
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 w-full h-screen z-[1] pointer-events-none"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent, black 0%, black 80%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 0%, black 80%, transparent)",
      }}
    >
      <div
        ref={hostRef}
        data-us-project={UNICORN_PROJECT_ID}
        className="absolute w-full h-full left-0 top-0 -z-10"
      />
    </div>
  );
}
