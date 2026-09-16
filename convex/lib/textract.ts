/**
 * AWS Textract Integration & Document Parsing Engine
 *
 * Implements private, BAA-covered optical document extraction for Explanation of
 * Benefits (EOB), medical bills, and denial notices.
 *
 * HIPAA Safe Harbor / BAA Compliance:
 * Documents are analyzed exclusively within the AWS HIPAA BAA boundary.
 * Extracted text is de-identified via redactBeforeLLM prior to external model
 * dispatch, and direct patient identifiers are preserved securely in Convex database.
 * Callers must fail hard when credentials are absent: binary PDF/image intake has
 * no direct-vision fallback, since forwarding raw PHI bytes to a third-party LLM
 * would bypass de-identification.
 */

import {
  TextractClient,
  AnalyzeDocumentCommand,
  DetectDocumentTextCommand,
  FeatureType,
  type Block,
  type Relationship,
} from "@aws-sdk/client-textract";

export interface TextractExtractionResult {
  fullText: string;
  keyValues: Record<string, string>;
  tables: string[][][];
  patientName?: string;
  memberId?: string;
  claimNumber?: string;
  serviceDate?: string;
  providerName?: string;
  deniedAmount?: number;
  patientOwedAmount?: number;
  insurancePayer?: string;
  payerAppealsEmail?: string;
  payerAppealsAddress?: string;
}

/**
 * Returns true if AWS Textract credentials and region are configured in the environment.
 */
export function isTextractConfigured(): boolean {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  return Boolean(accessKeyId && secretAccessKey);
}

/**
 * Initializes a configured TextractClient instance.
 */
export function getTextractClient(config?: {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}): TextractClient {
  const region = config?.region || process.env.AWS_REGION || "us-east-1";
  const accessKeyId = config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = config?.sessionToken || process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS Textract credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your environment."
    );
  }

  return new TextractClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
}

/**
 * Helper to get text from a block's child word IDs.
 */
function getTextFromRelationship(
  blockMap: Map<string, Block>,
  relationship?: Relationship
): string {
  if (!relationship || !relationship.Ids) return "";
  return relationship.Ids.map((id) => {
    const child = blockMap.get(id);
    if (child && child.Text) {
      return child.Text;
    }
    return "";
  })
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Parses raw Textract Block[] array into structured linear text, key-value pairs, and tables.
 */
export function parseTextractBlocks(blocks: Block[]): {
  fullText: string;
  keyValues: Record<string, string>;
  tables: string[][][];
} {
  const blockMap = new Map<string, Block>();
  const lineBlocks: Block[] = [];
  const keyBlocks: Block[] = [];
  const valueBlocks = new Map<string, Block>();
  const tableBlocks: Block[] = [];
  const cellBlocks = new Map<string, Block>();

  for (const block of blocks) {
    if (!block.Id) continue;
    blockMap.set(block.Id, block);

    if (block.BlockType === "LINE") {
      lineBlocks.push(block);
    } else if (block.BlockType === "KEY_VALUE_SET") {
      if (block.EntityTypes?.includes("KEY")) {
        keyBlocks.push(block);
      } else if (block.EntityTypes?.includes("VALUE")) {
        valueBlocks.set(block.Id, block);
      }
    } else if (block.BlockType === "TABLE") {
      tableBlocks.push(block);
    } else if (block.BlockType === "CELL") {
      cellBlocks.set(block.Id, block);
    }
  }

  // 1. Linear full text
  const fullText = lineBlocks
    .map((b) => b.Text || "")
    .filter(Boolean)
    .join("\n");

  // 2. Extract Key-Value Pairs
  const keyValues: Record<string, string> = {};
  for (const kBlock of keyBlocks) {
    const keyText = getTextFromRelationship(
      blockMap,
      kBlock.Relationships?.find((r) => r.Type === "CHILD")
    );
    const valueRel = kBlock.Relationships?.find((r) => r.Type === "VALUE");
    if (!keyText || !valueRel || !valueRel.Ids) continue;

    const valueTexts: string[] = [];
    for (const vId of valueRel.Ids) {
      const vBlock = valueBlocks.get(vId) || blockMap.get(vId);
      if (!vBlock) continue;
      const val = getTextFromRelationship(
        blockMap,
        vBlock.Relationships?.find((r) => r.Type === "CHILD")
      );
      if (val) valueTexts.push(val);
    }

    if (keyText && valueTexts.length > 0) {
      keyValues[keyText] = valueTexts.join(" ").trim();
    }
  }

  // 3. Extract Tables
  const tables: string[][][] = [];
  for (const tBlock of tableBlocks) {
    const childRel = tBlock.Relationships?.find((r) => r.Type === "CHILD");
    if (!childRel || !childRel.Ids) continue;

    const cells: Array<{ row: number; col: number; text: string }> = [];
    let maxRow = 0;
    let maxCol = 0;

    for (const cId of childRel.Ids) {
      const cBlock = cellBlocks.get(cId) || blockMap.get(cId);
      if (!cBlock) continue;
      const row = (cBlock.RowIndex || 1) - 1;
      const col = (cBlock.ColumnIndex || 1) - 1;
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);

      const cellText = getTextFromRelationship(
        blockMap,
        cBlock.Relationships?.find((r) => r.Type === "CHILD")
      );
      cells.push({ row, col, text: cellText });
    }

    const tableGrid: string[][] = Array.from({ length: maxRow + 1 }, () =>
      Array.from({ length: maxCol + 1 }, () => "")
    );
    for (const cell of cells) {
      if (tableGrid[cell.row]) {
        tableGrid[cell.row][cell.col] = cell.text;
      }
    }
    tables.push(tableGrid);
  }

  return { fullText, keyValues, tables };
}

/**
 * Normalizes a currency or dollar amount string into a clean numeric value.
 */
function parseCurrency(str?: string): number | undefined {
  if (!str) return undefined;
  const match = str.replace(/[,$]/g, "").match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) return undefined;
  const num = parseFloat(match[0]);
  return isNaN(num) ? undefined : num;
}

/**
 * Extracts patient and claim identifiers from structured Textract key-value pairs
 * and full linearized text using deterministic healthcare EOB patterns.
 */
export function extractPatientIdentifiers(
  keyValues: Record<string, string>,
  fullText: string
): {
  patientName?: string;
  memberId?: string;
  claimNumber?: string;
  serviceDate?: string;
  providerName?: string;
  deniedAmount?: number;
  patientOwedAmount?: number;
  insurancePayer?: string;
  payerAppealsEmail?: string;
  payerAppealsAddress?: string;
} {
  const result: ReturnType<typeof extractPatientIdentifiers> = {};

  // Check key-value pairs first (highest precision)
  for (const [key, value] of Object.entries(keyValues)) {
    const k = key.toLowerCase().replace(/[:.]/g, "").replace(/\s+/g, " ").trim();
    const v = value.trim();
    if (!v) continue;

    if (
      !result.patientName &&
      (k === "patient" ||
        k === "patient name" ||
        k === "patient's name" ||
        k === "member name" ||
        k === "claimant" ||
        k === "insured name")
    ) {
      result.patientName = v;
    } else if (
      !result.memberId &&
      (k === "member id" ||
        k === "member #" ||
        k === "member number" ||
        k === "patient id" ||
        k === "patient #" ||
        k === "subscriber id" ||
        k === "policy number" ||
        k === "policy #" ||
        k === "id number" ||
        k === "identification no")
    ) {
      result.memberId = v;
    } else if (
      !result.claimNumber &&
      (k === "claim number" ||
        k === "claim #" ||
        k === "claim no" ||
        k === "claim id" ||
        k === "reference number" ||
        k === "reference #")
    ) {
      result.claimNumber = v;
    } else if (
      !result.serviceDate &&
      (k === "date of service" ||
        k === "service date" ||
        k === "dos" ||
        k === "dates of service")
    ) {
      result.serviceDate = v;
    } else if (
      !result.providerName &&
      (k === "provider" ||
        k === "provider name" ||
        k === "servicing provider" ||
        k === "rendering provider" ||
        k === "physician" ||
        k === "facility")
    ) {
      result.providerName = v;
    } else if (
      result.deniedAmount === undefined &&
      (k === "denied amount" ||
        k === "amount denied" ||
        k === "total denied" ||
        k === "denied" ||
        k === "ineligible amount")
    ) {
      result.deniedAmount = parseCurrency(v);
    } else if (
      result.patientOwedAmount === undefined &&
      (k === "patient owed" ||
        k === "patient responsibility" ||
        k === "amount you owe" ||
        k === "you owe" ||
        k === "patient balance")
    ) {
      result.patientOwedAmount = parseCurrency(v);
    } else if (
      !result.insurancePayer &&
      (k === "payer" ||
        k === "insurance payer" ||
        k === "insurance company" ||
        k === "plan name" ||
        k === "health plan")
    ) {
      result.insurancePayer = v;
    } else if (
      !result.payerAppealsEmail &&
      (k.includes("appeal") || k.includes("grievance")) &&
      v.includes("@")
    ) {
      const emailMatch = v.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) result.payerAppealsEmail = emailMatch[0];
    }
  }

  // Fall back to regex scanning on fullText if key-value pairs missed direct identifiers
  if (!result.patientName) {
    const match = fullText.match(
      /(?:Patient|Member|Insured|Claimant)(?:\s+Name)?[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/i
    );
    if (match && match[1]) {
      result.patientName = match[1].trim();
    }
  }

  if (!result.memberId) {
    const match = fullText.match(
      /(?:Member|Patient|Subscriber|Policy)\s*(?:ID|#|Number|No\.?)[:\s]+([A-Z0-9-]{5,20})/i
    );
    if (match && match[1]) {
      result.memberId = match[1].trim();
    }
  }

  if (!result.claimNumber) {
    const match = fullText.match(
      /(?:Claim|Reference)\s*(?:#|Number|No\.?|ID)[:\s]+([A-Z0-9-]{5,25})/i
    );
    if (match && match[1]) {
      result.claimNumber = match[1].trim();
    }
  }

  if (!result.serviceDate) {
    const match = fullText.match(
      /\b(?:DOS|Date\s*of\s*Service|Service\s*Date)[\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2},?\s+[0-9]{4})\b/i
    );
    if (match && match[1]) {
      result.serviceDate = match[1].trim();
    }
  }

  if (!result.payerAppealsEmail) {
    const emailMatch = fullText.match(
      /(?:appeals?|grievances?|claims?)[a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i
    );
    if (emailMatch && emailMatch[0]) {
      result.payerAppealsEmail = emailMatch[0].trim();
    }
  }

  return result;
}

/**
 * Extracts document content via AWS Textract AnalyzeDocumentCommand under the AWS HIPAA BAA.
 * Automatically falls back to DetectDocumentTextCommand if FORMS/TABLES are not supported.
 */
export async function extractDocumentWithTextract(
  documentBytes: Buffer | Uint8Array,
  options?: {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  }
): Promise<TextractExtractionResult> {
  const client = getTextractClient(options);
  const bytes = documentBytes instanceof Uint8Array ? documentBytes : new Uint8Array(documentBytes);

  let blocks: Block[] = [];

  try {
    const command = new AnalyzeDocumentCommand({
      Document: { Bytes: bytes },
      FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES],
    });
    const response = await client.send(command);
    blocks = response.Blocks || [];
  } catch (analyzeErr) {
    // If AnalyzeDocument fails (e.g. format restriction), fall back to DetectDocumentText
    console.warn("[Textract] AnalyzeDocument fallback to DetectDocumentText:", analyzeErr);
    try {
      const detectCmd = new DetectDocumentTextCommand({
        Document: { Bytes: bytes },
      });
      const detectResp = await client.send(detectCmd);
      blocks = detectResp.Blocks || [];
    } catch (detectErr) {
      throw new Error(`AWS Textract document extraction failed: ${String(detectErr)}`);
    }
  }

  const { fullText, keyValues, tables } = parseTextractBlocks(blocks);
  const extractedIdentifiers = extractPatientIdentifiers(keyValues, fullText);

  return {
    fullText,
    keyValues,
    tables,
    ...extractedIdentifiers,
  };
}
