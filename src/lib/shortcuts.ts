/**
 * Central Keyboard Shortcuts Registry for ClaimHero Sentinel Console
 *
 * Defines all application-level keyboard shortcuts, keys, categories, and scopes.
 */

export interface KeyboardShortcut {
  id: string;
  label: string;
  description: string;
  keys: string[];
  category: "navigation" | "workspace" | "actions";
  scope?: "global" | "p2p";
}

export const SHORTCUTS_REGISTRY: KeyboardShortcut[] = [
  {
    id: "command-palette",
    label: "Command Palette",
    description: "Search cases, execute quick actions, and jump to workspaces",
    keys: ["⌘", "K"],
    category: "navigation",
    scope: "global",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    description: "Expand or collapse the primary navigation sidebar",
    keys: ["⌘", "B"],
    category: "navigation",
    scope: "global",
  },
  {
    id: "sentinel-copilot",
    label: "Sentinel AI Copilot",
    description: "Toggle the autonomous clinical AI assistant chat",
    keys: ["⌘", "J"],
    category: "workspace",
    scope: "global",
  },
  {
    id: "p2p-toggle-speaker",
    label: "Toggle Speaker Role",
    description: "Switch active speaker between Physician and Insurer during live call",
    keys: ["S"],
    category: "actions",
    scope: "p2p",
  },
  {
    id: "shortcuts-help",
    label: "Keyboard Shortcuts",
    description: "Display the keyboard shortcuts reference dialog",
    keys: ["?"],
    category: "navigation",
    scope: "global",
  },
];

/**
 * Utility to determine if the active element is an input, textarea, or contenteditable.
 */
export function isInputFocused(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el.getAttribute("contenteditable") === "true"
  );
}
