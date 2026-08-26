/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0f17",
        foreground: "#f8fafc",
        card: {
          DEFAULT: "rgba(15, 23, 42, 0.75)",
          foreground: "#f8fafc",
          border: "rgba(30, 41, 59, 0.8)",
          hover: "rgba(30, 41, 59, 0.9)",
        },
        sentinel: {
          canvas: "#0b0f17",
          panel: "#0f172a",
          border: "#1e293b",
          cyan: "#00e5ff",
          emerald: "#10b981",
          crimson: "#f43f5e",
          amber: "#f59e0b",
          slate: "#64748b",
          light: "#94a3b8",
        },
        primary: {
          DEFAULT: "#00e5ff",
          foreground: "#0b0f17",
          glow: "rgba(0, 229, 255, 0.35)",
        },
        success: {
          DEFAULT: "#10b981",
          foreground: "#ffffff",
          glow: "rgba(16, 185, 129, 0.35)",
        },
        destructive: {
          DEFAULT: "#f43f5e",
          foreground: "#ffffff",
          glow: "rgba(244, 63, 94, 0.35)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#0b0f17",
          glow: "rgba(245, 158, 11, 0.35)",
        },
        muted: {
          DEFAULT: "#1e293b",
          foreground: "#94a3b8",
        },
        accent: {
          DEFAULT: "#1e293b",
          foreground: "#f8fafc",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "'Fira Code'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        "cyan-glow": "0 0 20px -3px rgba(0, 229, 255, 0.35)",
        "emerald-glow": "0 0 20px -3px rgba(16, 185, 129, 0.35)",
        "crimson-glow": "0 0 20px -3px rgba(244, 63, 94, 0.35)",
        "amber-glow": "0 0 20px -3px rgba(245, 158, 11, 0.35)",
        "glass-panel": "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-sweep": "radar 4s linear infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        radar: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
