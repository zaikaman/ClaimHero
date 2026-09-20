/// <reference types="vite/client" />
import "./lib/polyfills";
import { reportBootFailure } from "./lib/bootReporter";

/**
 * Boot entry. Intentionally tiny and dependency-free (the only import is the
 * dependency-free `./lib/bootReporter`) so these failure handlers are
 * installed before any application module evaluates.
 *
 * The full application (`src/bootstrap.tsx` with React, Convex, and every
 * view) loads via dynamic `import()`: if any chunk fails to download, parse,
 * or evaluate on a particular browser, the rejection is caught here and
 * rendered on-device instead of stranding the visitor on the static loading
 * placeholder forever.
 */
if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (event) => {
      reportBootFailure(
        (event as ErrorEvent).error ?? (event as ErrorEvent).message,
      );
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) => {
    reportBootFailure(
      (event as PromiseRejectionEvent).reason ??
        "Unhandled promise rejection during startup.",
    );
  });

  void import("./bootstrap").then(
    () => {
      // Bootstrap reports itself via `notifyBootstrapped()`; later errors
      // belong to the in-app ErrorBoundary, not the boot reporter.
    },
    (err: unknown) => {
      reportBootFailure(err);
    },
  );
}
