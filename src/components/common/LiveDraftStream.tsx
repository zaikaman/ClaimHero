import { CircleNotch } from "@phosphor-icons/react";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";
import { readStreamingStringField } from "../../lib/streamingJson";

export interface DraftStreamField {
  /** JSON field name in the drafting action's structured contract. */
  key: string;
  label: string;
}

interface LiveDraftStreamProps {
  /** Whether a generation is currently in flight. */
  isActive: boolean;
  /** True while the model is still writing (drives the caret and spinner). */
  isStreaming: boolean;
  /** Raw streamed model output for the drafting thread. */
  streamedText: string;
  /** Prose sections to surface as they arrive. */
  fields: DraftStreamField[];
  label: string;
  /** Shown between submission and the first token. */
  waitingMessage: string;
  className?: string;
}

/**
 * Live preview of a long-form generation streaming through the agent component.
 *
 * Drafting streams the model's structured JSON, so the readable prose sections
 * are read out of the partial document as they arrive. The authoritative text
 * always comes from the persisted document that replaces this panel once the
 * generation completes. Deliberately not an ARIA live region: content changes
 * on every token, and the finished document is the artifact worth announcing.
 */
export function LiveDraftStream({
  isActive,
  isStreaming,
  streamedText,
  fields,
  label,
  waitingMessage,
  className,
}: LiveDraftStreamProps) {
  if (!isActive) return null;

  const sections = fields
    .map((field) => ({
      ...field,
      value: readStreamingStringField(streamedText, field.key),
    }))
    .filter((section) => section.value.trim().length > 0);

  return (
    <Card
      className={cn(
        "p-3.5 rounded-xl border-border/80 bg-card/70 backdrop-blur-xl shadow-xs animate-fadeIn",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CircleNotch
            className={cn("size-3.5 shrink-0 text-primary", isStreaming && "animate-spin")}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-foreground truncate">{label}</span>
        </div>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
          {streamedText.length.toLocaleString()} chars
        </span>
      </div>

      <div
        className="mt-2.5 max-h-64 overflow-hidden space-y-2.5 [mask-image:linear-gradient(to_bottom,black_78%,transparent)]"
        aria-busy={isStreaming}
      >
        {sections.length === 0 ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">{waitingMessage}</p>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="space-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </span>
              <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                {section.value}
                {isStreaming && section.key === sections[sections.length - 1].key && (
                  <span
                    className="inline-block w-px h-3 ml-0.5 align-middle bg-primary animate-pulse"
                    aria-hidden="true"
                  />
                )}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
