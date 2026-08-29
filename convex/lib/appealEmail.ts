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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanInlineText(value: string): string {
  return value
    .replace(/\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function inlineHtml(value: string): string {
  return escapeHtml(cleanInlineText(value));
}

function inlineText(value: string): string {
  return cleanInlineText(value);
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
    (isTableRow(line) && isTableSeparator(line))
  );
}

function renderTable(lines: string[]): { html: string; text: string } {
  const header = splitTableRow(lines[0] || "");
  const rows = lines.slice(2).map(splitTableRow);
  const htmlHeader = header.map((cell) => `<th style="padding:10px 12px; text-align:left; border-bottom:1px solid #dbe3ea; color:#526273; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;">${inlineHtml(cell)}</th>`).join("");
  const htmlRows = rows.map((row) => `<tr>${header.map((_, index) => `<td style="padding:10px 12px; vertical-align:top; border-bottom:1px solid #edf1f4; color:#253342; font-size:13px; line-height:1.55;">${inlineHtml(row[index] || "")}</td>`).join("")}</tr>`).join("");
  const text = rows
    .map((row) => header.map((label, index) => `${label}: ${row[index] || ""}`).join("\n"))
    .join("\n\n");

  return {
    html: `<div style="overflow-x:auto; margin:20px 0;"><table role="presentation" style="width:100%; border-collapse:collapse; border:1px solid #dbe3ea;">${`<thead><tr>${htmlHeader}</tr></thead>`}<tbody>${htmlRows}</tbody></table></div>`,
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
        ? "margin:28px 0 12px; color:#12263a; font-size:22px; line-height:1.25; font-weight:700;"
        : level === 2
        ? "margin:26px 0 10px; padding-bottom:6px; border-bottom:1px solid #dbe3ea; color:#1f486d; font-size:16px; line-height:1.35; font-weight:700;"
        : "margin:20px 0 8px; color:#365d7d; font-size:14px; line-height:1.4; font-weight:700;";
      htmlBlocks.push(`<h${level} style="${styles}">${heading}</h${level}>`);
      textBlocks.push(textHeading);
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      htmlBlocks.push(`<hr style="margin:24px 0; border:0; border-top:1px solid #dbe3ea;" />`);
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
      htmlBlocks.push(`<blockquote style="margin:18px 0; padding:12px 16px; border-left:3px solid #2f7ca5; background:#f4f8fb; color:#334e68; font-size:13px; line-height:1.6;">${escapeHtml(quoteText).replace(/\n/g, "<br />")}</blockquote>`);
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
      htmlBlocks.push(`<${tag} style="margin:12px 0 18px; padding-left:24px; color:#253342; font-size:13px; line-height:1.6; ${listStyle}">${items.map((item) => `<li style="padding:2px 0;">${inlineHtml(item)}</li>`).join("")}</${tag}>`);
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
    if (paragraphText) {
      htmlBlocks.push(`<p style="margin:0 0 14px; color:#253342; font-size:13px; line-height:1.7;">${escapeHtml(paragraphText).replace(/\n/g, "<br />")}</p>`);
      textBlocks.push(paragraphText);
    } else {
      index += 1;
    }
  }

  return {
    html: htmlBlocks.join("\n"),
    text: textBlocks.join("\n\n").replace(/\*/g, "").trim(),
  };
}

function displayValue(value: string | undefined): string {
  return escapeHtml(inlineText(value || "Not provided"));
}

function moneyValue(value: number | undefined): string | undefined {
  return typeof value === "number" ? `$${value.toLocaleString("en-US")}` : undefined;
}

function buildSummaryRows(context: AppealEmailContext): Array<[string, string]> {
  const denialReason = context.denialReason;
  const rows: Array<[string, string | undefined]> = [
    ["Claim reference", context.claimNumber],
    ["Patient", context.patientName],
    ["Date of service", context.serviceDate],
    ["Procedure codes", context.cptCodes?.join(", ")],
    ["Disputed amount", moneyValue(context.deniedAmount)],
    ["Denial reason", denialReason],
  ];
  return rows.reduce<Array<[string, string]>>((result, [label, value]) => {
    const cleanedValue = value ? inlineText(value) : "";
    if (cleanedValue) result.push([label, cleanedValue]);
    return result;
  }, []);
}

function buildHeader(context: AppealEmailContext, title: string): { html: string; text: string } {
  const payer = displayValue(context.payer);
  const claimNumber = displayValue(context.claimNumber);
  const summaryRows = buildSummaryRows(context);
  const htmlSummary = summaryRows.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0; color:#66788a; font-size:12px; white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0; color:#253342; font-size:12px; font-weight:600;">${displayValue(value)}</td></tr>`).join("");
  const textSummary = summaryRows.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    html: `<div style="padding-bottom:18px; border-bottom:2px solid #1f486d; margin-bottom:24px;"><div style="color:#2f7ca5; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;">ClaimHero Appeals Desk</div><h1 style="margin:8px 0 6px; color:#12263a; font-family:Arial,Helvetica,sans-serif; font-size:24px; line-height:1.25; font-weight:700;">${escapeHtml(title)}</h1><div style="color:#526273; font-size:13px;">${payer} · Claim ${claimNumber}</div></div><table role="presentation" style="width:100%; margin:0 0 26px; border-collapse:collapse;">${htmlSummary}</table>`,
    text: `CLAIMHERO APPEALS DESK\n${title}\n${inlineText(context.payer)} · Claim ${inlineText(context.claimNumber)}\n\n${textSummary}`,
  };
}

function buildEmailDocument(
  context: AppealEmailContext,
  title: string,
  markdown: string,
  footer: string
): FormattedEmail {
  const header = buildHeader(context, title);
  const content = renderMarkdown(markdown);
  const provider = context.providerName ? `Prepared by ${inlineText(context.providerName)} on behalf of the claimant.` : "Prepared by the ClaimHero Appeals Desk.";
  const safeFooter = escapeHtml(`${footer} ${provider}`);

  return {
    html: `<div style="max-width:720px; margin:0 auto; padding:32px 28px; background:#ffffff; color:#253342; font-family:Arial,Helvetica,sans-serif;">${header.html}<main>${content.html}</main><div style="margin-top:30px; padding-top:16px; border-top:1px solid #dbe3ea; color:#66788a; font-size:11px; line-height:1.6;">${safeFooter}</div></div>`,
    text: `${header.text}\n\n${content.text}\n\n${footer} ${provider}`.trim(),
  };
}

export function formatAppealEmail(markdown: string, context: AppealEmailContext): FormattedEmail {
  return buildEmailDocument(
    context,
    "Formal Medical Appeal",
    markdown,
    "This message contains the formal appeal narrative and identifies the supporting clinical exhibits in the case record."
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
    "Please reference the claim number above in any reply or additional submission."
  );
}
