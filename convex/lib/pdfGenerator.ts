import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

export interface AppealPdfOptions {
  claimNumber: string;
  patientName: string;
  memberId?: string;
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
  t = t.replace(/\(\(\s*([^()[\]]+?)\s*\]\(([^)]+)\)\)/g, "($1: $2)");
  t = t.replace(/\(\s*([^()[\]]+?)\s*\]\(([^)]+)\)/g, "($1: $2)");
  // Parenthesized markdown link first: " ([Official source](url))" -> " (Official source: url)"
  t = t.replace(/\s*\(\[([^\]]+)\]\(([^)]+)\)\)/g, " ($1: $2)");
  // Generic markdown link: "[text](url)" -> "text (url)"
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  // Any surviving "](" fragments are broken link markup; render as a clean separator
  t = t.replace(/\]\s*\(/g, ": (");
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
  // Markdown tables read poorly in print; use a neutral separator
  t = t.replace(/\|/g, " / ");
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
 * Compiles an official, multi-page, court-ready PDF appellate dossier in pure TypeScript.
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
  const TOP_MARGIN = 740;
  const BOTTOM_MARGIN = 55;

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
        `Date of Service: ${options.serviceDate || "Documented in Records"}`,
        `Treating Provider: ${options.providerName || "Documented Provider"}`,
      ],
      [
        `Disputed / Denied Amount: $${(options.deniedAmount || 0).toLocaleString()}`,
        `Denial Reason: ${options.denialReason || "Adverse Benefit Determination"}`,
      ],
      [
        `CPT Procedure Codes: ${(options.cptCodes || []).join(", ") || "Documented"}`,
        `ICD-10 Diagnoses: ${(options.icd10Codes || []).join(", ") || "Documented"}`,
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

  function renderHeading(text: string, fontSize: string, color: string, spacing: number, underline: boolean) {
    const cleaned = cleanInlineMarkdown(text);
    if (!cleaned) return;
    const wrapped = wrapLine(cleaned, 72);
    checkSpace(spacing + wrapped.length * 13);
    currentY -= 8;
    addCommand("q");
    for (const line of wrapped) {
      addCommand("BT");
      addCommand(`/F2 ${fontSize} Tf`);
      addCommand(color);
      addCommand(`${MARGIN_LEFT} ${currentY} Td`);
      addCommand(`(${escapePdfText(line)}) Tj`);
      addCommand("ET");
      currentY -= 13;
    }
    if (underline) {
      addCommand("0.8 0.85 0.9 RG 1 w");
      addCommand(`${MARGIN_LEFT} ${currentY + 8} m ${MARGIN_LEFT + CONTENT_WIDTH} ${currentY + 8} l S`);
    }
    addCommand("Q");
    currentY -= spacing - 8 - wrapped.length * 13 + 5;
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

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      currentY -= 8;
      continue;
    }

    // Horizontal rules from markdown ("---", "***", "___") become vertical spacing
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      currentY -= 6;
      continue;
    }

    // Heading 1
    if (/^#\s+/.test(trimmed)) {
      renderHeading(trimmed.replace(/^#\s+/, ""), "13", "0.08 0.12 0.22 rg", 30, true);
      continue;
    }

    // Heading 2
    if (/^##\s+/.test(trimmed)) {
      renderHeading(trimmed.replace(/^##\s+/, ""), "11", "0.1 0.18 0.35 rg", 24, false);
      continue;
    }

    // Heading 3+
    if (/^#{3,6}\s+/.test(trimmed)) {
      renderHeading(trimmed.replace(/^#{3,6}\s+/, ""), "9.5", "0.15 0.22 0.4 rg", 20, false);
      continue;
    }

    // Blockquotes ("> quoted clinical fact") render as indented italic without ">"
    if (/^>/.test(trimmed)) {
      let quoteText = trimmed;
      while (/^>\s*/.test(quoteText.trim())) {
        quoteText = quoteText.trim().replace(/^>\s?/, "");
      }
      const cleaned = cleanInlineMarkdown(quoteText);
      if (!cleaned) continue;
      const wrapped = wrapLine(cleaned, 76);
      checkSpace(wrapped.length * 12 + 8);
      for (const line of wrapped) {
        checkSpace(13);
        addCommand("BT");
        addCommand("/F3 8.5 Tf");
        addCommand("0.3 0.35 0.42 rg");
        addCommand(`${MARGIN_LEFT + 12} ${currentY} Td`);
        addCommand(`(${escapePdfText(line)}) Tj`);
        addCommand("ET");
        currentY -= 12;
      }
      continue;
    }

    // Unordered bullet points ("-", "*", "+", "•") render with a professional dash
    if (/^[-*+•]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*+•]\s+/, "").replace(/^\[[ xX]\]\s+/, "");
      const cleaned = cleanInlineMarkdown(bulletText);
      if (!cleaned) continue;
      const wrapped = wrapLine(cleaned, 72);
      checkSpace(wrapped.length * 12 + 8);
      for (let i = 0; i < wrapped.length; i++) {
        checkSpace(13);
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
        currentY -= 12;
      }
      continue;
    }

    // Ordered lists ("1.", "1)") keep numbering with hanging indent
    const orderedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (orderedMatch) {
      const cleaned = cleanInlineMarkdown(orderedMatch[2]);
      if (!cleaned) continue;
      const prefix = `${orderedMatch[1]}. `;
      const wrapped = wrapLine(cleaned, 70);
      checkSpace(wrapped.length * 12 + 8);
      for (let i = 0; i < wrapped.length; i++) {
        checkSpace(13);
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
        currentY -= 12;
      }
      continue;
    }

    // Standard Paragraph Text (markdown fully stripped)
    const cleanText = cleanInlineMarkdown(trimmed);
    if (!cleanText) continue;

    const wrapped = wrapLine(cleanText, 82);
    renderBodyLines(wrapped, MARGIN_LEFT, "/F1 8.5 Tf", "0.15 0.18 0.22 rg", 12);
  }

  // Formal Attestation and Signature Block
  checkSpace(110);
  currentY -= 10;
  addCommand("q");
  addCommand("0.85 0.88 0.92 RG 1 w");
  addCommand(`${MARGIN_LEFT} ${currentY} m ${MARGIN_LEFT + CONTENT_WIDTH} ${currentY} l S`);
  currentY -= 14;

  addCommand("BT");
  addCommand("/F2 9 Tf");
  addCommand("0.1 0.15 0.25 rg");
  addCommand(`${MARGIN_LEFT} ${currentY} Td`);
  addCommand(`(${escapePdfText("PHYSICIAN & ADVOCATE ATTESTATION STATEMENT")}) Tj`);
  addCommand("ET");
  currentY -= 12;

  const attestation =
    "I declare under penalty of perjury that the clinical evidence, peer-reviewed medical guidelines, and factual circumstances submitted in this appellate dossier are true, accurate, and establish medical necessity pursuant to standard clinical guidelines.";
  const wrappedAttest = wrapLine(attestation, 82);
  for (const line of wrappedAttest) {
    addCommand("BT");
    addCommand("/F3 8 Tf");
    addCommand("0.3 0.35 0.4 rg");
    addCommand(`${MARGIN_LEFT} ${currentY} Td`);
    addCommand(`(${escapePdfText(line)}) Tj`);
    addCommand("ET");
    currentY -= 11;
  }

  currentY -= 8;
  checkSpace(13);
  addCommand("BT");
  addCommand("/F2 8.5 Tf");
  addCommand("0.15 0.2 0.3 rg");
  addCommand(`${MARGIN_LEFT} ${currentY} Td`);
  addCommand(`(${escapePdfText("Authorized Clinical Representative: ClaimHero Autonomous Appellate Sentinel")}) Tj`);
  addCommand("ET");
  currentY -= 13;

  checkSpace(13);
  addCommand("BT");
  addCommand("/F1 8 Tf");
  addCommand("0.4 0.45 0.5 rg");
  addCommand(`${MARGIN_LEFT} ${currentY} Td`);
  addCommand(`(${escapePdfText(`Date of Transmission: ${new Date().toISOString().split("T")[0]}`)}) Tj`);
  addCommand("ET");
  currentY -= 12;
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

  // Page objects and content streams
  const pageObjNums: number[] = [];

  for (const page of pages) {
    const streamContent = page.commands.join("\n");
    const streamLength = Buffer.byteLength(streamContent, "utf8");

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
    offsets.push(Buffer.byteLength(pdfOutput, "binary"));
    pdfOutput += `${objNum} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startXref = Buffer.byteLength(pdfOutput, "binary");
  pdfOutput += `xref\n0 ${objects.length + 1}\n`;
  pdfOutput += "0000000000 65535 f \n";

  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, "0");
    pdfOutput += `${offsetStr} 00000 n \n`;
  }

  pdfOutput += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return Buffer.from(pdfOutput, "binary");
}

/**
 * Ensures the formal appeal PDF dossier is compiled and stored in Convex File Storage.
 * If appeal.pdfExportStorageId exists and resolves in storage, reuses it; otherwise compiles
 * a court-ready PDF, stores it in Convex Storage, and patches the appeal record.
 */
export async function ensureAppealPdfStored(
  ctx: ActionCtx,
  claim: Doc<"claims">,
  appeal: Doc<"appeals">
): Promise<{
  storageId: Id<"_storage">;
  buffer: Buffer;
  filename: string;
}> {
  const filename = `Formal-Appeal-Packet-${claim.claimNumber}.pdf`;

  // 1. Check if valid stored PDF already exists in Convex File Storage
  if (appeal.pdfExportStorageId && ctx.storage && typeof ctx.storage.get === "function") {
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

  // Fallback if storage is not available in mock/test contexts
  if (!ctx.storage || typeof ctx.storage.store !== "function") {
    const rawPatientName = claim.patientName || "Insured Policyholder";
    const pdfBuffer = generateFormalAppealPdf({
      claimNumber: claim.claimNumber,
      patientName: rawPatientName,
      memberId: claim.patientId ? undefined : undefined,
      insurancePayer: claim.insurancePayer || "Health Insurer",
      serviceDate: claim.serviceDate,
      deniedAmount: claim.deniedAmount,
      denialReason: [claim.denialReasonCode, claim.denialReasonDescription].filter(Boolean).join(" - "),
      appealMarkdown: appeal.fullAppealMarkdown,
      providerName: claim.providerName,
      cptCodes: claim.cptCodes,
      icd10Codes: claim.icd10Codes,
    });
    return {
      storageId: (appeal.pdfExportStorageId || "mock_storage_id") as Id<"_storage">,
      buffer: pdfBuffer,
      filename,
    };
  }

  // 2. Dynamically compile formal court-ready PDF dossier
  const rawPatientName = claim.patientName || "Insured Policyholder";
  const pdfBuffer = generateFormalAppealPdf({
    claimNumber: claim.claimNumber,
    patientName: rawPatientName,
    memberId: claim.patientId ? undefined : undefined,
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
