import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import { fastSanitizeText, DetectedPiiEntity } from "./redactionEngine";

// Configure pdfjs worker in browser environments
if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

export type DocumentSourceProvenance = "client_text" | "client_ocr" | "textract";

export interface ClientExtractionResult {
  rawText: string;
  sanitizedText: string;
  sourceProvenance: DocumentSourceProvenance;
  pageCount: number;
  detectedEntities: DetectedPiiEntity[];
  clientIdentifiers: {
    patientName?: string;
    memberId?: string;
    claimNumber?: string;
  };
}

/**
 * Extract text from digital PDF using pdfjs-dist getTextContent().
 * If the PDF has no embedded text layer (scanned document), falls back to in-browser tesseract.js OCR.
 */
export async function extractTextFromPdf(
  fileOrBuffer: File | Blob | ArrayBuffer,
  onProgress?: (progressText: string) => void
): Promise<{ text: string; sourceProvenance: DocumentSourceProvenance; pageCount: number }> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if (fileOrBuffer instanceof Blob) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error("Invalid PDF input: expected File, Blob, or ArrayBuffer.");
  }

  const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10MB maximum limit
  if (arrayBuffer.byteLength > MAX_PDF_SIZE_BYTES) {
    throw new Error("Document exceeds the 10MB maximum size limit. Please upload a smaller document.");
  }

  onProgress?.("Reading digital PDF pages...");
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const MAX_PAGE_LIMIT = 10;
  if (numPages > MAX_PAGE_LIMIT) {
    throw new Error(
      `Document has ${numPages} pages, exceeding the 10-page limit. Please upload a document with 10 or fewer pages.`
    );
  }

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(`Extracting digital text from page ${pageNum} of ${numPages}...`);
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageStr = textContent.items
      .map((item: Record<string, unknown>) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    pageTexts.push(pageStr.trim());
  }

  const combinedText = pageTexts.filter(Boolean).join("\n\n").trim();
  const nonWhitespaceCharCount = combinedText.replace(/\s+/g, "").length;

  // Digital PDFs have a substantial text layer (100% accuracy, zero keys)
  if (nonWhitespaceCharCount >= 40) {
    return {
      text: combinedText,
      sourceProvenance: "client_text",
      pageCount: numPages,
    };
  }

  // Scanned PDF fallback: render pages to canvas and run in-browser tesseract.js
  if (typeof document !== "undefined") {
    onProgress?.("Scanned PDF detected without text layer. Initiating in-browser OCR...");
    const ocrPages: string[] = [];
    for (let pageNum = 1; pageNum <= Math.min(numPages, 10); pageNum++) {
      onProgress?.(`OCR scanning page ${pageNum} of ${numPages} in browser...`);
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (context) {
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        const { text: ocrText } = await extractTextFromImage(dataUrl);
        if (ocrText.trim()) {
          ocrPages.push(ocrText.trim());
        }
      }
    }
    const scannedResult = ocrPages.join("\n\n").trim();
    return {
      text: scannedResult || combinedText,
      sourceProvenance: "client_ocr",
      pageCount: numPages,
    };
  }

  return {
    text: combinedText,
    sourceProvenance: "client_text",
    pageCount: numPages,
  };
}

/**
 * Optical character recognition on images (PNG, JPEG, WebP) using tesseract.js in WebAssembly/Web Worker.
 * Recognition compute runs on-device in the browser. Callers that retain the
 * source file (e.g. Convex Storage upload for audit) still transmit the
 * original bytes server-side; only redacted text is ever sent to AI models.
 */
export async function extractTextFromImage(
  imageSource: File | Blob | string,
  onProgress?: (progressText: string) => void
): Promise<{ text: string; sourceProvenance: DocumentSourceProvenance }> {
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
  if (typeof imageSource !== "string" && "size" in imageSource && imageSource.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Document exceeds the 10MB maximum size limit. Please upload a smaller document.");
  }
  if (typeof imageSource === "string" && imageSource.length > 14 * 1024 * 1024) {
    throw new Error("Document exceeds the 10MB maximum size limit. Please upload a smaller document.");
  }

  onProgress?.("Loading in-browser optical engine...");
  const worker = await createWorker("eng");
  try {
    onProgress?.("Recognizing document text locally in browser...");
    const ret = await worker.recognize(imageSource);
    return {
      text: ret.data.text.trim(),
      sourceProvenance: "client_ocr",
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Fast client-side extractor for patient identifiers from raw text before de-identification.
 * These identifiers are safely vaulted directly in Convex DB while the text dispatched
 * to third-party LLMs remains strictly sanitized under HIPAA Safe Harbor.
 */
export function extractClientVaultIdentifiers(rawText: string): {
  patientName?: string;
  memberId?: string;
  claimNumber?: string;
} {
  const identifiers: { patientName?: string; memberId?: string; claimNumber?: string } = {};

  // Patient Name patterns (match on the same line, ignoring cross-line identifiers)
  const nameMatch = rawText.match(
    /(?:Patient(?:\s+Name)?|Member(?:\s+Name)?|Insured(?:\s+Name)?|Beneficiary)[^\S\r\n]*[:=-][^\S\r\n]*([A-Z][a-z]+(?:[^\S\r\n]+[A-Z][a-z]+)+)/i
  ) || rawText.match(
    /(?:Patient(?:\s+Name)?|Member(?:\s+Name)?|Insured(?:\s+Name)?|Beneficiary)[^\S\r\n]+([A-Z][a-z]+(?:[^\S\r\n]+[A-Z][a-z]+)+)/i
  );
  if (nameMatch && nameMatch[1]) {
    const candidate = nameMatch[1].trim();
    if (!/^(?:Explanation|Benefits|Date|Amount|Notice|Medical|Health|Insurance)/i.test(candidate)) {
      identifiers.patientName = candidate;
    }
  }

  // Member ID patterns
  const memberMatch = rawText.match(
    /(?:Member\s*ID|Policy\s*(?:#|Number|ID)|Subscriber\s*ID|Identification\s*#|Beneficiary\s*ID)[\s:]*([A-Z0-9-]{6,20})/i
  );
  if (memberMatch && memberMatch[1]) {
    identifiers.memberId = memberMatch[1].trim();
  }

  // Claim Number patterns
  const claimMatch = rawText.match(
    /(?:Claim\s*(?:#|Number|ID|No\.)|Reference\s*#)[\s:]*([A-Z0-9-]{5,25})/i
  );
  if (claimMatch && claimMatch[1]) {
    identifiers.claimNumber = claimMatch[1].trim();
  }

  return identifiers;
}

/**
 * Primary in-browser intake pipeline:
 * 1. Extracts digital text (pdf.js) or runs local OCR (tesseract.js).
 * 2. Extracts client vault identifiers locally for Convex DB vaulting.
 * 3. Sanitizes text in-browser using redactBeforeLLM (HIPAA Safe Harbor).
 * 4. Returns de-identified text so AI models receive no raw PHI. The original
 *    file and vaulted identifiers are stored in Convex only when the caller
 *    retains them for audit (e.g. uploadAndParseDocument); OCR compute itself
 *    never sends bytes to a model endpoint.
 */
export async function extractDocumentInBrowser(
  file: File | Blob,
  fileName?: string,
  onProgress?: (progressText: string) => void
): Promise<ClientExtractionResult> {
  const name = (fileName || (file instanceof File ? file.name : "")).toLowerCase();
  const mime = file.type?.toLowerCase() || "";

  const isPdf = mime.includes("pdf") || name.endsWith(".pdf");
  const isImage =
    mime.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp");

  let extractedRawText = "";
  let sourceProvenance: DocumentSourceProvenance = "client_text";
  let pageCount = 1;

  if (isPdf) {
    const result = await extractTextFromPdf(file, onProgress);
    extractedRawText = result.text;
    sourceProvenance = result.sourceProvenance;
    pageCount = result.pageCount;
  } else if (isImage) {
    const result = await extractTextFromImage(file, onProgress);
    extractedRawText = result.text;
    sourceProvenance = result.sourceProvenance;
  } else {
    // Text / JSON / Markdown
    onProgress?.("Reading text document content...");
    extractedRawText = await file.text();
    sourceProvenance = "client_text";
  }

  // Pre-redaction identifier capture for Convex DB vaulting
  const clientIdentifiers = extractClientVaultIdentifiers(extractedRawText);

  // Client-Side De-Identification: HIPAA Safe Harbor with DOS masked, since
  // the sanitized text may travel to untrusted model endpoints. Authentic DOS
  // stays vaulted in `clientIdentifiers` / the Convex database for payer use.
  // The known patient name is supplied so redaction is precise: without it
  // the free-floating heuristic would redact treating-provider names
  // ("Dr. Sarah Chen, MD" -> "Dr. [PATIENT REDACTED], MD"), which the LLM
  // then copies into providerName and the trusted UI renders verbatim.
  onProgress?.("Applying client-side HIPAA Safe Harbor de-identification...");
  const redactionOutput = fastSanitizeText(extractedRawText, {
    standard: "HIPAA_SAFE_HARBOR",
    maskDateOfService: true,
    patientName: clientIdentifiers.patientName,
  });

  return {
    rawText: extractedRawText,
    sanitizedText: redactionOutput.sanitizedText,
    sourceProvenance,
    pageCount,
    detectedEntities: redactionOutput.detectedEntities,
    clientIdentifiers,
  };
}
