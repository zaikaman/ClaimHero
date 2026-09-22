import React from "react";

/**
 * Static gradient stand-in for the Silk WebGL backdrop.
 *
 * Deliberately kept in its own module with zero WebGL/three.js imports so it
 * can be bundled into the boot-critical graph: it paints instantly as the
 * Suspense fallback while the `three-bundle` chunk streams in, carries the
 * section if WebGL context creation fails, and serves as the error-boundary
 * fallback so the ambient background can never render blank or crash the app.
 */
export const SILK_FALLBACK_STYLE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(ellipse 60% 50% at 70% 20%, rgba(89, 103, 123, 0.35), transparent 70%), radial-gradient(ellipse 50% 40% at 15% 85%, rgba(89, 103, 123, 0.18), transparent 70%)",
};

export const SilkFallback: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden="true"
    className={className}
    style={{ width: "100%", height: "100%", ...SILK_FALLBACK_STYLE }}
  />
);

export default SilkFallback;
