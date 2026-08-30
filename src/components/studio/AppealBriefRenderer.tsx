import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Scales, ShieldCheck, FileText } from "@phosphor-icons/react";

interface AppealBriefRendererProps {
  content: string;
  isPrintMode?: boolean;
  className?: string;
}

function safeExternalHref(href?: string): string | undefined {
  if (!href) return undefined;

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const AppealBriefRenderer: React.FC<AppealBriefRendererProps> = ({
  content,
  isPrintMode = false,
  className = "",
}) => {
  if (!content || !content.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FileText className="size-8 opacity-40 mb-2" />
        <p className="text-xs italic">No brief drafted yet.</p>
      </div>
    );
  }

  return (
    <div
      className={`appeal-brief-document font-sans text-xs leading-relaxed ${
        isPrintMode ? "space-y-2" : "space-y-4"
      } ${
        isPrintMode
          ? "text-slate-900 bg-white"
          : "text-foreground/90"
      } ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => (
            <div className={`pb-2 mb-3 border-b-2 ${isPrintMode ? "border-slate-900" : "border-border"}`}>
              <h1 className={`text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 ${
                isPrintMode ? "text-slate-950" : "text-foreground"
              }`}>
                {!isPrintMode && <Scales className="size-4.5 text-primary shrink-0" />}
                <span>{children}</span>
              </h1>
            </div>
          ),
          h2: ({ children }) => (
            <div className={isPrintMode ? "pt-2 pb-1 mt-3" : "pt-3 pb-1.5 mt-4"}>
              <h2 className={`text-xs sm:text-sm font-bold tracking-wide flex items-center gap-2 ${
                isPrintMode ? "text-slate-950 border-b border-slate-300 pb-1" : "text-foreground/95"
              }`}>
                {!isPrintMode && (
                  <span className="size-1.5 rounded-full bg-primary/80 shrink-0" />
                )}
                <span>{children}</span>
              </h2>
            </div>
          ),
          h3: ({ children }) => (
            <h3 className={`text-xs font-semibold mt-3 mb-1 ${
              isPrintMode ? "text-slate-800" : "text-foreground/90"
            }`}>
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className={`${isPrintMode ? "mb-2" : "mb-3"} leading-relaxed ${
              isPrintMode ? "text-slate-800 text-[11.5px]" : "text-foreground/85"
            }`}>
              {children}
            </p>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={`${isPrintMode ? "my-2 p-2" : "my-3 p-3"} rounded-lg border-l-4 font-sans transition-colors ${
                isPrintMode
                  ? "border-slate-700 bg-slate-100 text-slate-800 text-[11px]"
                  : "border-primary/70 bg-muted/40 text-foreground/90 shadow-sm"
              }`}
            >
              <div className="flex items-start gap-2">
                {!isPrintMode && (
                  <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1 [&>p]:mb-1 [&>p:last-child]:mb-0">
                  {children}
                </div>
              </div>
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className={`list-disc pl-5 ${isPrintMode ? "my-1 space-y-0.5" : "my-2 space-y-1"} ${
              isPrintMode ? "text-slate-800" : "text-foreground/85"
            }`}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={`list-decimal pl-5 ${isPrintMode ? "my-1 space-y-0.5" : "my-2 space-y-1.5"} ${
              isPrintMode ? "text-slate-800" : "text-foreground/85"
            }`}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">{children}</li>
          ),
          hr: () => (
            <hr className={`my-4 ${isPrintMode ? "border-slate-300" : "border-border"}`} />
          ),
          code: ({ children, inline, className: codeClassName }: any) => {
            const isCodeBlock = !inline && codeClassName;
            if (isCodeBlock) {
              return (
                <pre className={`p-3 rounded-lg font-mono text-[11px] overflow-x-auto my-2.5 ${
                  isPrintMode ? "bg-slate-100 text-slate-900 border border-slate-300" : "bg-muted/60 text-foreground border border-border"
                }`}>
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className={`font-mono text-[11px] px-1.5 py-0.5 rounded border font-medium ${
                isPrintMode
                  ? "bg-slate-100 border-slate-300 text-slate-900"
                  : "bg-muted/80 border-border text-foreground/95"
              }`}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-border">
              <table className={`w-full text-left text-xs border-collapse ${
                isPrintMode ? "text-slate-900" : "text-foreground"
              }`}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className={isPrintMode ? "bg-slate-100 border-b border-slate-300" : "bg-muted/60 border-b border-border"}>
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/60">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className={isPrintMode ? "hover:bg-slate-50" : "hover:bg-muted/30"}>
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="p-2.5 font-semibold text-[11px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="p-2.5 text-[11px]">
              {children}
            </td>
          ),
          strong: ({ children }) => (
            <strong className={`font-semibold ${
              isPrintMode ? "text-slate-950" : "text-foreground font-bold"
            }`}>
              {children}
            </strong>
          ),
          a: ({ href, children }) => {
            const safeHref = safeExternalHref(href);
            if (!safeHref) return <span>{children}</span>;

            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className={isPrintMode
                  ? "font-medium text-blue-800 underline decoration-1 underline-offset-2 hover:text-blue-950"
                  : "font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary/80"}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
