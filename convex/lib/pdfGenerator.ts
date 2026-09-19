import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

export interface AppealPdfOptions {
  claimNumber: string;
  patientName: string;
  memberId?: string;
  dateOfBirth?: string;
  insurancePayer: string;
  serviceDate?: string;
  deniedAmount?: number;
  denialReason?: string;
  appealMarkdown: string;
  providerName?: string;
  cptCodes?: string[];
  icd10Codes?: string[];
}

/**
 * Transliterates common Unicode punctuation/symbols to plain ASCII so the
 * WinAnsi Helvetica base fonts render a professional result instead of gaps.
 */
function transliterateForPdf(text: string): string {
  return text
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛`]/g, "'")
    .replace(/§/g, "Sec. ")
    .replace(/•/g, "-")
    .replace(/…/g, "...")
    .replace(/°/g, "deg.")
    .replace(/©/g, "(c)")
    .replace(/®/g, "(R)")
    .replace(/™/g, "(TM)")
    .replace(/✓/g, "v")
    .replace(/✔/g, "v")
    .replace(/✗|✘/g, "x")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/≠/g, "!=")
    .replace(/×/g, "x");
}

/**
 * Sanitizes and escapes a string for safe inclusion in a PDF literal string ( ... )
 */
function escapePdfText(text: string): string {
  return transliterateForPdf(text)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Formats long URLs cleanly for professional print citations instead of
 * wrapping awkwardly across multiple lines with hex encodings.
 */
function cleanUrlForPrint(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname;
    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments.pop() || "";

    // Handle Convex Storage URLs cleanly: convex.cloud/api/storage/4f529fb2...
    if (pathname.includes("/api/storage/")) {
      const shortId = lastSegment.length > 12 ? `${lastSegment.slice(0, 8)}...${lastSegment.slice(-4)}` : lastSegment;
      return `${host}/api/storage/${shortId}`;
    }

    const cleanLast = decodeURIComponent(lastSegment).replace(/[%_]+/g, " ").trim();
    if (cleanLast && segments.length > 0) {
      const summary = `${host}/.../${cleanLast}`;
      return summary.length <= 55 ? summary : `${host}/${cleanLast.slice(0, 48)}...`;
    }
    return `${host}${pathname}`.slice(0, 55);
  } catch {
    return url.length > 55 ? `${url.slice(0, 52)}...` : url;
  }
}

/**
 * Formats a date string into standard appellate long-form text (Month Day, Year).
 */
function formatDateForPdf(dateStr?: string): string {
  if (!dateStr) return "On File";
  const trimmed = dateStr.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return trimmed;
}

/**
 * Strips Markdown formatting so the formal dossier reads as professional
 * business correspondence instead of raw markup.
 * - `([text](url))` -> `(text: url)`
 * - `[text](url)` -> `text (url)`
 * - `**bold**`, `*italic*`, `` `code` `` -> plain text
 * - stray brackets collapsed, whitespace normalized
 */
function cleanInlineMarkdown(text: string): string {
  let t = text.replace(/\r/g, "");
  // Malformed double-paren link fragments seen in the wild: "((Official source](url))" -> "(Official source: url)"
  t = t.replace(/\(\(\s*([^()[\]]+?)\s*\]\(([^)]+)\)\)/g, (_m, label, url) => `(${label}: ${cleanUrlForPrint(url)})`);
  t = t.replace(/\(\s*([^()[\]]+?)\s*\]\(([^)]+)\)/g, (_m, label, url) => `(${label}: ${cleanUrlForPrint(url)})`);
  // Parenthesized markdown link first: " ([Official source](url))" -> " (Official source: url)"
  t = t.replace(/\s*\(\[([^\]]+)\]\(([^)]+)\)\)/g, (_m, label, url) => ` (${label}: ${cleanUrlForPrint(url)})`);
  // Generic markdown link: "[text](url)" -> "text (url)"
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => `${label} (${cleanUrlForPrint(url)})`);
  // Any surviving "](" fragments are broken link markup; render as a clean separator
  t = t.replace(/\]\s*\(/g, ": (");
  // Clean raw HTTP/HTTPS URLs not already enclosed in markdown links
  t = t.replace(/(https?:\/\/[^\s),]+)/g, (url) => cleanUrlForPrint(url));
  // Bold / italic / code / strikethrough
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/\*([^*\n]+)\*/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  // Remove any leftover markdown emphasis markers
  t = t.replace(/\*\*/g, "").replace(/__/g, "");
  // Any surviving single brackets are stray markup; drop the brackets but keep text
  t = t.replace(/\[/g, "").replace(/\]/g, "");
  // Collapse redundant parentheses left by malformed link markup: "((" -> "(", "))" -> ")"
  t = t.replace(/\(\s*\(\s*/g, "(").replace(/\s*\)\s*\)/g, ")");
  // Collapse whitespace
  t = t.replace(/[ \t]+/g, " ").trim();
  return t;
}

/**
 * Splits a long text line into multiple lines that fit within a character width limit.
 */
function wrapLine(line: string, maxChars = 80): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length <= maxChars) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        // Break extremely long words
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        current = remaining;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface PageStream {
  commands: string[];
}

/**
 * Compiles an official, multi-page, formal administrative appellate dossier in pure TypeScript.
 * Conforms to PDF 1.4 specification without external native or binary dependencies.
 */
export function generateFormalAppealPdf(options: AppealPdfOptions): Buffer {
  const pages: PageStream[] = [];
  let currentPage: PageStream = { commands: [] };
  pages.push(currentPage);

  const PAGE_WIDTH = 612; // US Letter width in points
  const PAGE_HEIGHT = 792; // US Letter height in points
  const MARGIN_LEFT = 45;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT * 2; // 522 pt
  const TOP_MARGIN = 745;
  const BOTTOM_MARGIN = 48;

  let currentY = TOP_MARGIN;

  function newPage() {
    currentPage = { commands: [] };
    pages.push(currentPage);
    currentY = TOP_MARGIN;
  }

  function addCommand(cmd: string) {
    currentPage.commands.push(cmd);
  }

  function checkSpace(needed: number) {
    if (currentY - needed < BOTTOM_MARGIN) {
      newPage();
    }
  }

  // Draw Page Header Banner
  function drawHeaderBanner() {
    addCommand("q");
    // Deep slate blue header background bar
    addCommand("0.09 0.13 0.24 rg"); // Slate 900
    addCommand(`${MARGIN_LEFT} ${currentY - 24} ${CONTENT_WIDTH} 28 re f`);
    // Header title
    addCommand("BT");
    addCommand("/F2 10 Tf");
    addCommand("1 1 1 rg"); // White text
    addCommand(`${MARGIN_LEFT + 8} ${currentY - 14} Td`);
    addCommand(`(${escapePdfText("CLAIMHERO APPELLATE SENTINEL | FORMAL ERISA & ACA APPEAL DOSSIER")}) Tj`);
    addCommand("ET");
    addCommand("Q");
    currentY -= 36;
  }

  drawHeaderBanner();

  // Draw Case Summary Demographics Box (wraps long values so nothing overflows the box)
  function drawDemographicsBox() {
    const col1X = MARGIN_LEFT + 10;
    const col2X = MARGIN_LEFT + (CONTENT_WIDTH / 2) + 5;
    const lineHeight = 12;
    const DEMO_WRAP = 55;

    const rowItems: Array<[string, string]> = [
      [
        `Claim Number: ${options.claimNumber}`,
        `Insurance Payer: ${options.insurancePayer}`,
      ],
      [
        `Patient Name: ${options.patientName}`,
        `Member ID: ${options.memberId || "On File"}`,
      ],
      [
        `Date of Birth: ${options.dateOfBirth ? formatDateForPdf(options.dateOfBirth) : "On File"}`,
        `Date of Service: ${options.serviceDate || "Documented in Records"}`,
      ],
      [
        `Treating Provider: ${options.providerName || "Documented Provider"}`,
        `Disputed / Denied Amount: $${(options.deniedAmount || 0).toLocaleString()}`,
      ],
      [
        `CPT Procedure Codes: ${(options.cptCodes || []).join(", ") || "Documented"}`,
        `ICD-10 Diagnoses: ${(options.icd10Codes || []).join(", ") || "Documented"}`,
      ],
      [
        `Denial Reason: ${options.denialReason || "Adverse Benefit Determination"}`,
        "",
      ],
    ];

    const wrappedRows = rowItems.map(([col1, col2]) => ({
      col1: wrapLine(col1, DEMO_WRAP),
      col2: wrapLine(col2, DEMO_WRAP),
    }));
    const totalLines = wrappedRows.reduce(
      (sum, row) => sum + Math.max(row.col1.length, row.col2.length),
      0
    );
    const boxHeight = 28 + totalLines * lineHeight + 10;
    checkSpace(boxHeight + 20);

    addCommand("q");
    // Box background and border
    addCommand("0.97 0.98 0.99 rg"); // Light background
    addCommand(`${MARGIN_LEFT} ${currentY - boxHeight} ${CONTENT_WIDTH} ${boxHeight} re f`);
    addCommand("0.8 0.84 0.88 RG 1 w"); // Slate border
    addCommand(`${MARGIN_LEFT} ${currentY - boxHeight} ${CONTENT_WIDTH} ${boxHeight} re S`);

    // Title of box
    addCommand("BT");
    addCommand("/F2 9 Tf");
    addCommand("0.1 0.18 0.36 rg");
    addCommand(`${MARGIN_LEFT + 10} ${currentY - 16} Td`);
    addCommand(`(${escapePdfText("STATUTORY CASE & POLICYHOLDER DEMOGRAPHICS")}) Tj`);
    addCommand("ET");

    let rowY = currentY - 32;

    for (const row of wrappedRows) {
      const rowLines = Math.max(row.col1.length, row.col2.length);
      for (let i = 0; i < rowLines; i++) {
        const left = row.col1[i];
        const right = row.col2[i];
        if (left) {
          addCommand("BT");
          addCommand("/F1 8 Tf");
          addCommand("0.2 0.25 0.35 rg");
          addCommand(`${col1X} ${rowY} Td`);
          addCommand(`(${escapePdfText(left)}) Tj`);
          addCommand("ET");
        }
        if (right) {
          addCommand("BT");
          addCommand("/F1 8 Tf");
          addCommand("0.2 0.25 0.35 rg");
          addCommand(`${col2X} ${rowY} Td`);
          addCommand(`(${escapePdfText(right)}) Tj`);
          addCommand("ET");
        }
        rowY -= lineHeight;
      }
    }

    addCommand("Q");
    currentY -= (boxHeight + 16);
  }

  drawDemographicsBox();

  // Legal Notice Banner
  function drawLegalNotice() {
    checkSpace(35);
    addCommand("q");
    addCommand("0.93 0.95 0.98 rg");
    addCommand(`${MARGIN_LEFT} ${currentY - 22} ${CONTENT_WIDTH} 22 re f`);
    addCommand("0.35 0.45 0.7 RG 1 w");
    addCommand(`${MARGIN_LEFT} ${currentY - 22} ${CONTENT_WIDTH} 22 re S`);

    addCommand("BT");
    addCommand("/F2 7.5 Tf");
    addCommand("0.1 0.2 0.5 rg");
    addCommand(`${MARGIN_LEFT + 8} ${currentY - 14} Td`);
    addCommand(`(${escapePdfText("NOTICE: FORMAL APPELLATE FILING PURSUANT TO 29 U.S.C. SEC. 1133 AND 29 C.F.R. SEC. 2560.503-1")}) Tj`);
    addCommand("ET");
    addCommand("Q");
    currentY -= 32;
  }

  drawLegalNotice();

  // Process and Render Appeal Brief Markdown (fully sanitized for formal print)
  const rawLines = options.appealMarkdown.split("\n");

  interface HeadingConfig {
    fontSize: string;
    fontKey?: string;
    lineHeight: number;
    marginTop: number;
    marginBottom: number;
    color: string;
    wrapChars: number;
    underline?: boolean;
  }

  function renderHeading(text: string, config: HeadingConfig) {
    const cleaned = cleanInlineMarkdown(text);
    if (!cleaned) return;
    const wrapped = wrapLine(cleaned, config.wrapChars);
    if (wrapped.length === 0) return;

    const totalHeadingHeight =
      config.marginTop +
      wrapped.length * config.lineHeight +
      config.marginBottom +
      (config.underline ? 4 : 0);

    // Keep heading together with at least 50pt of following content to avoid orphaned headings at page boundaries
    checkSpace(totalHeadingHeight + 50);

    currentY -= config.marginTop;

    addCommand("q");
    for (const line of wrapped) {
      addCommand("BT");
      addCommand(`${config.fontKey || "/F2"} ${config.fontSize} Tf`);
      addCommand(config.color);
      addCommand(`${MARGIN_LEFT} ${currentY} Td`);
      addCommand(`(${escapePdfText(line)}) Tj`);
      addCommand("ET");
      currentY -= config.lineHeight;
    }

    if (config.underline) {
      // Draw underline 3pt below the baseline of the last line of the heading
      const underlineY = currentY + config.lineHeight - 3;
      addCommand("0.8 0.85 0.9 RG 1 w");
      addCommand(`${MARGIN_LEFT} ${underlineY} m ${MARGIN_LEFT + CONTENT_WIDTH} ${underlineY} l S`);
      currentY -= 4;
    }
    addCommand("Q");

    currentY -= config.marginBottom;
  }

  function renderBodyLines(lines: string[], x: number, font: string, color: string, lineGap: number) {
    for (const line of lines) {
      checkSpace(13);
      addCommand("BT");
      addCommand(font);
      addCommand(color);
      addCommand(`${x} ${currentY} Td`);
      addCommand(`(${escapePdfText(line)}) Tj`);
      addCommand("ET");
      currentY -= lineGap;
    }
  }

  function renderMarkdownTable(tableLines: string[]) {
    // Filter out separator rows like | :--- | :--- |
    const cleanRows = tableLines
      .filter((line) => !/^\|?\s*[-:]+[-| :]*\s*\|?$/.test(line.trim()))
      .map((line) =>
        line
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => cleanInlineMarkdown(c).trim())
      )
      .filter((row) => row.length > 0 && row.some((c) => c.length > 0));

    if (cleanRows.length === 0) return;

    const colCount = Math.max(...cleanRows.map((r) => r.length));
    const isTwoCol = colCount === 2;
    const colWidths = isTwoCol
      ? [150, CONTENT_WIDTH - 150]
      : Array.from({ length: colCount }, () => CONTENT_WIDTH / colCount);

    const rowHeights: number[] = [];
    const wrappedRows: Array<string[][]> = [];

    for (let r = 0; r < cleanRows.length; r++) {
      const row = cleanRows[r];
      const cellLines: string[][] = [];
      for (let c = 0; c < colCount; c++) {
        const cellText = row[c] || "";
        const maxChars = isTwoCol ? (c === 0 ? 28 : 72) : Math.floor(colWidths[c] / 5);
        cellLines.push(wrapLine(cellText, maxChars));
      }
      wrappedRows.push(cellLines);
      const maxLinesInRow = Math.max(1, ...cellLines.map((lines) => lines.length));
      rowHeights.push(Math.max(16, maxLinesInRow * 11 + 6));
    }

    const totalTableHeight = rowHeights.reduce((a, b) => a + b, 0);

    // Keep table together on the page
    checkSpace(totalTableHeight + 15);

    addCommand("q");
    // Outer bounding border
    addCommand("0.78 0.82 0.88 RG 0.75 w");
    addCommand(`${MARGIN_LEFT} ${currentY - totalTableHeight} ${CONTENT_WIDTH} ${totalTableHeight} re S`);

    let rowY = currentY;

    for (let r = 0; r < cleanRows.length; r++) {
      const h = rowHeights[r];
      const isHeader = r === 0;

      // Header row background
      if (isHeader) {
        addCommand("0.93 0.95 0.98 rg");
        addCommand(`${MARGIN_LEFT} ${rowY - h} ${CONTENT_WIDTH} ${h} re f`);
        addCommand("0.75 0.8 0.86 RG 1 w");
        addCommand(`${MARGIN_LEFT} ${rowY - h} m ${MARGIN_LEFT + CONTENT_WIDTH} ${rowY - h} l S`);
      } else {
        if (r % 2 === 0) {
          addCommand("0.98 0.99 1.0 rg");
          addCommand(`${MARGIN_LEFT} ${rowY - h} ${CONTENT_WIDTH} ${h} re f`);
        }
        if (r < cleanRows.length - 1) {
          addCommand("0.88 0.9 0.93 RG 0.5 w");
          addCommand(`${MARGIN_LEFT} ${rowY - h} m ${MARGIN_LEFT + CONTENT_WIDTH} ${rowY - h} l S`);
        }
      }

      // Render cell text
      let colX = MARGIN_LEFT;
      for (let c = 0; c < colCount; c++) {
        const lines = wrappedRows[r][c] || [];
        const font = isHeader ? "/F2 8 Tf" : (c === 0 ? "/F2 7.5 Tf" : "/F1 7.5 Tf");
        const color = isHeader
          ? "0.1 0.16 0.32 rg"
          : (c === 0 ? "0.18 0.24 0.36 rg" : "0.1 0.14 0.2 rg");

        let textY = rowY - 11;
        for (const line of lines) {
          addCommand("BT");
          addCommand(font);
          addCommand(color);
          addCommand(`${colX + 6} ${textY} Td`);
          addCommand(`(${escapePdfText(line)}) Tj`);
          addCommand("ET");
          textY -= 11;
        }
        colX += colWidths[c];
      }

      rowY -= h;
    }

    // Vertical column divider line
    if (isTwoCol) {
      addCommand("0.85 0.88 0.92 RG 0.5 w");
      addCommand(`${MARGIN_LEFT + 150} ${currentY - totalTableHeight} m ${MARGIN_LEFT + 150} ${currentY} l S`);
    }

    addCommand("Q");
    currentY -= (totalTableHeight + 12);
  }

  let hasRenderedTable = false;
  let lineIdx = 0;

  while (lineIdx < rawLines.length) {
    const rawLine = rawLines[lineIdx];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      currentY -= 5;
      lineIdx++;
      continue;
    }

    // Markdown Table Detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (
        lineIdx < rawLines.length &&
        rawLines[lineIdx].trim().startsWith("|") &&
        rawLines[lineIdx].trim().endsWith("|")
      ) {
        tableLines.push(rawLines[lineIdx].trim());
        lineIdx++;
      }
      renderMarkdownTable(tableLines);
      hasRenderedTable = true;
      continue;
    }

    // Redundant bullet list suppression: if Case Adjudication table was just rendered,
    // skip the immediate plain-text "Claim details" bullet block
    if (hasRenderedTable && /^\*{0,2}Claim details\*{0,2}$/i.test(trimmed)) {
      lineIdx++;
      while (lineIdx < rawLines.length) {
        const nextTrimmed = rawLines[lineIdx].trim();
        if (/^[-*+•]\s+(?:Patient\/member|Member ID|Date of birth|Group number|Date of service|Procedure code|Diagnosis code|Denial reason|Amount at issue)/i.test(nextTrimmed)) {
          lineIdx++;
        } else if (!nextTrimmed) {
          lineIdx++;
        } else {
          break;
        }
      }
      continue;
    }

    // Exhibit block lookahead: keep the exhibit heading and its accompanying evidence bullets together on the same page
    const isExhibitHeader = /^(?:#{1,6}\s+)?(?:\*{0,2}Exhibit\s+[A-Z]:|Proof of Policy on Date of Service)/i.test(trimmed);
    if (isExhibitHeader) {
      checkSpace(115);
    }

    // Subheading protection against page-break orphans (e.g. "CLINICAL NECESSITY DETERMINATION:" or "Please:")
    const isSubheading =
      trimmed.endsWith(":") &&
      (trimmed.length <= 65 || /^[A-Z0-9\s,&/()'-]+:$/.test(trimmed));
    if (isSubheading) {
      checkSpace(38);
    }

    // Horizontal rules
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      currentY -= 5;
      lineIdx++;
      continue;
    }

    // Heading 1
    if (/^#\s+/.test(trimmed)) {
      renderHeading(trimmed.replace(/^#\s+/, ""), {
        fontSize: "12.5",
        lineHeight: 15,
        marginTop: 12,
        marginBottom: 6,
        color: "0.08 0.12 0.22 rg",
        wrapChars: 64,
        underline: true,
      });
      lineIdx++;
      continue;
    }

    // Heading 2
    if (/^##\s+/.test(trimmed)) {
      renderHeading(trimmed.replace(/^##\s+/, ""), {
        fontSize: "10.5",
        lineHeight: 13.5,
        marginTop: 10,
        marginBottom: 5,
        color: "0.1 0.18 0.35 rg",
        wrapChars: 70,
        underline: false,
      });
      lineIdx++;
      continue;
    }

    // Heading 3+
    if (/^#{3,6}\s+/.test(trimmed)) {
      renderHeading(trimmed.replace(/^#{3,6}\s+/, ""), {
        fontSize: "9.5",
        lineHeight: 13,
        marginTop: 9,
        marginBottom: 5,
        color: "0.12 0.2 0.38 rg",
        wrapChars: 74,
        underline: false,
      });
      lineIdx++;
      continue;
    }

    // Blockquotes
    if (/^>/.test(trimmed)) {
      let quoteText = trimmed;
      while (/^>\s*/.test(quoteText.trim())) {
        quoteText = quoteText.trim().replace(/^>\s?/, "");
      }
      const cleaned = cleanInlineMarkdown(quoteText);
      if (!cleaned) {
        lineIdx++;
        continue;
      }
      const wrapped = wrapLine(cleaned, 76);
      checkSpace(wrapped.length * 11.5 + 6);
      for (const line of wrapped) {
        checkSpace(12);
        addCommand("BT");
        addCommand("/F3 8.5 Tf");
        addCommand("0.3 0.35 0.42 rg");
        addCommand(`${MARGIN_LEFT + 12} ${currentY} Td`);
        addCommand(`(${escapePdfText(line)}) Tj`);
        addCommand("ET");
        currentY -= 11.5;
      }
      lineIdx++;
      continue;
    }

    // Unordered bullet points
    if (/^[-*+•]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*+•]\s+/, "").replace(/^\[[ xX]\]\s+/, "");
      const cleaned = cleanInlineMarkdown(bulletText);
      if (!cleaned) {
        lineIdx++;
        continue;
      }
      const wrapped = wrapLine(cleaned, 72);
      checkSpace(wrapped.length * 11.5 + 6);
      for (let i = 0; i < wrapped.length; i++) {
        checkSpace(12);
        addCommand("BT");
        addCommand("/F1 8.5 Tf");
        addCommand("0.15 0.18 0.22 rg");
        if (i === 0) {
          addCommand(`${MARGIN_LEFT + 8} ${currentY} Td`);
          addCommand(`(${escapePdfText("- " + wrapped[i])}) Tj`);
        } else {
          addCommand(`${MARGIN_LEFT + 20} ${currentY} Td`);
          addCommand(`(${escapePdfText(wrapped[i])}) Tj`);
        }
        addCommand("ET");
        currentY -= 11.5;
      }
      lineIdx++;
      continue;
    }

    // Ordered lists
    const orderedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (orderedMatch) {
      const cleaned = cleanInlineMarkdown(orderedMatch[2]);
      if (!cleaned) {
        lineIdx++;
        continue;
      }
      const prefix = `${orderedMatch[1]}. `;
      const wrapped = wrapLine(cleaned, 70);
      checkSpace(wrapped.length * 11.5 + 6);
      for (let i = 0; i < wrapped.length; i++) {
        checkSpace(12);
        addCommand("BT");
        addCommand("/F1 8.5 Tf");
        addCommand("0.15 0.18 0.22 rg");
        if (i === 0) {
          addCommand(`${MARGIN_LEFT + 8} ${currentY} Td`);
          addCommand(`(${escapePdfText(prefix + wrapped[i])}) Tj`);
        } else {
          addCommand(`${MARGIN_LEFT + 20} ${currentY} Td`);
          addCommand(`(${escapePdfText(wrapped[i])}) Tj`);
        }
        addCommand("ET");
        currentY -= 11.5;
      }
      lineIdx++;
      continue;
    }

    // Standard Paragraph Text
    const cleanText = cleanInlineMarkdown(trimmed);
    if (cleanText) {
      const wrapped = wrapLine(cleanText, 82);
      renderBodyLines(wrapped, MARGIN_LEFT, "/F1 8.5 Tf", "0.15 0.18 0.22 rg", 11.5);
    }
    lineIdx++;
  }

  // Formal Attestation and Signature Block
  checkSpace(80);
  currentY -= 6;
  addCommand("q");
  addCommand("0.85 0.88 0.92 RG 1 w");
  addCommand(`${MARGIN_LEFT} ${currentY} m ${MARGIN_LEFT + CONTENT_WIDTH} ${currentY} l S`);
  currentY -= 10;

  addCommand("BT");
  addCommand("/F2 8.5 Tf");
  addCommand("0.1 0.15 0.25 rg");
  addCommand(`${MARGIN_LEFT} ${currentY} Td`);
  addCommand(`(${escapePdfText("PHYSICIAN & ADVOCATE ATTESTATION STATEMENT")}) Tj`);
  addCommand("ET");
  currentY -= 10;

  const attestation =
    "I declare under penalty of perjury that the clinical evidence, peer-reviewed medical guidelines, and factual circumstances submitted in this appellate dossier are true, accurate, and establish medical necessity pursuant to standard clinical guidelines.";
  const wrappedAttest = wrapLine(attestation, 84);
  for (const line of wrappedAttest) {
    addCommand("BT");
    addCommand("/F3 8 Tf");
    addCommand("0.3 0.35 0.4 rg");
    addCommand(`${MARGIN_LEFT} ${currentY} Td`);
    addCommand(`(${escapePdfText(line)}) Tj`);
    addCommand("ET");
    currentY -= 10;
  }

  currentY -= 6;
  checkSpace(12);
  addCommand("BT");
  addCommand("/F2 8 Tf");
  addCommand("0.15 0.2 0.3 rg");
  addCommand(`${MARGIN_LEFT} ${currentY} Td`);
  addCommand(`(${escapePdfText("Authorized Clinical Representative: ClaimHero Autonomous Appellate Sentinel")}) Tj`);
  addCommand("ET");
  currentY -= 11;

  checkSpace(12);
  addCommand("BT");
  addCommand("/F1 7.5 Tf");
  addCommand("0.4 0.45 0.5 rg");
  addCommand(`${MARGIN_LEFT} ${currentY} Td`);
  addCommand(`(${escapePdfText(`Date of Transmission: ${new Date().toISOString().split("T")[0]}`)}) Tj`);
  addCommand("ET");
  currentY -= 10;
  addCommand("Q");

  // Add Page Footers to All Pages (shortened so the claim line and page number never collide)
  const totalPages = pages.length;
  const footerLeft = `Claim #${options.claimNumber} | Official Appeal Packet | Confidential (HIPAA Safe Harbor)`;
  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    page.commands.push("q");
    page.commands.push("0.88 0.9 0.94 RG 0.75 w");
    page.commands.push(`${MARGIN_LEFT} 38 m ${MARGIN_LEFT + CONTENT_WIDTH} 38 l S`);

    page.commands.push("BT");
    page.commands.push("/F1 7 Tf");
    page.commands.push("0.45 0.5 0.55 rg");
    page.commands.push(`${MARGIN_LEFT} 26 Td`);
    page.commands.push(`(${escapePdfText(footerLeft)}) Tj`);
    page.commands.push("ET");

    page.commands.push("BT");
    page.commands.push("/F2 7 Tf");
    page.commands.push("0.3 0.35 0.4 rg");
    page.commands.push(`${MARGIN_LEFT + CONTENT_WIDTH - 60} 26 Td`);
    page.commands.push(`(${escapePdfText(`Page ${i + 1} of ${totalPages}`)}) Tj`);
    page.commands.push("ET");
    page.commands.push("Q");
  }

  // Assemble PDF Objects
  const objects: string[] = [];
  function addObject(content: string): number {
    objects.push(content);
    return objects.length; // 1-indexed object number
  }

  // Object 1: Catalog
  addObject("<< /Type /Catalog /Pages 2 0 R >>");

  // Objects 3, 4, 5, 6: Standard Type 1 Fonts
  const fontHelv = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const fontItalic = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");
  const fontCourier = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  function getUtf8ByteLength(text: string): number {
    if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
      return Buffer.byteLength(text, "utf8");
    }
    return new TextEncoder().encode(text).length;
  }

  function getBinaryByteLength(text: string): number {
    if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
      return Buffer.byteLength(text, "binary");
    }
    return text.length;
  }

  function toBinaryBuffer(binaryString: string): Buffer {
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      return Buffer.from(binaryString, "binary");
    }
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i) & 0xff;
    }
    return bytes as unknown as Buffer;
  }

  // Page objects and content streams
  const pageObjNums: number[] = [];

  for (const page of pages) {
    const streamContent = page.commands.join("\n");
    const streamLength = getUtf8ByteLength(streamContent);

    const streamObjNum = addObject(
      `<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream`
    );

    const pageObj = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${streamObjNum} 0 R /Resources << /Font << /F1 ${fontHelv} 0 R /F2 ${fontBold} 0 R /F3 ${fontItalic} 0 R /F4 ${fontCourier} 0 R >> >> >>`
    );
    pageObjNums.push(pageObj);
  }

  // Object 2: Pages node
  const kidsArray = pageObjNums.map((num) => `${num} 0 R`).join(" ");
  objects[1] = `<< /Type /Pages /Kids [${kidsArray}] /Count ${pageObjNums.length} >>`;

  // Build binary PDF
  let pdfOutput = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    const objNum = i + 1;
    offsets.push(getBinaryByteLength(pdfOutput));
    pdfOutput += `${objNum} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startXref = getBinaryByteLength(pdfOutput);
  pdfOutput += `xref\n0 ${objects.length + 1}\n`;
  pdfOutput += "0000000000 65535 f \n";

  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, "0");
    pdfOutput += `${offsetStr} 00000 n \n`;
  }

  pdfOutput += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return toBinaryBuffer(pdfOutput);
}

/**
 * Ensures the formal appeal PDF dossier is compiled and stored in Convex File Storage.
 * If appeal.pdfExportStorageId exists and resolves in storage, reuses it; otherwise compiles
 * a formal administrative PDF dossier, stores it in Convex Storage, and patches the appeal record.
 */
export async function ensureAppealPdfStored(
  ctx: ActionCtx,
  claim: Doc<"claims">,
  appeal: Doc<"appeals">,
  optionsOverride?: { forceRegenerate?: boolean }
): Promise<{
  storageId: Id<"_storage">;
  buffer: Buffer;
  filename: string;
}> {
  const filename = `Formal-Appeal-Packet-${claim.claimNumber}.pdf`;

  // 1. Check if valid stored PDF already exists in Convex File Storage
  if (
    !optionsOverride?.forceRegenerate &&
    appeal.pdfExportStorageId &&
    ctx.storage &&
    typeof ctx.storage.get === "function"
  ) {
    try {
      const existingBlob = await ctx.storage.get(appeal.pdfExportStorageId);
      if (existingBlob) {
        const arrayBuffer = await existingBlob.arrayBuffer();
        return {
          storageId: appeal.pdfExportStorageId,
          buffer: Buffer.from(arrayBuffer),
          filename,
        };
      }
    } catch {
      // If retrieval failed, regenerate below
    }
  }

  if (!ctx.storage || typeof ctx.storage.store !== "function") {
    throw new Error("Convex File Storage service is not available in ActionCtx");
  }

  // 2. Dynamically compile formal administrative PDF dossier
  const rawPatientName = (claim as unknown as { patient?: { name?: string } }).patient?.name || claim.patientName || "Insured Policyholder";
  let resolvedMemberId = (claim as unknown as { patient?: { memberId?: string } }).patient?.memberId;
  let resolvedDob = (claim as unknown as { patient?: { dateOfBirth?: string } }).patient?.dateOfBirth;

  // Fallback 1: look up patient document if not joined on claim
  if ((!resolvedMemberId || !resolvedDob) && claim.patientId) {
    try {
      const patientDoc = await ctx.runQuery(internal.claims.getPatientByIdInternal, {
        patientId: claim.patientId,
      });
      if (patientDoc) {
        resolvedMemberId = resolvedMemberId || patientDoc.memberId;
        resolvedDob = resolvedDob || patientDoc.dateOfBirth;
      }
    } catch {
      // ignore
    }
  }

  // Fallback 2: extract from appeal markdown if present
  if (!resolvedMemberId && appeal.fullAppealMarkdown) {
    const mMatch = appeal.fullAppealMarkdown.match(/Member ID:\s*([A-Za-z0-9-]+)/i);
    if (mMatch && !mMatch[1].includes("REDACTED") && mMatch[1] !== "PENDING") {
      resolvedMemberId = mMatch[1].trim();
    }
  }
  if (!resolvedDob && appeal.fullAppealMarkdown) {
    const dMatch = appeal.fullAppealMarkdown.match(/(?:Date of birth|DOB)[\s:]*([A-Za-z0-9, /-]+)/i);
    if (dMatch && !dMatch[1].includes("REDACTED") && dMatch[1] !== "PENDING") {
      resolvedDob = dMatch[1].trim();
    }
  }

  const cleanMemberId =
    resolvedMemberId &&
    resolvedMemberId !== "PENDING" &&
    resolvedMemberId !== "MBN-UNASSIGNED" &&
    !resolvedMemberId.includes("REDACTED") &&
    !resolvedMemberId.includes("[MEMBER")
      ? resolvedMemberId
      : undefined;

  const pdfBuffer = generateFormalAppealPdf({
    claimNumber: claim.claimNumber,
    patientName: rawPatientName,
    memberId: cleanMemberId,
    dateOfBirth: resolvedDob,
    insurancePayer: claim.insurancePayer || "Health Insurer",
    serviceDate: claim.serviceDate,
    deniedAmount: claim.deniedAmount,
    denialReason: [claim.denialReasonCode, claim.denialReasonDescription].filter(Boolean).join(" - "),
    appealMarkdown: appeal.fullAppealMarkdown,
    providerName: claim.providerName,
    cptCodes: claim.cptCodes,
    icd10Codes: claim.icd10Codes,
  });

  // 3. Store PDF dossier into Convex File Storage
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
  const storageId = await ctx.storage.store(blob);

  // 4. Update appeal record with storage reference
  try {
    await ctx.runMutation(internal.appeals.updatePdfStorageIdInternal, {
      appealId: appeal._id,
      pdfExportStorageId: storageId,
    });
  } catch (patchErr) {
    console.warn("Failed to patch appeal.pdfExportStorageId in ensureAppealPdfStored:", patchErr);
  }

  return {
    storageId,
    buffer: pdfBuffer,
    filename,
  };
}
