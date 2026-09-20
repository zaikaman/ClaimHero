/**
 * Boot failure reporter for the entry script (`src/main.tsx`).
 *
 * Deliberately dependency-free (no React, no stylesheets, no app imports) so
 * it always evaluates, even when the application module graph itself fails to
 * load or throws during evaluation on a particular browser. It renders boot
 * errors as plain DOM with inline styles so a dead page becomes a diagnosable
 * one, including on devices without devtools.
 */

export const BOOTSTRAPPED_FLAG = "__CLAIMHERO_BOOTED__";

function isBootstrapped(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>)[BOOTSTRAPPED_FLAG] ===
        true
    );
  } catch {
    return false;
  }
}

/** Called by `src/bootstrap.tsx` once React owns the page. */
export function notifyBootstrapped(): void {
  try {
    (window as unknown as Record<string, unknown>)[BOOTSTRAPPED_FLAG] = true;
  } catch {
    // Never block boot on a best-effort flag.
  }
}

function describeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: error.message || String(error), stack: error.stack || "" };
  }
  if (typeof error === "string") return { message: error, stack: "" };
  try {
    return { message: JSON.stringify(error) || String(error), stack: "" };
  } catch {
    return { message: String(error), stack: "" };
  }
}

function buildDiagnostics(message: string, stack: string): string {
  const lines = [
    `time: ${new Date().toISOString()}`,
    `url: ${(() => {
      try {
        return window.location.href;
      } catch {
        return "unknown";
      }
    })()}`,
    `ua: ${(() => {
      try {
        return window.navigator.userAgent;
      } catch {
        return "unknown";
      }
    })()}`,
    `error: ${message}`,
  ];
  if (stack) lines.push(`stack: ${stack}`);
  return lines.join("\n");
}

function style(el: HTMLElement, css: string): void {
  try {
    el.setAttribute("style", css);
  } catch {
    // Ignore styling failures; content still renders.
  }
}

/**
 * Replace the boot placeholder with an actionable failure card. No-ops once
 * the app has bootstrapped, and never throws.
 */
export function reportBootFailure(error: unknown): void {
  try {
    if (isBootstrapped()) return;
    if (typeof document === "undefined") return;
    const root = document.getElementById("root");
    if (!root) return;
    const { message, stack } = describeError(error);
    const diagnostics = buildDiagnostics(message, stack);

    root.innerHTML = "";

    const wrap = document.createElement("div");
    style(
      wrap,
      "min-height:100vh;display:flex;align-items:center;justify-content:center;background:#090b12;padding:16px;box-sizing:border-box;",
    );

    const card = document.createElement("div");
    style(
      card,
      "max-width:480px;width:100%;background:#11141d;border:1px solid #2a3040;border-radius:12px;padding:24px;color:#e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;",
    );

    const badge = document.createElement("div");
    style(
      badge,
      "display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#f87171;border:1px solid #7f1d1d;background:rgba(248,113,113,0.08);border-radius:4px;padding:2px 8px;margin-bottom:12px;",
    );
    badge.textContent = "ClaimHero could not start";

    const title = document.createElement("div");
    style(title, "font-size:16px;font-weight:700;margin-bottom:8px;");
    title.textContent = "Please reload the page";

    const detail = document.createElement("div");
    style(
      detail,
      "font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;color:#fca5a5;word-break:break-word;background:#090b12;border:1px solid #2a3040;border-radius:8px;padding:10px 12px;margin-bottom:12px;max-height:120px;overflow:auto;",
    );
    detail.textContent = message || "Unknown startup error.";

    const hint = document.createElement("div");
    style(hint, "font-size:12px;line-height:1.6;color:#8b93a7;margin-bottom:16px;");
    hint.textContent =
      "If reloading does not help, copy the diagnostics below and share them so the startup failure can be fixed.";

    const diag = document.createElement("textarea");
    diag.readOnly = true;
    diag.value = diagnostics;
    diag.setAttribute("aria-label", "Startup diagnostics (long-press to copy)");
    style(
      diag,
      "width:100%;box-sizing:border-box;min-height:96px;resize:vertical;background:#090b12;color:#8b93a7;border:1px solid #2a3040;border-radius:8px;padding:10px 12px;font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.5;margin-bottom:16px;",
    );

    const row = document.createElement("div");
    style(row, "display:flex;gap:8px;");

    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload";
    style(
      reload,
      "flex:1;background:#f8fafc;color:#000;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;",
    );
    reload.addEventListener("click", () => {
      try {
        window.location.reload();
      } catch {
        // Ignore reload errors in restricted contexts.
      }
    });

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    style(
      copy,
      "flex:1;background:transparent;color:#e2e8f0;border:1px solid #2a3040;border-radius:8px;padding:12px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;",
    );
    copy.addEventListener("click", () => {
      try {
        const done = () => {
          copy.textContent = "Copied";
          setTimeout(() => {
            copy.textContent = "Copy";
          }, 2000);
        };
        const clipboard = window.navigator?.clipboard;
        if (clipboard && typeof clipboard.writeText === "function") {
          void clipboard.writeText(diagnostics).then(done, () => {
            diag.focus();
            diag.select();
          });
        } else {
          diag.focus();
          diag.select();
        }
      } catch {
        try {
          diag.focus();
          diag.select();
        } catch {
          // Selection is best-effort only.
        }
      }
    });

    row.appendChild(reload);
    row.appendChild(copy);
    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(detail);
    card.appendChild(hint);
    card.appendChild(diag);
    card.appendChild(row);
    wrap.appendChild(card);
    root.appendChild(wrap);
  } catch {
    // Last resort: leave the static placeholder in place.
  }
}
