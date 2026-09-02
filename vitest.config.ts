import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "docs", "convex/_generated"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      include: [
        "convex/**/*.ts",
      ],
      exclude: [
        "node_modules",
        "dist",
        "docs",
        "convex/_generated/**",
        "convex/convex.config.ts",
        "convex/auth.config.ts",
        "convex/schema.ts",
        "**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
