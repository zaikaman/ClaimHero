import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  optimizeDeps: {
    include: ["three", "@react-three/fiber"],
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("node_modules/@react-three")) {
            return "three-bundle";
          }
          // OCR pipeline (pdfjs-dist + tesseract.js) is loaded on demand via
          // dynamic import: keep it in its own async chunk so it never ships
          // or evaluates in the boot-critical graph.
          if (id.includes("node_modules/pdfjs-dist") || id.includes("node_modules/tesseract")) {
            return "ocr-bundle";
          }
          // Third-party vendor code otherwise collapses into one shared chunk
          // so mobile clients fetch a handful of files instead of dozens of
          // per-module chunks (fewer requests, fewer failure points).
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
});
