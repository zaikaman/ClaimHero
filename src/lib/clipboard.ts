import { toast } from "sonner";

/**
 * Robust, production-grade clipboard helper.
 * Handles modern navigator.clipboard with error catching and legacy fallback.
 */
export async function copyToClipboard(
  text: string,
  successMessage?: string
): Promise<boolean> {
  if (!text) {
    return false;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      if (successMessage) {
        toast.success(successMessage);
      }
      return true;
    }
  } catch (clipboardErr) {
    console.warn("navigator.clipboard failed, attempting fallback:", clipboardErr);
  }

  // Fallback for non-secure contexts or permission restrictions
  try {
    if (typeof document !== "undefined") {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        if (successMessage) {
          toast.success(successMessage);
        }
        return true;
      }
    }
  } catch (fallbackErr) {
    console.error("Clipboard copy failed completely:", fallbackErr);
  }

  toast.error("Unable to copy to clipboard. Please copy manually.");
  return false;
}
