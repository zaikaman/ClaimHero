/**
 * Global Polyfills for Cross-Browser Compatibility
 *
 * Specifically handles ECMAScript Iterator Helper specification gaps in older
 * browser engines (e.g. Safari < 18.2, Mobile Safari iOS 16/17/18.0/18.1).
 *
 * Modern libraries such as `pdfjs-dist` check `typeof Iterator.prototype.join`
 * at module evaluation. In engines where the global `Iterator` constructor is
 * not yet bound to `globalThis`, direct property evaluation on the identifier
 * throws `ReferenceError: Can't find variable: Iterator`.
 */
export function installGlobalPolyfills(): void {
  try {
    const root =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : typeof self !== "undefined"
            ? self
            : undefined;

    if (root && typeof (root as { Iterator?: unknown }).Iterator === "undefined") {
      const IteratorPrototype =
        typeof Symbol !== "undefined" &&
        Symbol.iterator &&
        typeof [][Symbol.iterator] === "function"
          ? Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
          : {};

      function Iterator() {}
      Iterator.prototype = IteratorPrototype;
      (root as Record<string, unknown>).Iterator = Iterator;
    }
  } catch {
    // Fail-safe: polyfill initialization must never block boot
  }
}

installGlobalPolyfills();
