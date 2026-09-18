export interface AppealEmailContext {
  claimNumber: string;
  payer: string;
  patientName?: string;
  serviceDate?: string;
  deniedAmount?: number;
  denialReason?: string;
  cptCodes?: string[];
  providerName?: string;
}

export interface FormattedEmail {
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripHtmlTags(value: string): string {
  if (!value) return "";
  return value
    // Remove script and style blocks and their contents completely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Remove iframe, object, embed blocks and their contents completely
    .replace(/<(?:iframe|object|embed)\b[^<]*(?:(?!<\/(?:iframe|object|embed)>)<[^<]*)*<\/(?:iframe|object|embed)>/gi, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove DOCTYPE / XML processing instructions
    .replace(/<![^>]*>/g, "")
    .replace(/<\?[^>]*\?>/g, "")
    // Strip HTML tags (<tag ...> or </tag>)
    .replace(/<(?:\/|\s+)?[a-zA-Z][^>]*>/g, "")
    // Defang markdown links [label](url) -> label to eliminate injected phishing destinations
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

export function sanitizeAlertText(value: string): string {
  return stripHtmlTags(value);
}

export function sanitizeAndEscapeHtml(
  value: string,
  options?: { preserveNewlines?: boolean }
): string {
  if (!value) return "";
  const stripped = stripHtmlTags(value);
  const escaped = escapeHtml(stripped);
  if (options?.preserveNewlines) {
    return escaped.replace(/\r\n|\n|\r/g, "<br />");
  }
  return escaped;
}


function cleanInlineText(value: string): string {
  return value
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function safeLinkHref(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function inlineHtml(value: string): string {
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let html = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(value)) !== null) {
    html += escapeHtml(cleanInlineText(value.slice(lastIndex, match.index)));
    const label = escapeHtml(cleanInlineText(match[1] || ""));
    const href = safeLinkHref(match[2] || "");
    html += href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#1f6d9c; text-decoration:underline; text-underline-offset:2px;">${label}</a>`
      : label;
    lastIndex = match.index + match[0].length;
  }

  return html + escapeHtml(cleanInlineText(value.slice(lastIndex)));
}

function inlineText(value: string): string {
  return cleanInlineText(value);
}

function formatServiceDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return value;
}

function normalizeDenialReason(value?: string): string | undefined {
  if (!value) return undefined;

  return value
    .replace(/these are non-covered services because this is not deemed a medical necessity by the payer/i, "Service denied as not medically necessary")
    .replace(/[.?!]+$/, "")
    .trim();
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(inlineText);
}

function isHeading(line: string): boolean {
  return /^#{1,3}\s+/.test(line.trim());
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:-{3,}|_{3,})\s*$/.test(line);
}

function isBlockquote(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function listMatch(line: string): RegExpMatchArray | null {
  return line.match(/^\s*(-|\d+[.)])\s+(.+)$/);
}

function isStructuralLine(line: string): boolean {
  return (
    isHeading(line) ||
    isHorizontalRule(line) ||
    isBlockquote(line) ||
    Boolean(listMatch(line)) ||
    isTableRow(line)
  );
}

function renderTable(lines: string[]): { html: string; text: string } {
  const header = splitTableRow(lines[0] || "");
  const rows = lines.slice(2).map(splitTableRow);
  const htmlHeader = header.map((cell) => `<th style="padding:10px 14px; text-align:left; background-color:#f1f5f9; border-bottom:1px solid #e2e8f0; color:#475569; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;">${inlineHtml(cell)}</th>`).join("");
  const htmlRows = rows.map((row) => `<tr>${header.map((_, index) => `<td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #f1f5f9; color:#1e293b; font-size:13px; line-height:1.55;">${inlineHtml(row[index] || "")}</td>`).join("")}</tr>`).join("");
  const text = rows
    .map((row) => header.map((label, index) => `${label}: ${row[index] || ""}`).join("\n"))
    .join("\n\n");

  return {
    html: `<div style="overflow-x:auto; margin:20px 0;"><table role="presentation" style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">${`<thead><tr>${htmlHeader}</tr></thead>`}<tbody>${htmlRows}</tbody></table></div>`,
    text,
  };
}

function renderMarkdown(markdown: string): { html: string; text: string } {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const htmlBlocks: string[] = [];
  const textBlocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] || "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1] || "")) {
      const tableLines = [line, lines[index + 1] || ""];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] || "")) {
        tableLines.push(lines[index] || "");
        index += 1;
      }
      const table = renderTable(tableLines);
      htmlBlocks.push(table.html);
      if (table.text) textBlocks.push(table.text);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = inlineHtml(headingMatch[2]);
      const textHeading = inlineText(headingMatch[2]);
      const styles = level === 1
        ? "margin:28px 0 12px; color:#0f172a; font-size:22px; line-height:1.3; font-weight:700; letter-spacing:-0.02em; page-break-after:avoid; break-after:avoid;"
        : level === 2
        ? "margin:26px 0 10px; padding-bottom:6px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:16px; line-height:1.35; font-weight:700; page-break-after:avoid; break-after:avoid;"
        : "margin:20px 0 8px; color:#334155; font-size:14px; line-height:1.4; font-weight:700; page-break-after:avoid; break-after:avoid;";
      htmlBlocks.push(`<h${level} style="${styles}">${heading}</h${level}>`);
      textBlocks.push(textHeading);
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      htmlBlocks.push(`<hr style="margin:24px 0; border:0; border-top:1px solid #e2e8f0;" />`);
      index += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquote(lines[index] || "")) {
        quoteLines.push((lines[index] || "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      const quoteText = quoteLines.map(inlineText).join("\n");
      const quoteHtml = quoteLines.map(inlineHtml).join("<br />");
      htmlBlocks.push(`<blockquote style="margin:18px 0; padding:12px 18px; border-left:3px solid #0284c7; background:#f8fafc; color:#1e293b; font-size:13px; line-height:1.6; border-radius:0 6px 6px 0; page-break-inside:avoid; break-inside:avoid;">${quoteHtml}</blockquote>`);
      textBlocks.push(`Quote: ${quoteText}`);
      continue;
    }

    const firstListItem = listMatch(line);
    if (firstListItem) {
      const ordered = /^\d/.test(firstListItem[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = listMatch(lines[index] || "");
        if (!match || (/^\d/.test(match[1]) !== ordered)) break;
        items.push(match[2]);
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      const listStyle = ordered ? "list-style-type:decimal;" : "list-style-type:disc;";
      htmlBlocks.push(`<${tag} style="margin:12px 0 18px; padding-left:24px; color:#334155; font-size:13px; line-height:1.6; ${listStyle}">${items.map((item) => `<li style="padding:2px 0;">${inlineHtml(item)}</li>`).join("")}</${tag}>`);
      textBlocks.push(items.map((item, itemIndex) => `${ordered ? `${itemIndex + 1}.` : "-"} ${inlineText(item)}`).join("\n"));
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index] || "";
      if (!paragraphLine.trim() || (paragraphLines.length > 0 && isStructuralLine(paragraphLine))) break;
      paragraphLines.push(paragraphLine.trim());
      index += 1;
    }
    const paragraphText = paragraphLines.map(inlineText).join("\n");
    const paragraphHtml = paragraphLines.map(inlineHtml).join("<br />");
    htmlBlocks.push(`<p style="margin:0 0 14px; color:#334155; font-size:13px; line-height:1.7;">${paragraphHtml}</p>`);
    textBlocks.push(paragraphText);
  }

  return {
    html: htmlBlocks.join("\n"),
    text: textBlocks.join("\n\n").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").trim(),
  };
}

function stripLeadingTitle(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0 || !/^#\s+/.test(lines[firstContentIndex]?.trim() || "")) {
    return markdown;
  }

  return lines.slice(0, firstContentIndex).concat(lines.slice(firstContentIndex + 1)).join("\n");
}

function displayValue(value: string | undefined): string {
  return escapeHtml(inlineText(value || "Not provided"));
}

function moneyValue(value: number | undefined): string | undefined {
  return typeof value === "number" ? `$${value.toLocaleString("en-US")}` : undefined;
}

function buildSummaryRows(context: AppealEmailContext): Array<[string, string]> {
  const denialReason = context.denialReason;
  const rawClaimNumber = context.claimNumber?.trim();
  const claimRef = rawClaimNumber && rawClaimNumber !== "Not specified" ? rawClaimNumber : undefined;
  const rows: Array<[string, string | undefined]> = [
    ["Claim reference", claimRef],
    ["Patient", context.patientName],
    ["Date of service", formatServiceDate(context.serviceDate)],
    ["Procedure codes", context.cptCodes?.filter(Boolean).length ? context.cptCodes.filter(Boolean).join(", ") : undefined],
    ["Disputed amount", moneyValue(context.deniedAmount)],
    ["Denial reason", normalizeDenialReason(denialReason)],
  ];
  return rows.reduce<Array<[string, string]>>((result, [label, value]) => {
    const cleanedValue = value ? inlineText(value) : "";
    if (cleanedValue) result.push([label, cleanedValue]);
    return result;
  }, []);
}

function buildHeader(context: AppealEmailContext, title: string): { html: string; text: string } {
  const payer = displayValue(context.payer);
  const rawClaimNumber = context.claimNumber?.trim();
  const hasClaimNumber = Boolean(rawClaimNumber && rawClaimNumber !== "Not specified");
  const claimSubtitle = hasClaimNumber ? `Claim #${displayValue(rawClaimNumber)}` : "Unspecified Claim Reference";
  const claimSubtitleText = hasClaimNumber ? `Claim #${inlineText(rawClaimNumber)}` : "Unspecified Claim Reference";
  const summaryRows = buildSummaryRows(context);
  const htmlSummary = summaryRows.map(([label, value]) => `<tr><td style="padding:8px 14px; color:#64748b; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #f1f5f9; width:35%;">${escapeHtml(label)}</td><td style="padding:8px 14px; color:#0f172a; font-size:12px; font-weight:600; border-bottom:1px solid #f1f5f9;">${displayValue(value)}</td></tr>`).join("");
  const textSummary = summaryRows.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    html: `<div style="padding-bottom:18px; border-bottom:2px solid #0284c7; margin-bottom:24px;"><div style="color:#0284c7; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;">ClaimHero Appeals Desk</div><h1 style="margin:8px 0 6px; color:#0f172a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:22px; line-height:1.3; font-weight:700; letter-spacing:-0.02em;">${escapeHtml(title)}</h1><div style="color:#475569; font-size:13px; font-weight:500;">${payer} · ${claimSubtitle}</div></div><div style="margin:20px 0 28px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;"><table role="presentation" style="width:100%; border-collapse:collapse;">${htmlSummary}</table></div>`,
    text: `CLAIMHERO APPEALS DESK\n${title}\n${inlineText(context.payer)} · ${claimSubtitleText}\n\n${textSummary}`,
  };
}

function buildEmailDocument(
  context: AppealEmailContext,
  title: string,
  markdown: string,
  footer: string
): FormattedEmail {
  const header = buildHeader(context, title);
  const content = renderMarkdown(stripLeadingTitle(markdown));
  const safeFooter = escapeHtml(footer);

  return {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <center style="width:100%;table-layout:fixed;background-color:#f8fafc;">
    <table role="presentation" aria-hidden="true" width="100%" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100% !important;max-width:100%;margin:0 auto;border-collapse:collapse;background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:36px 16px;text-align:center;background-color:#f8fafc;vertical-align:top;">
          <div style="max-width:720px;margin:0 auto;text-align:left;">
            <table role="presentation" aria-hidden="true" width="100%" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100%;max-width:720px;margin:0 auto;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px -2px rgba(15,23,42,0.06);text-align:left;">
              <tr>
                <td style="padding:40px 36px 36px 36px;text-align:left;">
                  ${header.html}
                  <main>${content.html}</main>
                  <div style="margin-top:36px;padding-top:18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.6;text-align:left;">
                    ${safeFooter}
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`,
    text: `${header.text}\n\n${content.text}\n\n${footer}`.trim(),
  };
}

export function formatAppealEmail(markdown: string, context: AppealEmailContext): FormattedEmail {
  return buildEmailDocument(
    context,
    "Appeal of Adverse Benefit Determination",
    markdown,
    `[ClaimHero #${context.claimNumber}] Please reference the claim number above in any reply or request for additional information.`
  );
}

export function formatCorrespondenceEmail(
  markdown: string,
  context: AppealEmailContext,
  title = "Appeal Correspondence"
): FormattedEmail {
  return buildEmailDocument(
    context,
    title,
    markdown,
    `[ClaimHero #${context.claimNumber}] Please reference the claim number above in any reply or additional submission.`
  );
}

export interface PayerResponseAlertContext {
  claimNumber: string;
  payer: string;
  patientName?: string;
  determinationHeadline: string;
  clinicalRationale: string;
  autoPilotEnabled?: boolean;
  appSiteUrl?: string;
}

/**
 * Formats a secure, production-grade inbound payer response alert email.
 * Strips all HTML tags and script/style/iframe payloads from untrusted inputs
 * (such as LLM clinicalRationale and payer headlines) and strictly HTML-escapes
 * all interpolated variables to guarantee immunity against HTML injection,
 * malicious link phishing, and CRLF subject injection.
 */
export function formatPayerResponseAlertEmail(
  context: PayerResponseAlertContext
): FormattedEmail & { subject: string } {
  const safePayerText = stripHtmlTags(context.payer || "Health Insurer").replace(/[\r\n]+/g, " ").trim();
  const safePayerHtml = escapeHtml(safePayerText);

  const safeClaimNumberText = stripHtmlTags(context.claimNumber || "").replace(/[\r\n]+/g, " ").trim();
  const safeClaimNumberHtml = escapeHtml(safeClaimNumberText);

  const safePatientText = stripHtmlTags(context.patientName || "Patient").replace(/[\r\n]+/g, " ").trim();

  const safeHeadlineText = stripHtmlTags(context.determinationHeadline || "New Inbound Correspondence Received").replace(/[\r\n]+/g, " ").trim();
  const safeHeadlineHtml = escapeHtml(safeHeadlineText);

  const safeRationaleText = stripHtmlTags(context.clinicalRationale || "");
  const safeRationaleHtml = sanitizeAndEscapeHtml(context.clinicalRationale || "", { preserveNewlines: true });

  const rawUrl = (context.appSiteUrl || process.env.SITE_URL || "").trim();
  if (!rawUrl) {
    throw new Error(
      "SITE_URL environment variable is unset. Please configure SITE_URL (e.g. https://<deployment>.convex.site or http://localhost:5173) to generate alert email action links."
    );
  }
  const cleanRawUrl = rawUrl.replace(/\/$/, "");
  const safeUrl = safeLinkHref(cleanRawUrl);
  if (!safeUrl) {
    throw new Error(
      `Invalid SITE_URL: "${rawUrl}". Expected a valid http(s) URL.`
    );
  }
  const normalizedSafeUrl = safeUrl.replace(/\/$/, "");

  const subject = `[ClaimHero Alert] Payer Response: Claim #${safeClaimNumberText} (${safeHeadlineText})`;

  const text = `Hello,\n\nA new response has been received from ${safePayerText} regarding Claim #${safeClaimNumberText} (${safePatientText}).\n\nDetermination: ${safeHeadlineText}\nSummary: ${safeRationaleText}\n\nMandatory Human Review: ClaimHero AI has classified this response and prepared a cited rebuttal draft. In accordance with clinical safety protocols, a human must approve every clinical assertion, legal assertion, recipient, and outbound message before dispatch.\n\nPlease log in to ClaimHero to review and approve this communication.\n\nReview Claim Docket: ${normalizedSafeUrl}/app/inbox\n\nClaimHero Sentinel System`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClaimHero Alert: Payer Determination Received</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <center style="width:100%;table-layout:fixed;background-color:#f8fafc;">
    <table role="presentation" aria-hidden="true" width="100%" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100% !important;max-width:100%;margin:0 auto;border-collapse:collapse;background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:40px 16px;text-align:center;background-color:#f8fafc;vertical-align:top;">
          <div style="max-width:600px;margin:0 auto;text-align:left;">
            <table role="presentation" aria-hidden="true" width="100%" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px -2px rgba(15,23,42,0.06);text-align:left;">
              
              <!-- Header Bar -->
              <tr>
                <td style="padding:24px 32px;border-bottom:1px solid #f1f5f9;background-color:#ffffff;text-align:left;">
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                      <td align="left" style="vertical-align:middle;text-align:left;">
                        <div style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;display:inline-block;">
                          Claim<span style="color:#0284c7;">Hero</span>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;text-align:right;">
                        <span style="font-size:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.08em;background-color:#eff6ff;color:#1d4ed8;padding:4px 10px;border-radius:9999px;border:1px solid #dbeafe;font-weight:700;">
                          Sentinel Alert
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Main Body -->
              <tr>
                <td style="padding:32px 32px 28px 32px;text-align:left;">
                  <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;text-align:left;">
                    Inbound Determination Received
                  </h1>
                  <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#475569;text-align:left;">
                    A new inbound response was received from <strong style="color:#0f172a;">${safePayerHtml}</strong> for <strong style="color:#0f172a;">Claim #${safeClaimNumberHtml}</strong>.
                  </p>

                  <!-- Determination Card -->
                  <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:8px;padding:18px 20px;margin:20px 0;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;font-weight:700;margin-bottom:6px;">
                      Payer Determination
                    </div>
                    <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;line-height:1.4;">
                      ${safeHeadlineHtml}
                    </div>
                    <div style="font-size:13px;color:#334155;line-height:1.6;">
                      ${safeRationaleHtml}
                    </div>
                  </div>

                  <!-- Mandatory Review Gate -->
                  <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:8px;padding:14px 18px;margin:20px 0;">
                    <p style="margin:0;font-size:12px;color:#1e3a8a;line-height:1.6;">
                      <strong style="color:#1d4ed8;">Mandatory Human Review Gate:</strong> ClaimHero AI has prepared and cited a recommended rebuttal. In accordance with clinical safety protocols, a human must approve every clinical assertion, legal assertion, recipient, and outbound message before dispatch.
                    </p>
                  </div>

                  <!-- CTA Button -->
                  <div style="margin:28px 0 16px 0;">
                    <a href="${escapeHtml(normalizedSafeUrl)}/app/inbox" style="display:inline-block;background-color:#0284c7;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.01em;box-shadow:0 1px 3px 0 rgba(0,0,0,0.1),0 1px 2px 0 rgba(0,0,0,0.06);">
                      Review &amp; Approve in ClaimHero
                    </a>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">
                    ClaimHero AI Appeal Sentinel &bull; Precision Healthcare Denial Intelligence
                  </p>
                </td>
              </tr>

            </table>
          </div>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;

  return {
    subject,
    text,
    html,
  };
}

