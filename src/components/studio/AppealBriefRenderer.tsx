import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import { Scales, ShieldCheck, FileText } from "@phosphor-icons/react";
import { safeExternalHref } from "../../lib/urlUtils";

interface AppealBriefRendererProps {
  content: string;
  isPrintMode?: boolean;
  className?: string;
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
      className={`appeal-brief-document font-sans leading-relaxed break-words min-w-0 max-w-full ${
        isPrintMode ? "space-y-2 text-[13px]" : "space-y-4 text-[13px]"
      } ${
        isPrintMode
          ? "text-slate-900 bg-white"
          : "text-foreground/90"
      } ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => (
            <div className={`pb-3 mb-4 border-b-2 [break-after:avoid] [page-break-after:avoid] ${isPrintMode ? "border-slate-900" : "border-primary/30"}`}>
              <h1 className={`text-lg sm:text-xl font-bold tracking-tight flex items-start gap-2.5 text-balance ${
                isPrintMode ? "text-slate-950" : "text-foreground"
              }`}>
                {!isPrintMode && <Scales className="size-5 text-primary shrink-0 mt-0.5" />}
                <span className="min-w-0">{children}</span>
              </h1>
            </div>
          ),
          h2: ({ children }) => (
            <div className={`${isPrintMode ? "pt-2 pb-1 mt-4" : "pt-4 pb-2 mt-5 first:mt-0"} [break-after:avoid] [page-break-after:avoid]`}>
              <h2 className={`text-sm sm:text-[15px] font-bold tracking-tight flex items-start gap-2 text-balance ${
                isPrintMode ? "text-slate-950 border-b border-slate-300 pb-1.5" : "text-foreground"
              }`}>
                {!isPrintMode && (
                  <span className="mt-[7px] size-1.5 rounded-full bg-primary shrink-0" />
                )}
                <span className="min-w-0 border-b border-transparent">{children}</span>
              </h2>
            </div>
          ),
          h3: ({ children }) => (
            <h3 className={`text-[13px] font-semibold mt-4 mb-1.5 [break-after:avoid] [page-break-after:avoid] text-balance ${
              isPrintMode ? "text-slate-800 uppercase tracking-wide text-xs" : "text-foreground/95"
            }`}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className={`text-xs font-semibold mt-3 mb-1 uppercase tracking-wider [break-after:avoid] ${
              isPrintMode ? "text-slate-700" : "text-muted-foreground"
            }`}>
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className={`${isPrintMode ? "mb-2" : "mb-3"} leading-[1.75] text-pretty ${
              isPrintMode ? "text-slate-800 text-[12.5px]" : "text-foreground/85"
            }`}>
              {children}
            </p>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={`${isPrintMode ? "my-2 p-2.5" : "my-4 p-4"} rounded-lg border-l-4 font-sans transition-colors [break-inside:avoid] [page-break-inside:avoid] min-w-0 max-w-full ${
                isPrintMode
                  ? "border-slate-700 bg-slate-100 text-slate-800 text-[12px]"
                  : "border-primary/70 bg-primary/[0.06] text-foreground/90 shadow-sm"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {!isPrintMode && (
                  <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1.5 min-w-0 leading-relaxed [&>p]:mb-1.5 [&>p:last-child]:mb-0">
                  {children}
                </div>
              </div>
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className={`list-disc pl-5 ${isPrintMode ? "my-1.5 space-y-1" : "my-3 space-y-1.5"} ${
              isPrintMode ? "text-slate-800" : "text-foreground/85"
            } marker:text-muted-foreground`}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={`list-decimal pl-5 ${isPrintMode ? "my-1.5 space-y-1" : "my-3 space-y-1.5"} ${
              isPrintMode ? "text-slate-800" : "text-foreground/85"
            } marker:font-semibold marker:text-foreground/70`}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-[1.7] pl-1">{children}</li>
          ),
          hr: () => (
            <hr className={`my-5 ${isPrintMode ? "border-slate-300" : "border-border"}`} />
          ),
          code: ({ children, inline, className: codeClassName }: { children?: React.ReactNode; inline?: boolean; className?: string }) => {
            const isCodeBlock = !inline && codeClassName;
            if (isCodeBlock) {
              return (
                <pre className={`p-3.5 rounded-lg font-mono text-[11.5px] leading-relaxed overflow-x-auto max-w-full my-3 whitespace-pre ${
                  isPrintMode ? "bg-slate-100 text-slate-900 border border-slate-300" : "bg-muted/60 text-foreground border border-border"
                }`}>
                  <code className="break-normal">{children}</code>
                </pre>
              );
            }
            return (
              <code className={`font-mono text-[11px] px-1.5 py-0.5 rounded border font-medium break-words ${
                isPrintMode
                  ? "bg-slate-100 border-slate-300 text-slate-900"
                  : "bg-muted/80 border-border text-foreground/95"
              }`}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className={`not-prose my-4 overflow-x-auto rounded-xl border shadow-xs ${isPrintMode ? "border-slate-300" : "border-border/80"}`}>
              <table className={`w-full min-w-[540px] border-collapse text-left ${
                isPrintMode ? "text-slate-900" : "text-foreground"
              }`}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className={isPrintMode ? "bg-slate-100 border-b border-slate-300" : "bg-muted/70 border-b border-border"}>
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className={`divide-y ${isPrintMode ? "divide-slate-200" : "divide-border/60"} [&>tr:last-child]:border-b-0`}>
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className={isPrintMode ? "odd:bg-white even:bg-slate-50" : "odd:bg-transparent even:bg-muted/30 hover:bg-muted/40 transition-colors"}>
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-[10.5px] uppercase tracking-wider whitespace-nowrap text-left align-top first:w-[34%]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 text-[12.5px] leading-relaxed align-top break-words first:font-semibold first:whitespace-nowrap">
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
            if (!safeHref) return <span className="break-words">{children}</span>;

            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`break-all ${
                  isPrintMode
                    ? "font-medium text-blue-800 underline decoration-1 underline-offset-2 hover:text-blue-950"
                    : "font-medium text-primary underline decoration-primary/40 decoration-1 underline-offset-2 hover:text-primary/80"
                }`}
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
