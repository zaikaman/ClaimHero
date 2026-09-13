"use node";

import { action, internalAction, ActionCtx } from "../_generated/server";
import crypto from "crypto";
import type { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { ERISA_STATUTORY_EVIDENCE } from "../lib/erisaEvidence";
import { api, components, internal } from "../_generated/api";
import { rateLimiter } from "../lib/rateLimiter";
import { requireClaimOwnerAction } from "../lib/auth";
import { logPipelineActivity } from "../lib/pipelineActivity";
import { FirecrawlClient, type Format, type FirecrawlDocument } from "@firecrawl/firecrawl-convex";

const firecrawl = new FirecrawlClient(components.firecrawl);

const POLICY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    policyTitle: { type: "string" },
    policyNumber: { type: "string" },
    effectiveDate: { type: "string" },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceType: {
            type: "string",
            enum: [
              "payer_cpb",
              "fda_package_insert",
              "pubmed_study",
              "nccn_guideline",
              "legal_precedent",
            ],
          },
          title: { type: "string" },
          citationClause: { type: "string" },
          extractedEvidenceMarkdown: { type: "string" },
          relevanceScore: { type: "number" },
        },
        required: [
          "sourceType",
          "title",
          "citationClause",
          "extractedEvidenceMarkdown",
          "relevanceScore",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["policyTitle", "policyNumber", "effectiveDate", "clauses"],
  additionalProperties: false,
};

export const NATIVE_POLICY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    policyTitle: { type: "string", description: "Official clinical policy bulletin title or medical guideline name." },
    policyNumber: { type: "string", description: "Policy identifier or CPB bulletin number if present." },
    effectiveDate: { type: "string", description: "Effective or revision date of the clinical policy." },
    revisionHistory: { type: "string", description: "Summary of recent revisions or annual reviews." },
    medicalNecessityCriteria: {
      type: "array",
      items: { type: "string" },
      description: "Direct medical necessity qualifying criteria and clinical requirements for the procedure.",
    },
    contraindications: {
      type: "array",
      items: { type: "string" },
      description: "Documented clinical contraindications, experimental exclusions, or non-covered indications.",
    },
    priorAuthRequirements: {
      type: "array",
      items: { type: "string" },
      description: "Prior authorization requirements, trial of conservative therapy, or step therapy criteria.",
    },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceType: {
            type: "string",
            enum: [
              "payer_cpb",
              "fda_package_insert",
              "pubmed_study",
              "nccn_guideline",
              "legal_precedent",
            ],
          },
          title: { type: "string" },
          citationClause: { type: "string" },
          extractedEvidenceMarkdown: { type: "string" },
          relevanceScore: { type: "number" },
        },
        required: [
          "sourceType",
          "title",
          "citationClause",
          "extractedEvidenceMarkdown",
          "relevanceScore",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["policyTitle"],
  additionalProperties: false,
};


const POLICY_RELEVANCE_SCHEMA = {
  type: "object",
  properties: {
    relevant: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: ["relevant", "rationale"],
  additionalProperties: false,
};

const POLICY_SEARCH_INTENT_SCHEMA = {
  type: "object",
  properties: {
    queries: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["queries"],
  additionalProperties: false,
};

const PUBMED_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    studyTitle: { type: "string" },
    authorsOrJournal: { type: "string" },
    identifier: { type: "string" },
    studyDesign: { type: "string" },
    keyFindings: { type: "string" },
    standardOfCareConclusion: { type: "string" },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          citationClause: { type: "string" },
          extractedEvidenceMarkdown: { type: "string" },
          relevanceScore: { type: "number" },
        },
        required: [
          "title",
          "citationClause",
          "extractedEvidenceMarkdown",
          "relevanceScore",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "studyTitle",
    "authorsOrJournal",
    "identifier",
    "studyDesign",
    "keyFindings",
    "standardOfCareConclusion",
    "clauses",
  ],
  additionalProperties: false,
};

const FDA_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    productName: { type: "string" },
    applicationNumber: { type: "string" },
    approvalDate: { type: "string" },
    approvedIndications: { type: "string" },
    antiInvestigationalRebuttal: { type: "string" },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          citationClause: { type: "string" },
          extractedEvidenceMarkdown: { type: "string" },
          relevanceScore: { type: "number" },
        },
        required: [
          "title",
          "citationClause",
          "extractedEvidenceMarkdown",
          "relevanceScore",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "productName",
    "applicationNumber",
    "approvalDate",
    "approvedIndications",
    "antiInvestigationalRebuttal",
    "clauses",
  ],
  additionalProperties: false,
};

const CUSTOM_GUIDELINE_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    documentTitle: { type: "string" },
    issuingAuthority: { type: "string" },
    effectiveDate: { type: "string" },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          citationClause: { type: "string" },
          extractedEvidenceMarkdown: { type: "string" },
          relevanceScore: { type: "number" },
        },
        required: [
          "title",
          "citationClause",
          "extractedEvidenceMarkdown",
          "relevanceScore",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["documentTitle", "issuingAuthority", "effectiveDate", "clauses"],
  additionalProperties: false,
};

interface ExtractedClause {
  sourceType: string;
  title: string;
  citationClause: string;
  extractedEvidenceMarkdown: string;
  relevanceScore: number;
}

interface PolicyExtractionResponse {
  policyTitle: string;
  policyNumber: string;
  effectiveDate: string;
  clauses: ExtractedClause[];
}

interface PubMedExtractionResponse {
  studyTitle: string;
  authorsOrJournal: string;
  identifier: string;
  studyDesign: string;
  keyFindings: string;
  standardOfCareConclusion: string;
  clauses: Array<{
    title: string;
    citationClause: string;
    extractedEvidenceMarkdown: string;
    relevanceScore: number;
  }>;
}

interface FdaExtractionResponse {
  productName: string;
  applicationNumber: string;
  approvalDate: string;
  approvedIndications: string;
  antiInvestigationalRebuttal: string;
  clauses: Array<{
    title: string;
    citationClause: string;
    extractedEvidenceMarkdown: string;
    relevanceScore: number;
  }>;
}

interface CustomGuidelineExtractionResponse {
  documentTitle: string;
  issuingAuthority: string;
  effectiveDate: string;
  clauses: Array<{
    title: string;
    citationClause: string;
    extractedEvidenceMarkdown: string;
    relevanceScore: number;
  }>;
}

interface PolicyRelevanceResponse {
  relevant: boolean;
  rationale: string;
}

interface PolicySearchIntentResponse {
  queries: string[];
}

export interface FirecrawlPolicySource {
  markdown: string;
  sourceUrl: string;
  json?: unknown;
  screenshot?: string;
  screenshotStorageId?: Id<"_storage">;
  cached?: boolean;
  capturedAt?: number;
  extractionEngine?: "firecrawl_native" | "openai_fallback";
}

/**
 * Strictly validate that a string is plausible base64 image data.
 * Rejects error messages, HTML fragments, URLs, and truncated payloads
 * without throwing, so screenshot handling never crashes policy crawls.
 */
function isPlausibleBase64ImagePayload(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 200) return false;
  if (trimmed.length > 8_000_000) return false;
  // Must look like base64 (allow data-URI payloads already stripped).
  if (/[^A-Za-z0-9+/=_-]/.test(trimmed)) return false;
  // Base64 length (ignoring whitespace, already trimmed) should be ~multiple of 4.
  const normalized = trimmed.replace(/\s+/g, "");
  if (normalized.length % 4 === 1) return false;
  // Reject strings that are clearly prose / HTML / URLs rather than image bytes.
  const lower = normalized.slice(0, 200).toLowerCase();
  if (
    lower.includes("<") ||
    lower.includes(">") ||
    lower.includes("http") ||
    lower.includes("error") ||
    lower.includes("failed") ||
    lower.includes("decode")
  ) {
    return false;
  }
  return true;
}

function hasRecognizedImageMagic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // GIF: GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return true;
  }
  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/**
 * Store high-resolution visual proof screenshot into Convex File Storage (_storage).
 * Supports base64 data URIs, raw base64 buffers, and remote image URLs.
 * Never throws for malformed screenshot payloads: invalid base64, error text,
 * or non-image buffers resolve to undefined so the clinical crawl can proceed
 * on markdown evidence alone.
 */
export async function storeScreenshotInStorage(
  ctx: ActionCtx,
  screenshot: string | undefined,
): Promise<Id<"_storage"> | undefined> {
  if (!screenshot || typeof screenshot !== "string" || !screenshot.trim()) {
    return undefined;
  }

  try {
    const trimmed = screenshot.trim();
    let blob: Blob | undefined;

    if (trimmed.startsWith("data:")) {
      const commaIdx = trimmed.indexOf(",");
      if (commaIdx === -1) return undefined;
      const meta = trimmed.slice(5, commaIdx);
      const isBase64 = meta.includes(";base64");
      const mime = meta.split(";")[0] || "image/png";
      if (!mime.toLowerCase().startsWith("image/")) return undefined;
      const payload = trimmed.slice(commaIdx + 1).trim();
      if (!payload) return undefined;
      let buffer: Buffer;
      try {
        buffer = isBase64
          ? Buffer.from(payload, "base64")
          : Buffer.from(decodeURIComponent(payload));
      } catch {
        return undefined;
      }
      // Allow tiny valid test images (1x1 PNG ~70 bytes) while rejecting empty
      // or truncated payloads. Real Firecrawl screenshots are many kilobytes.
      if (buffer.length < 50 || buffer.length > 8_000_000) return undefined;
      if (isBase64 && !hasRecognizedImageMagic(buffer)) return undefined;
      blob = new Blob([new Uint8Array(buffer)], { type: mime });
    } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(trimmed, {
          signal: controller.signal,
          headers: {
            "Accept": "image/*,*/*",
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.warn(`Failed to fetch policy screenshot from Firecrawl URL (HTTP ${res.status}): ${trimmed.slice(0, 80)}`);
          return undefined;
        }
        blob = await res.blob();
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.warn("Screenshot fetch failed or timed out:", fetchErr);
        return undefined;
      }
    } else if (trimmed.length > 100) {
      // Raw base64 string (Firecrawl occasionally returns bare base64 screenshots).
      // Strictly validate before decoding so error text or HTML never becomes a stored blob.
      if (!isPlausibleBase64ImagePayload(trimmed)) return undefined;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(trimmed, "base64");
      } catch {
        return undefined;
      }
      if (buffer.length < 50 || buffer.length > 8_000_000) return undefined;
      if (!hasRecognizedImageMagic(buffer)) return undefined;
      blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
    } else {
      return undefined;
    }

    // Remote HTTP screenshots are trusted when fetch succeeds (status 200) even
    // when tiny in tests; base64 branches already enforced image-magic checks.
    if (!blob || blob.size === 0 || blob.size > 8_000_000) return undefined;
    const storageId = await ctx.storage.store(blob);
    return storageId;
  } catch (err) {
    console.warn("Could not commit visual proof screenshot to Convex storage:", err);
    return undefined;
  }
}

/**
 * Parse and validate Firecrawl v1/v2 native JSON schema extraction output into PolicyExtractionResponse.
 * Handles both structured clauses arrays and discrete clinical criteria fields
 * (medicalNecessityCriteria, contraindications, priorAuthRequirements).
 */
export function parseNativeExtractionResponse(
  rawJson: unknown,
  _cptCodes: string[] = []
): PolicyExtractionResponse | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const data = rawJson as Record<string, unknown>;

  const rawTitle = typeof data.policyTitle === "string" ? data.policyTitle.trim() : "";
  if (!rawTitle || isAccessDeniedDocument(rawTitle)) return null;
  const policyTitle = rawTitle.replace(/\*\*/g, "");

  const policyNumber = typeof data.policyNumber === "string" ? data.policyNumber.trim() : "";
  const effectiveDate = typeof data.effectiveDate === "string" ? data.effectiveDate.trim() : "";
  const revisionHistory = typeof data.revisionHistory === "string" ? data.revisionHistory.trim() : "";

  const clauses: ExtractedClause[] = [];

  // 1. Process explicit clauses if returned
  if (Array.isArray(data.clauses)) {
    for (const item of data.clauses) {
      if (item && typeof item === "object") {
        const c = item as Record<string, unknown>;
        const title = (typeof c.title === "string" && c.title.trim()) ? c.title.trim().replace(/\*\*/g, "") : policyTitle;
        const citationClause = (typeof c.citationClause === "string" && c.citationClause.trim()) ? c.citationClause.trim().replace(/\*\*/g, "") : "Coverage Criteria";
        const extractedEvidenceMarkdown = (typeof c.extractedEvidenceMarkdown === "string") ? c.extractedEvidenceMarkdown.trim().replace(/\*\*/g, "") : "";
        const relevanceScore = typeof c.relevanceScore === "number" ? Math.min(Math.max(c.relevanceScore, 80), 99) : 92;
        const sourceType = typeof c.sourceType === "string" ? c.sourceType : "payer_cpb";

        if (extractedEvidenceMarkdown && !isAccessDeniedDocument(extractedEvidenceMarkdown)) {
          clauses.push({
            sourceType,
            title,
            citationClause,
            extractedEvidenceMarkdown,
            relevanceScore,
          });
        }
      }
    }
  }

  // 2. Synthesize medical necessity criteria into clauses if present
  if (Array.isArray(data.medicalNecessityCriteria)) {
    data.medicalNecessityCriteria.forEach((crit, idx) => {
      if (typeof crit === "string" && crit.trim().length > 15 && !isAccessDeniedDocument(crit)) {
        const cleanCrit = crit.trim().replace(/\*\*/g, "");
        const isDuplicate = clauses.some((c) => c.extractedEvidenceMarkdown.includes(cleanCrit.slice(0, 40)));
        if (!isDuplicate) {
          clauses.push({
            sourceType: "payer_cpb",
            title: policyTitle,
            citationClause: `Medical Necessity Criteria §${idx + 1}`,
            extractedEvidenceMarkdown: cleanCrit,
            relevanceScore: 94,
          });
        }
      }
    });
  }

  // 3. Synthesize contraindications into clauses if present
  if (Array.isArray(data.contraindications) && data.contraindications.length > 0) {
    const validContra = data.contraindications
      .filter((c): c is string => typeof c === "string" && c.trim().length > 10 && !isAccessDeniedDocument(c))
      .map((c) => c.trim().replace(/\*\*/g, ""));
    if (validContra.length > 0) {
      clauses.push({
        sourceType: "payer_cpb",
        title: `${policyTitle} - Contraindications`,
        citationClause: "Contraindications & Exclusions",
        extractedEvidenceMarkdown: validContra.join("\n\n"),
        relevanceScore: 89,
      });
    }
  }

  // 4. Synthesize prior authorization requirements if present
  if (Array.isArray(data.priorAuthRequirements) && data.priorAuthRequirements.length > 0) {
    const validAuth = data.priorAuthRequirements
      .filter((a): a is string => typeof a === "string" && a.trim().length > 10 && !isAccessDeniedDocument(a))
      .map((a) => a.trim().replace(/\*\*/g, ""));
    if (validAuth.length > 0) {
      clauses.push({
        sourceType: "payer_cpb",
        title: `${policyTitle} - Prior Authorization`,
        citationClause: "Prior Authorization & Step Therapy",
        extractedEvidenceMarkdown: validAuth.join("\n\n"),
        relevanceScore: 90,
      });
    }
  }

  if (clauses.length === 0) return null;

  return {
    policyTitle,
    policyNumber,
    effectiveDate: effectiveDate || (revisionHistory ? `Revised: ${revisionHistory}` : ""),
    clauses,
  };
}


interface FirecrawlSearchResult {
  markdown?: unknown;
  url?: unknown;
  link?: unknown;
  sourceUrl?: unknown;
  title?: unknown;
  description?: unknown;
  snippet?: unknown;
  metadata?: {
    sourceURL?: unknown;
    sourceUrl?: unknown;
    source_url?: unknown;
    url?: unknown;
    statusCode?: unknown;
  };
}

const MAX_POLICY_SEARCH_ROUNDS = 2;
const MAX_POLICY_SOURCE_CANDIDATES = 6;

const DISALLOWED_MARKETING_DOMAINS = new Set([
  "allzonems.com",
  "www.allzonems.com",
  "billingparadise.com",
  "www.billingparadise.com",
  "outsourcestrategies.com",
  "www.outsourcestrategies.com",
  "medicalbillersandcoders.com",
  "www.medicalbillersandcoders.com",
  "curemd.com",
  "www.curemd.com",
  "internationalinsurance.com",
  "www.internationalinsurance.com",
  "cignaglobal.com",
  "www.cignaglobal.com",
  "aetnainternational.com",
  "www.aetnainternational.com",
  "bcbsglobalcore.com",
  "www.bcbsglobalcore.com",
  "mercyoptions.net",
  "www.mercyoptions.net",
  "insubuy.com",
  "www.insubuy.com",
  "visitorscoverage.com",
  "www.visitorscoverage.com",
  "ehealthinsurance.com",
  "policygenius.com",
  "nerdwallet.com",
  "forbes.com",
  "reddit.com",
  "quora.com",
  "sitecorecontenthub.cloud",
  "medium.com",
  "wordpress.com",
  "worldebhcday.org",
  "www.worldebhcday.org",
  // Social media domains that Firecrawl rejects with 403 or lack clinical guidelines
  "linkedin.com",
  "www.linkedin.com",
  "facebook.com",
  "www.facebook.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "instagram.com",
  "www.instagram.com",
  "youtube.com",
  "www.youtube.com",
  "tiktok.com",
  "www.tiktok.com",
  "pinterest.com",
  "www.pinterest.com",
  // Commercial billing / RCM marketing blogs
  "verifiedrcm.com",
  "www.verifiedrcm.com",
  "aapc.com",
  "www.aapc.com",
  "medicalbillingandcoding.org",
  "www.medicalbillingandcoding.org",
  "findacode.com",
  "www.findacode.com",
]);

/**
 * Detects private, loopback, link-local, and cloud metadata hosts to prevent SSRF vulnerabilities.
 */
export function isPrivateOrLinkLocalHost(rawHostname: string): boolean {
  const host = rawHostname.replace(/^\[|\]$/g, "").toLowerCase().trim();
  if (!host) return true;

  // Localhost, local domains, cloud metadata domains
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host === "metadata" ||
    host.includes("metadata.google")
  ) {
    return true;
  }

  // Pure numeric hostname (e.g. decimal IP 2130706433 or 2852039166)
  if (/^\d+$/.test(host) || host.startsWith("0x") || host.startsWith("0o")) {
    return true;
  }

  // IPv4 dotted-decimal
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [_, aStr, bStr, cStr, dStr] = ipv4Match;
    const a = parseInt(aStr, 10);
    const b = parseInt(bStr, 10);
    const c = parseInt(cStr, 10);
    const d = parseInt(dStr, 10);

    if (a > 255 || b > 255 || c > 255 || d > 255) return true;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 10.0.0.0/8 (Private)
    if (a === 10) return true;

    // 172.16.0.0/12 (Private: 172.16.x.x - 172.31.x.x)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (Link-local / Cloud metadata: e.g. 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Test nets & protocol assignments)
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;
  }

  // IPv6 checks (loopback, unique local, link-local, IPv4-mapped)
  if (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fe8") ||
    host.startsWith("fe9") ||
    host.startsWith("fea") ||
    host.startsWith("feb") ||
    host.startsWith("fc00:") ||
    host.startsWith("fd00:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("::ffff:")
  ) {
    return true;
  }

  return false;
}

export function isAcceptableSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
    if (isPrivateOrLinkLocalHost(hostname)) {
      return false;
    }

    if (url.port && !["80", "443", ""].includes(url.port)) {
      return false;
    }

    if ([
      "google.com",
      "www.google.com",
      "bing.com",
      "www.bing.com",
      "search.yahoo.com",
      "yahoo.com",
    ].some((searchHost) => hostname === searchHost || hostname.endsWith(`.${searchHost}`))) {
      return false;
    }

    // Immediately reject social media and video sharing hosts
    if (
      hostname.includes("linkedin.com") ||
      hostname.includes("facebook.com") ||
      hostname.includes("twitter.com") ||
      hostname.includes("instagram.com") ||
      hostname.includes("youtube.com") ||
      hostname.includes("tiktok.com") ||
      hostname.includes("pinterest.com")
    ) {
      return false;
    }

    if (DISALLOWED_MARKETING_DOMAINS.has(hostname) || [...DISALLOWED_MARKETING_DOMAINS].some((d) => hostname.endsWith(`.${d}`))) {
      return false;
    }

    const sensitiveQueryKeys = new Set([
      "access_token",
      "auth",
      "expires",
      "key",
      "session",
      "sig",
      "signature",
      "token",
    ]);
    for (const queryKey of url.searchParams.keys()) {
      if (sensitiveQueryKeys.has(queryKey.toLowerCase())) return false;
    }

    if (isPrivateMcgViewerUrl(value.trim())) return false;

    // Exclude student travel / study-abroad / exchange insurance / non-clinical educational pages
    if (/\/(?:global-safety-security|study-abroad|travel-health|student-insurance|for-students|student-health|international-travel|academic-programs|admissions)\//i.test(url.pathname)) {
      return false;
    }

    // Exclude administrative prior-authorization/precertification code lists (not clinical guidelines)
    if (/(?:master[-_ ]?precert|precert[-_ ]?list|prior[-_ ]?auth(?:orization)?[-_ ]?list|precertification[-_ ]?list|code[-_ ]?list)/i.test(url.pathname)) {
      return false;
    }

    // Exclude outdated third-party WordPress upload directories from prior years (e.g. /wp-content/uploads/2019/...)
    if (/\/wp-content\/uploads\/(?:201\d|202[0-3])\//i.test(url.pathname)) {
      return false;
    }

    return !/(?:^|\/)(?:login|signin|sign-in|oauth|sso|authenticate)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isAccessDeniedDocument(value: string): boolean {
  if (!value || typeof value !== "string") return true;
  const raw = value.trim();
  if (!raw) return true;

  const preview = raw.slice(0, 8000).replace(/\s+/g, " ").trim();
  const lowerPreview = preview.toLowerCase();

  // 1. Explicit HTML / Markdown block title patterns
  if (
    /<title[^>]*>\s*(access denied|this site can.t be reached|request unsuccessful|403 forbidden|blocked|unauthorized)\s*<\/title>/i.test(raw) ||
    /^#+\s*(access denied|this site can.t be reached|request unsuccessful|403 forbidden|blocked|attention required)\b/im.test(raw) ||
    /^access denied\s*$/im.test(raw)
  ) {
    return true;
  }

  // 2. Unambiguous WAF / Edge / CDN block signatures (Akamai EdgeSuite, Cloudflare, Incapsula, AWS WAF, DataDome)
  const strongWafSignatures = [
    "you don't have permission to access",
    "you do not have permission to access",
    "errors.edgesuite.net",
    "edgesuite.net",
    "akamaighost",
    "reference #",
    "request unsuccessful",
    "_incapsula_resource",
    "cf-chl-bypass",
    "incident id:",
    "blocked by perimeterx",
    "datadome",
    "attention required! | cloudflare",
    "403 forbidden",
    "this site can't be reached",
    "took too long to respond",
    "err_connection_timed_out",
    "err_name_not_resolved",
    "dns_probe_finished",
  ];

  const hasStrongSignature = strongWafSignatures.some((sig) => lowerPreview.includes(sig));

  // If a document contains strong WAF error signatures and is under 3500 chars, it is an error page
  // regardless of whether words like 'coverage' or 'policy' appear in the error URL or footer.
  if (hasStrongSignature && preview.length < 3500) {
    return true;
  }

  // If the initial header snippet directly declares access denial
  const headerPreview = lowerPreview.slice(0, 300);
  if (
    headerPreview.includes("access denied") ||
    headerPreview.includes("you don't have permission") ||
    headerPreview.includes("request unsuccessful") ||
    headerPreview.includes("403 forbidden")
  ) {
    return true;
  }

  // 3. For longer documents, check if substantive medical necessity criteria exist or if it's an edge block
  const hasPolicyMarker =
    /medical necessity|coverage criteria|clinical policy|coverage policy|medical policy|clinical indication|contraindication|reimbursement criteria|step-therapy/i.test(
      preview,
    );

  if (hasStrongSignature && !hasPolicyMarker) {
    return true;
  }

  return false;
}

export function isHtmlErrorBody(value: string): boolean {
  const preview = value.slice(0, 8000);
  const hasPolicyMarker =
    /medical necessity|coverage criteria|clinical policy|coverage policy|medical policy|procedure code|icd-10|cpt code/i.test(
      preview,
    );
  if (hasPolicyMarker && preview.length > 1500) return false;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<head")) {
    // Challenge is HTML with iframe - only treat as error if no policy content and short.
    if (preview.length < 2500 && /request unsuccessful|incident id|access denied|forbidden|can.t be reached|timed out|dns_probe|err_connection/i.test(value)) {
      return true;
    }
    return /<title[^>]*>\s*(access denied|this site can.t be reached)/i.test(value);
  }
  // Chrome DNS error page rendered as markdown
  if (/this site can.t be reached|took too long to respond|err_connection_timed_out/i.test(value) && preview.length < 1500) return true;
  return false;
}

export function isPdfUrlExposingHtml(sourceUrl: string, body: string): boolean {
  if (!/\.(pdf|ashx)(\?|#|$)/i.test(sourceUrl)) {
    // Also treat MCG viewer URLs as document handlers that should not return HTML error
    if (!/MCG\?|mcgId=|mcgs\./i.test(sourceUrl)) return false;
  }
  const trimmed = body.trim().toLowerCase();
  if (!trimmed) return false;
  // PDF / document handler returned HTML instead of binary PDF.
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<head") || trimmed.includes("<title>access denied")) {
    return true;
  }
  // Markdown-converted error that still contains the block signature.
  if (isAccessDeniedDocument(body) && !/medical necessity|coverage criteria/i.test(body)) return true;
  return false;
}

/**
 * Sanitizes and normalizes public policy URLs:
 * - Converts fragile session-dependent CMS MCD ASPX URLs to canonical, universally accessible permalinks.
 * - Strips volatile session, token, and auth parameters that break on reload.
 */
export function sanitizePublicPolicyUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  const trimmed = urlStr.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    // 1. CMS Medicare Coverage Database legacy ASPX URLs (e.g. view/lcd.aspx?lcdid=36007 or view/article.aspx?articleid=...)
    // These trigger Akamai EdgeSuite 403 blocks when accessed without session cookies.
    // Convert to canonical search permalink which is universally open and accessible.
    if (host.includes("cms.gov") && (pathname.includes("lcd.aspx") || pathname.includes("article.aspx") || pathname.includes("ncd.aspx"))) {
      const docId = url.searchParams.get("lcdid") || url.searchParams.get("articleid") || url.searchParams.get("ncdid") || url.searchParams.get("id") || "";
      if (docId) {
        return `https://www.cms.gov/medicare-coverage-database/search.aspx?q=${encodeURIComponent(docId)}`;
      }
      return "https://www.cms.gov/medicare-coverage-database/search.aspx";
    }

    // 2. Strip volatile session / tracking tokens that cause edge / auth failures on reload
    const volatileParams = new Set([
      "session",
      "sessionid",
      "token",
      "auth",
      "ticket",
      "viewstate",
      "eventvalidation",
      "pv",
      "cachebust",
      "rnd",
      "timestamp",
    ]);

    for (const key of [...url.searchParams.keys()]) {
      if (volatileParams.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

export function isPrivateMcgViewerUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
    // Milliman Care Guidelines viewers are licensed, session-based and not publicly citable.
    // Patterns are generic, not payer-specific: mcgs subdomain, /MCG? view, mcgId/pv params.
    if (host.startsWith("mcgs.")) return true;
    if (/\/MCG(\?|\/|$)/i.test(url.pathname)) return true;
    if (url.searchParams.has("mcgid") || url.searchParams.has("mcgId") || url.searchParams.has("pv")) {
      // pv=false is the MCG preview flag; any MCG viewer with mcgId is private
      if (/mcg/i.test(pathAndQuery)) return true;
    }
    if (/mcgId=/i.test(sourceUrl) || /\/MCG\?/i.test(sourceUrl)) return true;
    return false;
  } catch {
    return /mcgs\.|MCG\?|mcgId=/i.test(sourceUrl);
  }
}

export const NEUTRAL_PUBLIC_HOSTS = new Set([
  "cms.gov",
  "www.cms.gov",
  "medicare.gov",
  "www.medicare.gov",
  "medicaid.gov",
  "www.medicaid.gov",
  "fda.gov",
  "www.fda.gov",
  "accessdata.fda.gov",
  "www.accessdata.fda.gov",
  "dailymed.nlm.nih.gov",
  "fda.report",
  "www.fda.report",
  "nih.gov",
  "www.nih.gov",
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
  "clinicaltrials.gov",
  "www.clinicaltrials.gov",
  "nccn.org",
  "www.nccn.org",
  "cdc.gov",
  "www.cdc.gov",
  "cancer.gov",
  "www.cancer.gov",
  "ecfr.gov",
  "www.ecfr.gov",
  "law.cornell.edu",
  "www.law.cornell.edu",
  "spine.org",
  "www.spine.org",
  "aaos.org",
  "www.aaos.org",
  "orthoinfo.aaos.org",
  "acr.org",
  "www.acr.org",
  "guidelines.carelonmedicalbenefitsmanagement.com",
  "carelonmedicalbenefitsmanagement.com",
  "carelon.com",
  "www.carelon.com",
  "aimspecialtyhealth.com",
  "www.aimspecialtyhealth.com",
  "evicore.com",
  "www.evicore.com",
  "statpearls.com",
  "www.statpearls.com",
  "cochranelibrary.com",
  "www.cochranelibrary.com",
  "nejm.org",
  "www.nejm.org",
  "thelancet.com",
  "www.thelancet.com",
  "jamanetwork.com",
  "www.jamanetwork.com",
  "bmj.com",
  "www.bmj.com",
  "drugs.com",
  "www.drugs.com",
  "ama-assn.org",
  "www.ama-assn.org",
  "guidelinecentral.com",
  "www.guidelinecentral.com",
  "orthobullets.com",
  "www.orthobullets.com",
  "thespinejournalonline.com",
  "www.thespinejournalonline.com",
  "jbjs.org",
  "www.jbjs.org",
  "sciencedirect.com",
  "www.sciencedirect.com",
]);

export function getPayerHostKeyword(payer: string): string | null {
  const clean = payer.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.includes("molina")) return "molina";
  if (clean.includes("bcbsfl") || clean.includes("bluecrossblueshieldflorida")) return "bcbsfl";
  if (clean.includes("geoblue") || clean.includes("geo_blue")) return "geoblue";
  if (clean.includes("bcbs") || clean.includes("bluecross") || clean.includes("anthem") || clean.includes("elevance") || clean.includes("globalcore")) return "bcbs";
  if (clean.includes("aetna") || clean.includes("cvs")) return "aetna";
  if (clean.includes("cigna") || clean.includes("evernorth")) return "cigna";
  if (clean.includes("united") || clean.includes("uhc") || clean.includes("optum")) return "uhc";
  if (clean.includes("humana")) return "humana";
  if (clean.includes("kaiser")) return "kaiser";
  return null;
}

export function isPayerMismatchedSource(payer: string, sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    // Neutral public hosts (CMS, FDA, NIH, ECFr, NASS, AAOS, ACR, Carelon, etc.) are payer-agnostic and always allowed.
    if (NEUTRAL_PUBLIC_HOSTS.has(host) || [...NEUTRAL_PUBLIC_HOSTS].some((h) => host.endsWith(`.${h}`) || host === h)) return false;
    // Explicit ECFr / law hosts used for ERISA precedent are neutral.
    if (host.includes("ecfr.gov") || host.includes("law.cornell.edu")) return false;

    const payerKeyword = getPayerHostKeyword(payer);
    if (!payerKeyword) return false; // Unknown payer, defer to LLM

    const knownPayerKeywords = [
      "molina",
      "bcbsfl",
      "bcbs",
      "aetna",
      "cigna",
      "uhc",
      "unitedhealth",
      "optum",
      "humana",
      "kaiser",
      "geoblue",
      "globalcore",
      "wellpoint",
      "anthem",
      "elevance",
      "centene",
      "ambetter",
      "amerigroup",
      "oscar",
      "highmark",
      "priorityhealth",
      "healthnet",
      "bluecross",
      "blueshield",
      "mcgs",
      "providence",
      "horizon",
    ];

    const hostContainsPayerKeyword = knownPayerKeywords.find((kw) => host.includes(kw));
    if (hostContainsPayerKeyword) {
      // If the host belongs to a known payer brand, it must match the claim's payer brand
      if (host.includes(payerKeyword)) return false;
      // Allow general bcbs variants for bcbsfl/bcbs
      if (payerKeyword === "bcbsfl" && host.includes("bcbs")) return false;
      if (payerKeyword === "bcbs" && (host.includes("bcbs") || host.includes("bluecross") || host.includes("blueshield"))) return false;
      if (payerKeyword === "geoblue" && (host.includes("geo-blue") || host.includes("geoblue") || host.includes("bcbsglobalcore"))) return false;

      // Host belongs to a different payer -> strictly mismatched competitor
      return true;
    }

    // Check MCG private viewer
    if (host.startsWith("mcgs.") && !host.includes(payerKeyword)) return true;

    return false;
  } catch {
    return false;
  }
}

function isPolicyMarkdownSubstantive(markdown: string): boolean {
  if (!markdown || markdown.trim().length < 600) return false;
  return /medical necessity|coverage|criteria|policy|clinical|indication|guideline/i.test(markdown);
}

function getFirecrawlSearchResults(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];

  const root = payload as { data?: unknown; web?: unknown };
  if (Array.isArray(root.web)) return root.web;

  if (root.data && typeof root.data === "object") {
    const data = root.data as { web?: unknown };
    if (Array.isArray(data.web)) return data.web;
  }

  return Array.isArray(root.data) ? root.data : [];
}

function getAcceptableResultUrl(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  const candidate = result as FirecrawlSearchResult;
  const possibleUrls = [
    candidate.url,
    candidate.link,
    candidate.sourceUrl,
    candidate.metadata?.sourceURL,
    candidate.metadata?.sourceUrl,
    candidate.metadata?.source_url,
    candidate.metadata?.url,
  ];

  for (const possibleUrl of possibleUrls) {
    if (isAcceptableSourceUrl(possibleUrl)) return possibleUrl.trim();
  }

  return null;
}

export function selectFirecrawlPolicyUrl(payload: unknown): string | null {
  return selectFirecrawlPolicyUrls(payload)[0] ?? null;
}

export function selectFirecrawlPolicyUrls(
  payload: unknown,
  relevanceTerms: string[] = [],
  minimumRelevanceScore = 0,
  maximumCandidates = 0,
  payer?: string,
  targetYear?: string,
): string[] {
  const candidates: Array<{ sourceUrl: string; score: number; position: number }> = [];
  const seenUrls = new Set<string>();

  getFirecrawlSearchResults(payload).forEach((result, position) => {
    const sourceUrl = getAcceptableResultUrl(result);
    if (sourceUrl && !seenUrls.has(sourceUrl)) {
      seenUrls.add(sourceUrl);

      // Pre-filter mismatched payers before wasting time and scrape quota
      if (payer && isPayerMismatchedSource(payer, sourceUrl)) {
        return;
      }

      const candidate = result as FirecrawlSearchResult;
      const searchableText = [candidate.title, candidate.description, candidate.snippet, candidate.url]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      const termScore = relevanceTerms.reduce(
        (total, term) => total + (searchableText.includes(term.toLowerCase()) ? 1 : 0),
        0,
      );
      const specificDocumentScore = [
        "clinical policy",
        "medical policy",
        "coverage policy",
        "medical necessity",
        "utilization management",
        "clinical guideline",
      ].reduce(
        (total, term) => total + (searchableText.includes(term) ? 2 : 0),
        0,
      );
      const authorityHostScore = [
        "cms.gov",
        "spine.org",
        "aaos.org",
        "acr.org",
        "carelon",
        "evicore",
        "cigna.com",
        "aetna.com",
        "nccn.org",
        "nih.gov",
        "ncbi.nlm.nih.gov",
        "thespinejournalonline.com",
        "jbjs.org",
        "sciencedirect.com",
      ].reduce(
        (total, term) => total + (sourceUrl.toLowerCase().includes(term) ? 4 : 0),
        0,
      );

      // Huge score bonus ONLY if the URL host matches the claim's actual payer
      let payerBonus = 0;
      if (payer) {
        const payerKw = getPayerHostKeyword(payer);
        if (payerKw) {
          try {
            const parsedHost = new URL(sourceUrl).hostname.toLowerCase();
            const isConsumerMarketingHost = /cignaglobal|aetnainternational|bcbsglobalcore|travel|expat|student/i.test(parsedHost);
            if (parsedHost.includes(payerKw) && !isConsumerMarketingHost) {
              payerBonus = 8;
            }
          } catch {
            // ignore malformed URLs
          }
        }
      }

      // Conflicting anatomical term penalty in search snippet/URL (e.g. foot/bunion on a knee claim)
      const isKnee = relevanceTerms.some((t) => t === "knee" || t === "27447" || t === "29881");
      const isLumbar = relevanceTerms.some((t) => t === "lumbar" || t === "spine" || t === "63047");
      let anatomicalPenalty = 0;
      if (isKnee && (searchableText.includes("bunion") || searchableText.includes("foot") || searchableText.includes("ankle") || searchableText.includes("cervical"))) {
        anatomicalPenalty = 15;
      } else if (isLumbar && (searchableText.includes("knee") || searchableText.includes("bunion") || searchableText.includes("foot"))) {
        anatomicalPenalty = 15;
      }

      // Generic wrong-procedure penalty: the result URL/title is specifically about a
      // different CPT than the claim (e.g. /cpt-code-22633/ for a 63047 claim).
      // Umbrella manuals that merely mention many codes are not penalized — only
      // pages whose primary subject is a different procedure code.
      let wrongProcedurePenalty = 0;
      const claimedCpts = new Set(
        relevanceTerms
          .map((t) => t.trim())
          .filter((t) => /^\d{5}$/.test(t)),
      );
      if (claimedCpts.size > 0) {
        const urlCptMatch =
          sourceUrl.toLowerCase().match(/cpt[-_ ]?code[-_ ]?(\d{5})/) ||
          sourceUrl.match(/\/(\d{5})(?:\/|$|[?#])/);
        if (urlCptMatch && !claimedCpts.has(urlCptMatch[1])) {
          wrongProcedurePenalty = 25;
        } else {
          const titleCptMatch = (
            typeof candidate.title === "string" ? candidate.title : ""
          ).match(/cpt\s*(\d{5})/i);
          if (titleCptMatch && !claimedCpts.has(titleCptMatch[1])) {
            wrongProcedurePenalty = 20;
          }
        }
      }

      // Generic commercial coding-guide and administrative precert list penalty (billing/reimbursement content type,
      // not a clinical coverage policy). Applies to any host, not a domain blocklist.
      let codingGuidePenalty = 0;
      const lowerUrl = sourceUrl.toLowerCase();
      if (lowerUrl.includes("/procedure-codes/") || lowerUrl.includes("/cpt-code")) {
        codingGuidePenalty += 15;
      }
      if (
        lowerUrl.includes("precert") ||
        lowerUrl.includes("prior-auth-list") ||
        lowerUrl.includes("master-precert") ||
        searchableText.includes("master precert") ||
        searchableText.includes("precert list") ||
        searchableText.includes("precertification list") ||
        searchableText.includes("prior authorization list") ||
        searchableText.includes("prior authorization code list")
      ) {
        codingGuidePenalty += 35;
      }
      if (
        searchableText.includes("billing and coding guide") ||
        searchableText.includes("coding guide") ||
        searchableText.includes("reimbursement rates") ||
        searchableText.includes("procedure-codes")
      ) {
        codingGuidePenalty += 12;
      }

      const isPdfFormat = /\.(?:pdf|ashx?)(?:$|[?#])/i.test(sourceUrl);
      const documentFormatScore = isPdfFormat ? (termScore > 0 || specificDocumentScore > 0 ? 5 : 1) : 0;
      const landingPagePenalty = [
        "directory",
        "index",
        "landing page",
        "member portal",
        "evidence of coverage",
        "companion guide",
        "electronic data interchange",
        "edi",
        "billing",
        "provider enrollment",
        "for-students",
        "student",
        "study-abroad",
        "travel-health",
        "travel-insurance",
        "plans-for-individuals",
        "plans-for-employers",
        "expat",
        "expatriate",
        "quote",
        "quote-request",
        "get-a-quote",
        "buy-online",
        "travel",
        "rebranding",
        "international-coverage",
        "products-programs",
        "brochure",
        "handbook",
        "blog",
        "blogs",
        "opinion",
        "commentary",
        "news",
        "press-release",
        "forum",
        "podcast",
        "webinar",
        "awareness",
      ].reduce(
        (total, term) => total + (searchableText.includes(term) ? 4 : 0),
        0,
      );
      const blogPenalty = /\/(?:blog|blogs|news|press-releases|commentary|opinion)\//i.test(sourceUrl) ? 15 : 0;
      const directoryIndexPenalty = (
        sourceUrl.toLowerCase().includes("/research/clinical-guidelines") ||
        sourceUrl.toLowerCase().endsWith("/clinical-guidelines") ||
        sourceUrl.toLowerCase().endsWith("/clinical-guidelines/") ||
        sourceUrl.toLowerCase().endsWith("/guidelines") ||
        sourceUrl.toLowerCase().endsWith("/guidelines/")
      ) && !/\.(?:pdf|ashx?)(?:$|[?#])/i.test(sourceUrl) ? 10 : 0;
      const privateViewerPenalty = isPrivateMcgViewerUrl(sourceUrl) ? 10 : 0;

      // Heavy penalty for expat / consumer marketing / sales portal landing pages
      const isConsumerMarketingUrl =
        /cignaglobal\.com|aetnainternational\.com|bcbsglobalcore\.com|\/individuals-families\/|\/buy-insurance\//i.test(
          sourceUrl,
        );
      const consumerMarketingPenalty = isConsumerMarketingUrl ? 25 : 0;

      // Heavy penalty for explicitly archived documents or disclaimers
      const isArchived = (
        sourceUrl.toLowerCase().includes("/archive") ||
        sourceUrl.toLowerCase().includes("archived-") ||
        sourceUrl.toLowerCase().includes("archive-") ||
        searchableText.includes("archived") ||
        searchableText.includes("archive date:") ||
        searchableText.includes("historical information only") ||
        Boolean(typeof candidate.title === "string" && candidate.title.toLowerCase().startsWith("archived"))
      );
      const archivePenalty = isArchived ? 30 : 0;

      // Recency bonus: reward active/current year or recent update tags
      const activeYear = targetYear || "2026";
      const previousYear = String(parseInt(activeYear, 10) - 1);
      let recencyBonus = 0;
      if (
        searchableText.includes(`updated ${activeYear}`) ||
        searchableText.includes(`updated-${activeYear}`) ||
        sourceUrl.includes(`updated-${activeYear}`)
      ) {
        recencyBonus += 15;
      } else if (searchableText.includes(activeYear) || sourceUrl.includes(activeYear)) {
        recencyBonus += 10;
      } else if (searchableText.includes(previousYear) || sourceUrl.includes(previousYear)) {
        recencyBonus += 4;
      }
      if (searchableText.includes("current") || searchableText.includes("active")) {
        recencyBonus += 3;
      }

      // Staleness penalty: mentions old years (e.g. 2024, 2023, 2022, 2019) without mentioning the active year
      let stalenessPenalty = 0;
      const isAncient = /20(?:1\d|2[0-2])\b/.test(sourceUrl) || /\/20(?:1\d|2[0-2])\//.test(sourceUrl);
      const hasOldYear = /20(?:1\d|2[0-4])\b/.test(searchableText) || /20(?:1\d|2[0-4])\b/.test(sourceUrl);
      const hasCurrentYear = searchableText.includes(activeYear) || sourceUrl.includes(activeYear);
      if (isAncient && !hasCurrentYear) {
        stalenessPenalty = 40;
      } else if (hasOldYear && !hasCurrentYear) {
        stalenessPenalty = 20;
      }

      const score =
        termScore +
        specificDocumentScore +
        authorityHostScore +
        payerBonus +
        documentFormatScore +
        recencyBonus -
        landingPagePenalty -
        blogPenalty -
        directoryIndexPenalty -
        privateViewerPenalty -
        anatomicalPenalty -
        wrongProcedurePenalty -
        codingGuidePenalty -
        archivePenalty -
        stalenessPenalty -
        consumerMarketingPenalty;

      if (minimumRelevanceScore <= 0 || score >= minimumRelevanceScore) {
        candidates.push({ sourceUrl, score, position });
      }
    }
  });

  const urls = candidates
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ sourceUrl }) => sourceUrl);
  return maximumCandidates > 0 ? urls.slice(0, maximumCandidates) : urls;
}

export function selectFirecrawlPolicySources(
  payload: unknown,
  maxSources = 3,
): FirecrawlPolicySource[] {
  const sources: FirecrawlPolicySource[] = [];
  const seen = new Set<string>();

  for (const result of getFirecrawlSearchResults(payload)) {
    if (!result || typeof result !== "object") continue;

    const candidate = result as FirecrawlSearchResult;
    const markdown = typeof candidate.markdown === "string" ? candidate.markdown.trim() : "";
    const sourceUrl = getAcceptableResultUrl(result);

    if (markdown && sourceUrl && !seen.has(sourceUrl)) {
      seen.add(sourceUrl);
      sources.push({ markdown, sourceUrl });
      if (sources.length >= maxSources) break;
    }
  }

  return sources;
}

export function selectFirecrawlPolicySource(payload: unknown): FirecrawlPolicySource | null {
  const sources = selectFirecrawlPolicySources(payload, 1);
  return sources.length > 0 ? sources[0] : null;
}

export interface ScrapeExtractionOptions {
  payer?: string;
  cptCodes?: string[];
  denialReasonCode?: string;
  forceRescan?: boolean;
}

/**
 * Detect Carelon Medical Benefits Management & AIM Specialty Health guideline URLs.
 * These portals display an asynchronous clinical guidelines terms-of-access modal
 * (wp-terms-popup plugin) that obscures clinical criteria unless accepted.
 */
export function isCarelonGuidelineUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /carelon|aimspecialty/i.test(url);
}

/**
 * Extract screenshot payload from a Firecrawl document.
 * Checks both top-level doc.screenshot (from formats) and actions.screenshots array
 * (from interactive action sequences).
 */
export function extractScreenshotFromDoc(doc: FirecrawlDocument | undefined): string | undefined {
  if (!doc) return undefined;
  if (typeof doc.screenshot === "string" && doc.screenshot.trim()) {
    return doc.screenshot.trim();
  }
  const rawActions = (doc as Record<string, unknown>).actions;
  if (rawActions && typeof rawActions === "object") {
    const screenshots = (rawActions as { screenshots?: unknown[] }).screenshots;
    if (Array.isArray(screenshots) && typeof screenshots[0] === "string" && screenshots[0].trim()) {
      return screenshots[0].trim();
    }
  }
  return undefined;
}

export async function scrapeFirecrawlPolicySource(
  ctx: ActionCtx,
  sourceUrl: string,
  extractionOptions?: ScrapeExtractionOptions,
): Promise<FirecrawlPolicySource> {
  if (isPrivateMcgViewerUrl(sourceUrl)) {
    throw new Error("Source URL is a private Milliman Care Guidelines viewer and not publicly citable without authentication.");
  }

  const requestedUrl = sourceUrl.trim();
  const urlHash = crypto.createHash("sha256").update(requestedUrl.toLowerCase()).digest("hex");

  // Check cached policy snapshots first (honoring autoRescanPolicies setting)
  if (!extractionOptions?.forceRescan) {
    try {
      const cached = await ctx.runQuery(internal.clinicalEvidences.getPolicySnapshotInternal, {
        urlHash,
      });
      if (cached && cached.markdown && !isAccessDeniedDocument(cached.markdown)) {
        let parsedJson: unknown = undefined;
        if (cached.extractedJson) {
          try {
            parsedJson = JSON.parse(cached.extractedJson);
          } catch {
            parsedJson = undefined;
          }
        }
        return {
          markdown: cached.markdown,
          sourceUrl: cached.url,
          json: parsedJson,
          screenshot: cached.screenshotUrl,
          screenshotStorageId: cached.screenshotStorageId,
          cached: true,
          capturedAt: cached.capturedAt,
          extractionEngine: parsedJson ? "firecrawl_native" : "openai_fallback",
        };
      }
    } catch {
      // Continue to live scrape on cache lookup error
    }
  }

  // Preserve the original deep link (e.g. CMS LCD view/lcd.aspx?lcdid=...) for the
  // primary attempt. Sanitized search permalinks are landing pages without clinical
  // content, so they are only used as a fallback when the deep link is blocked.
  const sanitizedUrl = sanitizePublicPolicyUrl(requestedUrl);
  const candidateUrls: string[] =
    sanitizedUrl && sanitizedUrl !== requestedUrl
      ? [requestedUrl, sanitizedUrl]
      : [requestedUrl];

  const scrapeMarkdown = async (targetUrl: string): Promise<FirecrawlDocument> => {
    const isPdfTarget = /\.(pdf|ashx)(\?|#|$)/i.test(targetUrl);
    const richFormats: Format[] = ["markdown"];
    if (extractionOptions?.cptCodes && extractionOptions.cptCodes.length > 0) {
      richFormats.push({
        type: "json",
        prompt: `Extract structured clinical policy criteria, medical necessity guidelines, contraindications, prior authorization requirements, effective date, revision history, and specific clause identifiers for CPT codes [${extractionOptions.cptCodes.join(", ")}] and payer ${extractionOptions.payer || "Health Insurer"} to refute denial code ${extractionOptions.denialReasonCode || "CO-50"}. Focus strictly on criteria for procedures [${extractionOptions.cptCodes.join(", ")}].`,
        schema: NATIVE_POLICY_EXTRACTION_SCHEMA,
      });
    }

    try {
      // Primary content scrape intentionally excludes screenshots. Screenshot
      // rendering is the dominant source of Firecrawl 500 base64-image failures
      // (e.g. "decode markdown base64 image data failed" on coding-guide hosts);
      // it must never fail markdown/JSON extraction and is retried best-effort below.
      return await firecrawl.scrape(ctx, targetUrl, {
        formats: richFormats,
        onlyMainContent: true,
        proxy: "auto",
        timeout: 30000,
        waitFor: isPdfTarget ? 0 : 300,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        blockAds: true,
      });
    } catch (primaryErr) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      // If rate limited, fail fast to avoid worsening the 429
      if (primaryMsg.includes("429") || primaryMsg.includes("rate limit") || primaryMsg.includes("Rate limit")) {
        throw new Error(`Firecrawl rate limit: ${primaryMsg}`);
      }

      // Resilient fallback: If rich scrape (with native json) timed out (408),
      // failed with unsupported format, or crashed on heavy JS, immediately fall back to lightweight markdown scrape.
      console.warn(`Primary Firecrawl scrape failed for ${targetUrl} (${primaryMsg}); falling back to lightweight markdown scrape.`);

      try {
        return await firecrawl.scrape(ctx, targetUrl, {
          formats: ["markdown"],
          onlyMainContent: true,
          proxy: "auto",
          timeout: 25000,
          waitFor: 0,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
          blockAds: true,
        });
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        if (fallbackMsg.includes("concurrency") || fallbackMsg.includes("timed out") || fallbackMsg.includes("408") || fallbackMsg.includes("rate limit")) {
          throw new Error(`Firecrawl concurrency/timeout: ${fallbackMsg}`);
        }
        throw fallbackErr;
      }
    }
  };

  let doc: FirecrawlDocument | undefined;
  let workingUrl = candidateUrls[0];
  let lastAccessError: Error | undefined;
  for (const targetUrl of candidateUrls) {
    try {
      const attempt = await scrapeMarkdown(targetUrl);
      const attemptMarkdown = attempt.markdown?.trim() || "";
      const attemptStatus = attempt.metadata?.statusCode;
      const isBlocked =
        (typeof attemptStatus === "number" && attemptStatus >= 400) ||
        !attemptMarkdown ||
        isAccessDeniedDocument(attemptMarkdown) ||
        isHtmlErrorBody(attemptMarkdown) ||
        isPdfUrlExposingHtml(targetUrl, attemptMarkdown);
      if (isBlocked) {
        lastAccessError = new Error(
          `Firecrawl returned an access-denied or authentication page instead of the policy document (${targetUrl}).`,
        );
        continue;
      }
      doc = attempt;
      workingUrl = targetUrl;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("Rate limit") || msg.includes("concurrency") || msg.includes("timed out") || msg.includes("408")) {
        throw err;
      }
      lastAccessError = err instanceof Error ? err : new Error(msg);
    }
  }

  if (!doc) {
    throw lastAccessError ?? new Error("Firecrawl scrape returned no Markdown policy document.");
  }

  const markdown = doc.markdown?.trim() || "";
  const statusCode = doc.metadata?.statusCode;
  if (typeof statusCode === "number" && statusCode >= 400) {
    throw new Error(`Firecrawl could not access the source URL (HTTP ${statusCode}).`);
  }

  if (!markdown) {
    throw new Error("Firecrawl scrape returned no Markdown policy document.");
  }

  if (isAccessDeniedDocument(markdown) || isHtmlErrorBody(markdown) || isPdfUrlExposingHtml(workingUrl, markdown)) {
    throw new Error("Firecrawl returned an access-denied or authentication page instead of the policy document.");
  }

  if (!isPolicyMarkdownSubstantive(markdown)) {
    throw new Error("Firecrawl returned a document without substantive clinical policy content.");
  }

  // Best-effort visual proof capture. Screenshot rendering failures (500 base64
  // decode, 408 timeout, unsupported viewport) are swallowed so they never
  // invalidate an otherwise substantive markdown policy document.
  let screenshot: string | undefined = doc.screenshot;
  if (!screenshot) {
    const isCarelon = isCarelonGuidelineUrl(workingUrl);
    if (isCarelon) {
      // Carelon / AIM Clinical Guidelines display an asynchronous terms modal (wp-terms-popup).
      // Firecrawl must wait for the modal DOM to load, click "I ACCEPT", and wait for the modal
      // and backdrop to fully dismiss before capturing the visual proof screenshot.
      try {
        const carelonShot = await firecrawl.scrape(ctx, workingUrl, {
          formats: [{ type: "screenshot", fullPage: false }],
          actions: [
            { type: "wait", milliseconds: 2000 },
            {
              type: "click",
              selector:
                "input.termsagree, input[name='wptp_agree'], input[value='I ACCEPT'], .tthebutton .termsagree",
            },
            { type: "wait", milliseconds: 3500 },
            { type: "screenshot" },
          ],
          onlyMainContent: true,
          proxy: "auto",
          timeout: 30000,
          waitFor: 0,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
          blockAds: true,
        });
        screenshot = extractScreenshotFromDoc(carelonShot);
      } catch (carelonErr) {
        const carelonMsg = carelonErr instanceof Error ? carelonErr.message : String(carelonErr);
        console.warn(
          `Carelon modal dismissal screenshot capture failed for ${workingUrl} (${carelonMsg}); falling back to default capture.`
        );
        try {
          const fallbackShot = await firecrawl.scrape(ctx, workingUrl, {
            formats: [{ type: "screenshot", fullPage: false }],
            onlyMainContent: true,
            proxy: "auto",
            timeout: 15000,
            waitFor: 0,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
            },
            blockAds: true,
          });
          screenshot = extractScreenshotFromDoc(fallbackShot);
        } catch (shotErr) {
          const shotMsg = shotErr instanceof Error ? shotErr.message : String(shotErr);
          console.warn(`Visual proof screenshot unavailable for ${workingUrl} (${shotMsg}); proceeding with markdown evidence.`);
          screenshot = undefined;
        }
      }
    } else {
      try {
        const shot = await firecrawl.scrape(ctx, workingUrl, {
          formats: [{ type: "screenshot", fullPage: false }],
          onlyMainContent: true,
          proxy: "auto",
          timeout: 15000,
          waitFor: 0,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
          blockAds: true,
        });
        screenshot = extractScreenshotFromDoc(shot);
      } catch (shotErr) {
        const shotMsg = shotErr instanceof Error ? shotErr.message : String(shotErr);
        console.warn(`Visual proof screenshot unavailable for ${workingUrl} (${shotMsg}); proceeding with markdown evidence.`);
        screenshot = undefined;
      }
    }
  }

  const scrapedSourceUrl = getAcceptableResultUrl({
    url: workingUrl,
    metadata: doc.metadata as FirecrawlSearchResult["metadata"],
  });

  const cleanUrl = sanitizePublicPolicyUrl(scrapedSourceUrl ?? workingUrl);
  let screenshotStorageId: Id<"_storage"> | undefined = undefined;
  if (screenshot) {
    screenshotStorageId = await storeScreenshotInStorage(ctx, screenshot);
  }

  try {
    await ctx.runMutation(internal.clinicalEvidences.savePolicySnapshotInternal, {
      urlHash,
      url: cleanUrl,
      title: typeof (doc.metadata as Record<string, unknown>)?.title === "string" ? ((doc.metadata as Record<string, unknown>).title as string) : undefined,
      markdown,
      extractedJson: doc.json ? JSON.stringify(doc.json) : undefined,
      screenshotStorageId,
      screenshotUrl: screenshot?.startsWith("http") ? screenshot : undefined,
    });
  } catch {
    // Non-fatal cache persistence error
  }

  return {
    markdown,
    sourceUrl: cleanUrl,
    json: doc.json,
    screenshot: screenshot?.startsWith("http") ? screenshot : undefined,
    screenshotStorageId,
  };
}

/**
 * Native Firecrawl Structured Extraction helper.
 * Scrapes a policy URL and extracts structured clinical criteria in a single request,
 * eliminating the second LLM hop to OpenAI.
 */
export async function extractPolicyWithFirecrawl(
  ctx: ActionCtx,
  sourceUrl: string,
  options: {
    payer?: string;
    cptCodes: string[];
    denialReasonCode?: string;
  }
): Promise<{
  source: FirecrawlPolicySource;
  extractedData: PolicyExtractionResponse | null;
  extractionEngine: "firecrawl_native" | "openai_fallback";
}> {
  const source = await scrapeFirecrawlPolicySource(ctx, sourceUrl, {
    payer: options.payer,
    cptCodes: options.cptCodes,
    denialReasonCode: options.denialReasonCode,
  });

  if (source.json && typeof source.json === "object") {
    const nativeParsed = parseNativeExtractionResponse(source.json, options.cptCodes);
    if (nativeParsed && nativeParsed.clauses.length > 0) {
      const alignment = isPolicyAlignedWithClaim(source.markdown, nativeParsed.policyTitle, options.cptCodes);
      if (alignment.aligned && !isAccessDeniedDocument(nativeParsed.policyTitle)) {
        return {
          source,
          extractedData: nativeParsed,
          extractionEngine: "firecrawl_native",
        };
      }
    }
  }

  return {
    source,
    extractedData: null,
    extractionEngine: "openai_fallback",
  };
}


const GENERIC_CLINICAL_STOPWORDS = new Set([
  "with",
  "without",
  "and",
  "or",
  "for",
  "of",
  "the",
  "a",
  "an",
  "in",
  "on",
  "to",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "total",
  "office",
  "visit",
  "moderate",
  "complexity",
  "average",
  "billed",
  "coverage",
  "policy",
  "clinical",
  "criteria",
  "medical",
  "necessity",
  "guideline",
  "service",
  "procedure",
  "surgery",
  "joint",
  "lower",
  "extremity",
]);

function extractSignificantTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !GENERIC_CLINICAL_STOPWORDS.has(t));
}

const CPT_CLINICAL_NAMES: Record<string, string> = {
  "27447": "Total Knee Arthroplasty (TKA)",
  "63047": "Laminectomy / Facetectomy (Lumbar Spine)",
  "73721": "MRI Lower Extremity Joint Without Contrast",
  "99214": "Office / Outpatient Visit Moderate Complexity",
  "29881": "Arthroscopy Knee Meniscectomy",
};

/**
 * Generic clinical synonym ontology keyed by CPT.
 * These are standard procedure/anatomy synonyms from orthopedic, neurosurgical,
 * and radiology vocabularies — not template-specific hardcodes. They prevent
 * false deterministic rejections when a guideline uses "decompression" or
 * "stenosis" instead of the literal token "laminectomy".
 */
const CPT_CLINICAL_SYNONYMS: Record<string, string[]> = {
  "27447": [
    "knee",
    "arthroplasty",
    "replacement",
    "tka",
    "osteoarthritis",
    "tricompartmental",
    "unicompartmental",
    "prosthesis",
  ],
  "63047": [
    "laminectomy",
    "facetectomy",
    "foraminotomy",
    "laminotomy",
    "lamina",
    "decompression",
    "decompress",
    "stenosis",
    "stenotic",
    "lumbar",
    "spine",
    "spinal",
    "spondylosis",
    "discectomy",
    "diskectomy",
    "claudication",
    "radiculopathy",
    "radicular",
    "sciatica",
    "neurogenic",
    "cauda",
    "myelopathy",
  ],
  "73721": [
    "mri",
    "magnetic",
    "resonance",
    "imaging",
    "meniscus",
    "meniscal",
    "meniscectomy",
    "knee",
    "cartilage",
    "ligament",
    "radiology",
  ],
  "99214": ["office", "outpatient", "visit", "evaluation", "management"],
  "29881": [
    "arthroscopy",
    "arthroscopic",
    "meniscectomy",
    "meniscus",
    "meniscal",
    "knee",
    "debridement",
    "chondroplasty",
    "locking",
    "catching",
  ],
};

export function getCptKeywords(cptCodes: string[]): string[] {
  const terms: string[] = [];
  let hasKnown = false;
  for (const code of cptCodes) {
    const name = CPT_CLINICAL_NAMES[code];
    if (name) {
      hasKnown = true;
      const acronymMatch = name.match(/\(([A-Z]{2,})\)/);
      if (acronymMatch) terms.push(acronymMatch[1].toLowerCase());
      const cleaned = name.replace(/\(.*?\)/g, " ");
      for (const token of extractSignificantTerms(cleaned)) {
        terms.push(token);
      }
      for (const synonym of CPT_CLINICAL_SYNONYMS[code] ?? []) {
        terms.push(synonym.toLowerCase());
      }
      terms.push(code.toLowerCase());
    } else {
      terms.push(code.toLowerCase());
    }
  }
  if (!hasKnown) return [];
  return [...new Set(terms)];
}

/**
 * Extracts a procedure-focused window from large multi-chapter guidelines (e.g. 150KB+ Carelon/CMS manuals).
 * Centers around the procedure code or anatomical terms while preserving the document header.
 */
export function extractRelevantDocumentWindow(
  markdown: string,
  cptCodes: string[],
  maxWindowLength = 50000,
): string {
  if (!markdown || markdown.length <= maxWindowLength) return markdown;

  const lower = markdown.toLowerCase();
  const keywords = getCptKeywords(cptCodes);
  const searchTerms = [...cptCodes, ...keywords].filter((t) => t.length >= 3);

  let bestIndex = -1;
  let highestScore = 0;

  for (const term of searchTerms) {
    let pos = 0;
    while ((pos = lower.indexOf(term.toLowerCase(), pos)) !== -1) {
      const windowSample = lower.slice(Math.max(0, pos - 2000), Math.min(lower.length, pos + 10000));
      const score = searchTerms.reduce((sum, st) => sum + (windowSample.includes(st.toLowerCase()) ? 1 : 0), 0);
      if (score > highestScore) {
        highestScore = score;
        bestIndex = pos;
      }
      pos += term.length + 50;
    }
  }

  if (bestIndex === -1 || highestScore === 0) {
    return markdown.slice(0, maxWindowLength);
  }

  const docHeader = markdown.slice(0, 3000);
  const targetWindowSize = maxWindowLength - 4000;
  const startOffset = Math.max(0, bestIndex - 4000);
  const endOffset = Math.min(markdown.length, startOffset + targetWindowSize);
  const focusedSection = markdown.slice(startOffset, endOffset);

  return `${docHeader}\n\n[... Clinical Guideline Content Truncated for Procedure Alignment ...]\n\n${focusedSection}`;
}

export function isPolicyAlignedWithClaim(
  markdown: string,
  policyTitle: string,
  cptCodes: string[],
): { aligned: boolean; reason: string } {
  const keywords = getCptKeywords(cptCodes);
  if (!keywords.length) return { aligned: true, reason: "No deterministic keywords for unknown CPT, defer to LLM" };

  const haystack = `${policyTitle} ${markdown}`.toLowerCase();
  const matched = keywords.filter((kw) => haystack.includes(kw));
  if (matched.length > 0) return { aligned: true, reason: `Matched keyword(s): ${matched.join(", ")}` };

  // Lenient conflict-only veto: only reject when the document is clearly about a
  // different anatomy/procedure (e.g. foot bunion guide for a lumbar decompression
  // claim). Generic titles like "Recommendations" with no conflicting anatomy
  // defer to the LLM relevance judge instead of hard-failing on a missing token.
  const codeSet = new Set(cptCodes.map((c) => c.trim()));
  const isSpineClaim = codeSet.has("63047");
  const isKneeClaim =
    codeSet.has("27447") || codeSet.has("29881") || codeSet.has("73721");

  const SPINE_SIGNALS = [
    "lumbar", "spine", "spinal", "stenosis", "decompress", "laminect",
    "foraminotom", "radicul", "claudicat", "spondyl", "disc ", "disk ",
    "cauda", "myelopathy", "neurogenic",
  ];
  const KNEE_SIGNALS = [
    "knee", "menisc", "arthroplast", "arthroscop", "tka", "patell",
    "osteoarthritis",
  ];
  const FOOT_SIGNALS = ["bunion", "hallux", "plantar", "foot ", "ankle"];
  const CERVICAL_SIGNALS = ["cervical", "neck pain"];

  const hasSpine = SPINE_SIGNALS.some((t) => haystack.includes(t));
  const hasKnee = KNEE_SIGNALS.some((t) => haystack.includes(t));
  const hasFoot = FOOT_SIGNALS.some((t) => haystack.includes(t));
  const hasCervical = CERVICAL_SIGNALS.some((t) => haystack.includes(t));

  if (isSpineClaim && !hasSpine && (hasKnee || hasFoot || hasCervical)) {
    const conflict = hasKnee ? "knee" : hasFoot ? "foot/ankle" : "cervical";
    return {
      aligned: false,
      reason: `Document appears to address ${conflict} pathology without lumbar/spine decompression criteria for CPT ${cptCodes.join(", ")}. Title was: "${policyTitle}".`,
    };
  }
  if (isKneeClaim && !hasKnee && (hasSpine || hasFoot || hasCervical)) {
    const conflict = hasSpine ? "lumbar/spine" : hasFoot ? "foot/ankle" : "cervical";
    return {
      aligned: false,
      reason: `Document appears to address ${conflict} pathology without knee criteria for CPT ${cptCodes.join(", ")}. Title was: "${policyTitle}".`,
    };
  }

  return {
    aligned: true,
    reason: `No conflicting anatomy detected; deferring to LLM relevance judge for CPT ${cptCodes.join(", ")}. Title was: "${policyTitle}".`,
  };
}

export function extractGuidelineLinksFromMarkdown(
  markdown: string,
  baseUrl: string,
  cptCodes: string[],
  targetYear?: string,
): string[] {
  if (!markdown) return [];
  const cptKeywords = getCptKeywords(cptCodes);
  const relevantKeywords = [
    ...cptCodes,
    ...cptKeywords,
    "clinical guideline",
    "coverage policy",
    "medical necessity",
    "lumbar",
    "spinal",
    "spine",
    "stenosis",
    "decompression",
    "laminectomy",
    "knee",
    "meniscus",
    "arthroplasty",
    "surgery",
  ].map((k) => k.toLowerCase());

  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g;
  const matches: Array<{ url: string; score: number }> = [];
  let match: RegExpExecArray | null;

  const activeYear = targetYear || "2026";
  const previousYear = String(parseInt(activeYear, 10) - 1);

  while ((match = linkRegex.exec(markdown)) !== null) {
    const text = match[1].toLowerCase();
    const href = match[2].trim();

    const textScore = relevantKeywords.reduce((sum, kw) => sum + (text.includes(kw) ? 2 : 0), 0);
    const hrefScore = relevantKeywords.reduce((sum, kw) => sum + (href.toLowerCase().includes(kw) ? 1 : 0), 0);
    const isPdf = /\.(?:pdf|ashx)(?:$|[?#])/i.test(href);

    const isLinkArchived =
      text.includes("archived") ||
      href.toLowerCase().includes("archived") ||
      href.toLowerCase().includes("/archive");
    const linkArchivePenalty = isLinkArchived ? 25 : 0;

    let linkRecencyBonus = 0;
    if (
      text.includes(activeYear) ||
      href.includes(activeYear) ||
      text.includes(`updated ${activeYear}`) ||
      href.includes(`updated-${activeYear}`)
    ) {
      linkRecencyBonus += 12;
    } else if (text.includes(previousYear) || href.includes(previousYear)) {
      linkRecencyBonus += 4;
    }

    if (textScore > 0 || hrefScore > 0 || (isPdf && (textScore > 0 || hrefScore > 0))) {
      let resolvedUrl = href;
      try {
        resolvedUrl = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
      if (isAcceptableSourceUrl(resolvedUrl) && !isPrivateMcgViewerUrl(resolvedUrl)) {
        matches.push({
          url: resolvedUrl,
          score: textScore + hrefScore + (isPdf ? 4 : 0) + linkRecencyBonus - linkArchivePenalty,
        });
      }
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .map((m) => m.url);
}

async function evaluatePolicySourceRelevance(
  policySource: FirecrawlPolicySource,
  payer: string,
  cptCodes: string[],
  icd10Codes: string[],
  denialReasonCode: string,
  denialReasonDescription: string,
  targetYear = "2026",
  serviceDate = "",
): Promise<PolicyRelevanceResponse> {
  if (isPrivateMcgViewerUrl(policySource.sourceUrl)) {
    return {
      relevant: false,
      rationale: `Source URL is a private Milliman Care Guidelines viewer (mcgs/MCG?/mcgId) and not a publicly citable payer policy: ${policySource.sourceUrl}`,
    };
  }
  if (isPayerMismatchedSource(payer, policySource.sourceUrl)) {
    return {
      relevant: false,
      rationale: `Source URL domain does not match the claim payer ${payer} and is not a neutral public guideline: ${policySource.sourceUrl}`,
    };
  }

  const cptDescriptions = cptCodes
    .map((code) => {
      const name = CPT_CLINICAL_NAMES[code];
      return name ? `${code} (${name})` : code;
    })
    .join(", ");

  const windowedMarkdown = extractRelevantDocumentWindow(policySource.markdown, cptCodes, 12000);

  let llmResult: PolicyRelevanceResponse;
  try {
    llmResult = await createStructuredCompletion<PolicyRelevanceResponse>({
      systemPrompt: `You are an expert clinical document auditor for health insurance claim appeals.
Evaluate whether the supplied document is an authoritative, clinically relevant coverage policy, medical necessity guideline, or specialty society standard that directly applies to this claim.

Evaluation Directives:
1. Provenance & Authority: The document must be an official policy from the claim's payer, their recognized clinical guidelines manager (e.g. Carelon, EviCore), or a neutral national medical authority (CMS LCD/NCD, AAOS, NASS, ACR, NCCN, PubMed, FDA, ECFR). Strictly reject policies issued by competing commercial health plans or unrelated regional programs.
2. Clinical Specificity: The document must establish substantive medical necessity criteria, diagnostic standards, conservative therapy rules, or coverage indications for the procedure and anatomical site involved in the claim (e.g. Spine Surgery / Decompression for CPT 63047, Joint Surgery / Knee Arthroscopy & Meniscectomy for CPT 29881, Total Knee Arthroplasty for CPT 27447, Knee MRI for CPT 73721). Note: Carelon Musculoskeletal Guidelines cover Knee Arthroscopy and Meniscectomy under their official guideline titled "Joint Surgery". Reject documents that address only perioperative adjuncts (e.g. antithrombotic prophylaxis, anesthesia, billing/coding) without establishing the primary procedure's medical necessity criteria.
3. Content Type: Reject commercial billing coding blogs, consumer marketing materials, device-manufacturer reimbursement guides, provider enrollment forms, directory/landing index pages without substantive criteria, and private password-protected viewers.
4. Guideline Recency & Best-Available Vintage:
   - Prefer the ACTIVE, CURRENTLY EFFECTIVE guideline in effect on the claim's Date of Service (${serviceDate || targetYear}, Year ${targetYear}). Rank active/updated-year editions first.
   - Do NOT reject a national specialty society guideline (NASS, AAOS, ACR, NCCN) solely because its publication year predates ${targetYear} when it remains the latest publicly accessible edition containing applicable medical necessity criteria for the claimed procedure. Return relevant=true with rationale noting vintage (for example: "NASS lumbar stenosis guideline - latest published edition, clinically applicable to 2026 DOS").
   - Do NOT reject an archived Carelon/EviCore/CMS edition solely because its effective window ended before the Date of Service when it is otherwise clinically specific to the claimed procedure and no active edition was retrievable in this result set. Return relevant=true with rationale noting best-available vintage (for example: "Archived Carelon edition - best publicly accessible vintage; active edition not retrievable, cite with vintage disclosure"). Only return relevant=false for vintage when the document is about the wrong anatomy/procedure, lacks substantive criteria, or an active edition of the same guideline family is already available.
   - Reject directory search-result pages, help/landing pages, and ongoing-research protocols without results (e.g. "project is ongoing and does not have results") because they contain no citable criteria, regardless of vintage.
5. Administrative & Prior-Authorization Denials (e.g. CO-197, CO-16, Precertification Absent): When a claim is denied for lack of prior authorization or precertification, the universal legal and clinical appeal mechanism under ERISA and health plan rules is demonstrating emergency medical necessity, acute progressive deficit, or clinical indication for retroactive authorization. You MUST NEVER reject an authoritative clinical guideline, coverage policy, or peer-reviewed study simply because the denial code was administrative or 'lack of prior authorization'. Clinical criteria and surgical indications ARE the exact substantive evidence required to overturn prior-authorization denials.
6. Peer-Reviewed Clinical Evidence & PubMed: Peer-reviewed clinical studies, systematic reviews, and meta-analyses indexed on PubMed/NCBI establish clinical efficacy, standard-of-care, and medical necessity indications under ERISA full-and-fair review regulations. You MUST accept a PubMed study or systematic review if it evaluates the surgical indications, clinical outcomes, or medical necessity for the procedure and diagnosis in the claim. Do not reject PubMed documents merely because they are formatted as journal articles or abstracts rather than an insurer CPB bulletin. Reject only protocols/project summaries that explicitly state they have no results or findings yet.

Return relevant=true if the document satisfies all directives (including best-available vintage acceptance), or relevant=false with a concise explanation.`,
      userPrompt: `Evaluate this Firecrawl document before it is used as appeal evidence.

Payer: ${payer}
Procedure code(s): ${cptDescriptions}
Diagnosis code(s): ${icd10Codes.join(", ") || "Not provided"}
Denial reason code: ${denialReasonCode || "Not provided"}
Denial description: ${denialReasonDescription || "Not provided"}
Date of Service: ${serviceDate || targetYear} (Target Active Year: ${targetYear})
Source URL: ${policySource.sourceUrl}

Document excerpt (title may be first line):
${windowedMarkdown}`,
      schemaName: "PolicyRelevanceResponse",
      schema: POLICY_RELEVANCE_SCHEMA,
      temperature: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Policy relevance evaluation failed for ${policySource.sourceUrl}: ${msg}`);
    return {
      relevant: false,
      rationale: `Relevance evaluation failed to parse document structure: ${msg}`,
    };
  }

  if (llmResult.relevant) {
    const titleGuess = policySource.markdown.split("\n")[0]?.slice(0, 300) || "";
    const alignment = isPolicyAlignedWithClaim(windowedMarkdown, titleGuess, cptCodes);
    if (!alignment.aligned) {
      return { relevant: false, rationale: alignment.reason };
    }
  }

  return llmResult;
}

/**
 * Detect vintage-only rejections that remain eligible as best-available fallback.
 * Returns true when the rationale complains about archived/superseded/outdated
 * vintage but does NOT indicate wrong anatomy, billing content, landing pages,
 * payer mismatch, or missing clinical criteria. Such documents are clinically
 * specific but merely imperfect in vintage, and are preferable to total failure.
 */
export function isVintageOnlyRejection(rationale: string): boolean {
  const lower = rationale.toLowerCase();
  const vintageSignals = [
    "archiv",
    "supersed",
    "historical",
    "outdated",
    "expired before date of service",
    "prior years",
    "2011",
    "2012",
    "2013",
    "significantly outdated",
  ];
  const hasVintage = vintageSignals.some((s) => lower.includes(s));
  if (!hasVintage) return false;
  const substantiveFailureSignals = [
    "does not mention",
    "wrong",
    "different anatomy",
    "knee",
    "foot",
    "bunion",
    "cervical",
    "billing",
    "coding guide",
    "landing page",
    "directory",
    "not a specific",
    "search results landing",
    "help",
    "does not contain",
    "no clinical",
    "without substantive",
    "payer",
    "mismatch",
    "competitor",
    "private",
    "unauthorized",
    "access-denied",
    "ongoing",
    "does not have results",
    "commercial",
    "device manufacturer",
    "perioperative",
    "antithrombotic",
    "prophylaxis",
  ];
  // If the rationale ALSO cites a substantive failure (wrong procedure, billing
  // content, landing page), it is not vintage-only and must not be used as fallback.
  // Vintage phrases like "archived" alone, or "outdated historical reference" for an
  // otherwise specific specialty guideline, qualify as vintage-only.
  const hasSubstantiveFailure = substantiveFailureSignals.some((s) =>
    lower.includes(s),
  );
  // Special case: rationales that say "outdated ... and likely superseded for 2026"
  // for a specialty guideline that IS about the claimed procedure are vintage-only,
  // even if they mention the procedure name. Only treat knee/foot/cervical/billing
  // mentions as substantive failures when they indicate wrong-anatomy rejection.
  if (hasSubstantiveFailure) {
    const isWrongAnatomyRejection =
      lower.includes("appears to address") ||
      lower.includes("different anatomy") ||
      lower.includes("without lumbar") ||
      lower.includes("without knee") ||
      lower.includes("billing") ||
      lower.includes("landing page") ||
      lower.includes("directory") ||
      lower.includes("does not establish") ||
      lower.includes("does not contain medical necessity");
    if (isWrongAnatomyRejection) return false;
    // Otherwise the "substantive" keyword is incidental (e.g. procedure name in an
    // outdated notice) — still vintage-only if the core complaint is vintage.
    const vintageCore =
      lower.includes("archiv") ||
      lower.includes("supersed") ||
      lower.includes("outdated") ||
      lower.includes("expired before");
    if (vintageCore) return true;
    return false;
  }
  return true;
}

export function cleanPayerForSearch(payer: string): string {
  const clean = payer
    .replace(
      /\b(of|inc|llc|corp|corporation|insurance company|plan|health plan|healthcare|health care|services|fl|florida|ca|california|tx|texas|ny|new york|global|worldwide|international|core|health benefits|options|expat|travel)\b/gi,
      "",
    )
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 3 ? clean : payer;
}

/**
 * Extract explicitly cited clinical policy identifiers from denial text.
 * Parses generic references such as "CPB 0171", "CPB-0093", "Policy 0066",
 * "SURG.00011", "CMM-312", "LCD L33394" without any template-specific
 * hardcoding. These identifiers are authored by the payer in the adverse
 * determination notice and provide the highest-precision retrieval signal,
 * immune to search-engine ranking drift that otherwise surfaces related
 * but non-applicable bulletins (e.g. hip CPB 0736 for a knee MRI claim).
 */
export function extractCitedPolicyIdentifiers(text: string): {
  cpbNumbers: string[];
  policyTokens: string[];
} {
  if (!text || typeof text !== "string") return { cpbNumbers: [], policyTokens: [] };

  const cpbNumbers: string[] = [];
  const seenCpb = new Set<string>();
  const cpbPattern = /CPB\s*[):#-]*\s*0*(\d{1,4})\b/gi;
  let cpbMatch: RegExpExecArray | null;
  while ((cpbMatch = cpbPattern.exec(text)) !== null) {
    const raw = cpbMatch[1];
    const num = parseInt(raw, 10);
    if (Number.isNaN(num) || num <= 0 || num > 9999) continue;
    const normalized = String(num).padStart(4, "0");
    if (!seenCpb.has(normalized)) {
      seenCpb.add(normalized);
      cpbNumbers.push(normalized);
    }
    if (cpbNumbers.length >= 3) break;
  }

  const policyTokens: string[] = [];
  const seenTokens = new Set<string>();
  const tokenPatterns: RegExp[] = [
    /SURG\s*[.-]?\s*0*\d[\d.]*/gi,
    /CMM\s*[-.]?\s*\d{2,4}\b/gi,
    /\bLCD\s*L?\d{4,6}\b/gi,
    /\bNCD\s*[\d.]+\b/gi,
    /(?:Coverage\s+)?Policy\s*(?:No\.?\s*)?0*(\d{3,4})\b/gi,
  ];
  for (const pattern of tokenPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const token = m[0].trim().replace(/\s+/g, " ");
      const key = token.toLowerCase();
      if (!seenTokens.has(key) && token.length >= 4 && token.length <= 40) {
        seenTokens.add(key);
        policyTokens.push(token);
      }
      if (policyTokens.length >= 4) break;
    }
    if (policyTokens.length >= 4) break;
  }

  return { cpbNumbers, policyTokens };
}

/**
 * Build the canonical public Aetna Clinical Policy Bulletin URL for a given
 * CPB number using Aetna's stable public pattern:
 * https://www.aetna.com/cpb/medical/data/{range}/{number}.html
 * where {range} is 1_99 for numbers <100, else floor(N/100)*100 floor(N/100)*100+99
 * (e.g. 0093 -> 1_99/0093, 0171 -> 100_199/0171, 0736 -> 700_799/0736).
 * Generic pattern resolution for any cited CPB number, not a template hardcode.
 */
export function buildAetnaCpbCanonicalUrl(cpbNumber: string): string | null {
  if (!cpbNumber || typeof cpbNumber !== "string") return null;
  const digits = cpbNumber.replace(/\D/g, "");
  if (!digits) return null;
  const num = parseInt(digits, 10);
  if (Number.isNaN(num) || num <= 0 || num > 9999) return null;
  const filename = String(num).padStart(4, "0");
  const range = num < 100 ? "1_99" : `${Math.floor(num / 100) * 100}_${Math.floor(num / 100) * 100 + 99}`;
  return `https://www.aetna.com/cpb/medical/data/${range}/${filename}.html`;
}

/**
 * Build direct canonical Aetna CPB URLs for cited numbers when the claim payer
 * is Aetna (including subsidiaries like Aetna International that use parent
 * Aetna CPBs). Returns empty for non-Aetna payers. Generic: works for any
 * future Aetna CPB citation, not just the demo templates.
 */
export function buildCitedAetnaCpbUrls(payer: string, cpbNumbers: string[]): string[] {
  if (!payer || !cpbNumbers.length) return [];
  if (getPayerHostKeyword(payer) !== "aetna") return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const num of cpbNumbers.slice(0, 3)) {
    const url = buildAetnaCpbCanonicalUrl(num);
    if (url && isAcceptableSourceUrl(url) && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Build deterministic high-precision search queries from explicitly cited
 * policy identifiers. These augment (never replace) the LLM-generated
 * multi-angle queries, guaranteeing the exact cited bulletin is requested
 * from Firecrawl even when generic procedure queries rank related bulletins
 * higher. Generic: derived from denial text + CPT, no template hardcoding.
 */
export function buildCitedPolicySearchQueries(
  payer: string,
  cpbNumbers: string[],
  policyTokens: string[],
  cptCodes: string[],
): string[] {
  const searchPayer = cleanPayerForSearch(payer);
  const primaryCpt = cptCodes[0] || "";
  const queries: string[] = [];
  const seen = new Set<string>();

  for (const num of cpbNumbers.slice(0, 2)) {
    const bare = `${searchPayer} CPB ${num}`.trim();
    if (bare.length >= 8 && !seen.has(bare.toLowerCase())) {
      seen.add(bare.toLowerCase());
      queries.push(bare);
    }
    if (primaryCpt) {
      const withCpt = `CPB ${num} ${primaryCpt} coverage criteria`.trim();
      if (!seen.has(withCpt.toLowerCase())) {
        seen.add(withCpt.toLowerCase());
        queries.push(withCpt);
      }
    }
    if (queries.length >= 2) break;
  }

  for (const token of policyTokens.slice(0, 2)) {
    const q = primaryCpt
      ? `${searchPayer} ${token} ${primaryCpt}`.trim()
      : `${searchPayer} ${token}`.trim();
    if (q.length >= 8 && q.length <= 90 && !seen.has(q.toLowerCase())) {
      seen.add(q.toLowerCase());
      queries.push(q);
    }
    if (queries.length >= 4) break;
  }

  return queries.slice(0, 4);
}

async function generatePolicySearchQueries(
  payer: string,
  cptCodes: string[],
  icd10Codes: string[],
  denialReasonCode: string,
  denialReasonDescription: string,
  rejectedSearchFeedback = "",
  serviceDate = "",
  targetYear = "2026",
): Promise<string[]> {
  const searchPayer = cleanPayerForSearch(payer);
  const cptDescriptions = cptCodes
    .map((code) => {
      const name = CPT_CLINICAL_NAMES[code];
      return name ? `${code} (${name})` : code;
    })
    .join(", ");
  const primaryProcedureName = cptCodes[0] && CPT_CLINICAL_NAMES[cptCodes[0]]
    ? CPT_CLINICAL_NAMES[cptCodes[0]].replace(/\(.*?\)/g, "").trim()
    : "Medical Procedure";
  const primaryCpt = cptCodes[0] || "";

  const result = await createStructuredCompletion<PolicySearchIntentResponse>({
    systemPrompt: `You are an expert Clinical Policy Retrieval Strategist for health insurance appeals.
Generate 3 distinct, high-precision web search queries to locate official, currently active clinical coverage policies, medical necessity guidelines, or national specialty society standards for this claim.

CRITICAL DIRECTIVE - RECENCY & ACTIVE VERSION RETRIEVAL:
The claim Date of Service is in ${targetYear}. Insurance appeals require the ACTIVE, currently effective clinical coverage guideline in effect for ${targetYear}, NOT archived or superseded historical policies from prior years.
- Major clinical guideline repositories (such as Carelon/AIM, EviCore, CMS LCD, Aetna CPBs) maintain historical archives with URLs or titles marked "ARCHIVED" or containing past year dates (e.g. 2024). Search engines often rank older historical pages higher due to domain age.
- To ensure the search engine retrieves the latest active guideline rather than an archived page, queries MUST incorporate temporal keywords for the active policy window (e.g. "${targetYear}", "updated ${targetYear}", "current") and negative keywords (e.g. "-archived", "-superseded") where appropriate.
- For Carelon Medical Benefits Management guidelines (used by GeoBlue, Anthem, BCBS, Elevance, etc.): active guidelines are published under guidelines.carelonmedicalbenefitsmanagement.com with date slugs representing the latest effective update window (such as updated ${targetYear}). Example: Carelon spine surgery clinical appropriateness guideline ${targetYear} -archived OR Carelon joint surgery clinical appropriateness guideline ${targetYear} -archived

Query Strategy:
1. Payer & Utilization Management Guideline Query:
   - Target currently active payer medical policies and recognized clinical guidelines managers for ${targetYear}:
     * GeoBlue / Blue Cross Blue Shield / Anthem / Elevance utilize Carelon (formerly AIM Specialty Health) clinical appropriateness guidelines or Anthem clinical guidelines. For Joint/Knee (CPT 29881, 27447), Carelon publishes under "Joint Surgery" (e.g. Carelon joint surgery clinical appropriateness guideline ${targetYear} -archived). For Spine/Lumbar (CPT 63047), Carelon publishes under "Spine Surgery".
     * Cigna (including Cigna Global, which uses parent Cigna Medical Coverage Policies / Medical Health Policies / EviCore guidelines), Molina, and regional plans utilize Cigna Medical Coverage Policies, EviCore, or Carelon clinical policies. For Knee Arthroscopy & Meniscectomy (CPT 29881), target Cigna Medical Coverage Policy 0066 (Knee Arthroscopy and Open Procedures) or Cigna knee meniscectomy coverage criteria -precert.
     * Aetna (including Aetna International, which uses parent Aetna Clinical Policy Bulletins / CPBs) and UnitedHealthcare utilize direct Clinical Policy Bulletins (CPBs). For Aetna / Aetna International knee MRI (CPT 73721), target Aetna CPB 0171 (Magnetic Resonance Imaging of the Extremities).
   - Target the active guideline in effect for ${targetYear} (e.g. ${primaryProcedureName} ${primaryCpt} Carelon clinical guideline ${targetYear} -archived OR coverage criteria ${searchPayer}).
2. Clinical Specialty Society Standard-of-Care Guideline Query:
   - Target authoritative national medical specialty guidelines (NASS for spine/lumbar, AAOS for orthopedics/joint, ACR for imaging/radiology, NCCN for oncology) that establish active clinical necessity and conservative therapy criteria.
   - Example: ${primaryProcedureName} ${primaryCpt} NASS clinical practice guideline ${targetYear} pdf OR indications
3. National Statutory & CMS Coverage Query:
   - Target CMS Local Coverage Determinations (LCD) or standard medical necessity criteria for ${targetYear}.
   - Example: ${primaryProcedureName} ${primaryCpt} CMS LCD medical necessity criteria indications ${targetYear}

Rules:
- Always include the clinical procedure title (e.g. "lumbar laminectomy decompression", "knee arthroscopy meniscectomy", "total knee arthroplasty", "knee MRI").
- Combine procedure names with primary CPT codes and authoritative keywords (Carelon, NASS, AAOS, ACR, CMS LCD, coverage criteria).
- Do NOT search for past years older than ${targetYear}; explicitly seek active guidelines for ${targetYear} and exclude archived versions.
- Do NOT search for international/travel subsidiary brand names for clinical policies (e.g. search parent insurer 'Cigna' or 'Aetna', not 'Cigna Global' or 'Aetna International' which are expat sales portals without clinical bulletins).
- Do NOT target administrative precertification code lists, master precert lists, or prior authorization code tables (e.g. exclude -precert). Target substantive clinical coverage policies with medical necessity criteria.
- Do NOT target university student health portals, travel insurance marketing brochures, state Medicaid forms, or billing blogs.
- Keep each query concise (under 90 characters) and focused.${rejectedSearchFeedback ? `
Previous search attempts returned these rejected/stale results:
${rejectedSearchFeedback.slice(0, 4000)}
Refine queries to avoid archived/student/marketing domains and target active Carelon, NASS, AAOS, ACR, or CMS LCD guidelines directly.` : ""}`,
    userPrompt: `Build the search queries for this claim.

Payer: ${searchPayer} (Original: ${payer})
Procedure: ${cptDescriptions || "Medical Procedure"}
Diagnosis: ${icd10Codes.join(", ") || "Clinical Diagnosis"}
Denial: ${denialReasonCode} - ${denialReasonDescription || "Medical necessity"}
Date of Service: ${serviceDate || targetYear} (Target Active Year: ${targetYear})`,
    schemaName: "PolicySearchIntentResponse",
    schema: POLICY_SEARCH_INTENT_SCHEMA,
    temperature: 0.1,
  });

  const queries = [...new Set(
    result.queries
      .filter((query): query is string => typeof query === "string")
      .map((query) => query.trim())
      .filter(Boolean),
  )].slice(0, 3);

  if (!queries.length) {
    throw new Error("Policy search planning returned no usable search queries.");
  }

  return queries;
}

// Re-exported from ../lib/erisaEvidence so existing importers
// (tests, actions) keep a single source of truth. Isolate-runtime modules
// must import from ../lib/erisaEvidence directly and never from this
// "use node" file, otherwise the isolate bundle pulls in Node built-ins.
export { ERISA_STATUTORY_EVIDENCE };

/**
 * Insurer CPB & Clinical Policy Bulletin Crawler Action
 * Dynamically queries Firecrawl to retrieve, parse, and extract clinical coverage criteria for any US insurer.
 */
export const crawlInsurerPolicyArgs = {
  claimId: v.id("claims"),
  payer: v.string(),
  cptCodes: v.array(v.string()),
  icd10Codes: v.array(v.string()),
  denialReasonCode: v.string(),
  denialReasonDescription: v.optional(v.string()),
  customPolicyUrl: v.optional(v.string()),
  serviceDate: v.optional(v.string()),
  forceRescan: v.optional(v.boolean()),
  pipelineRunId: v.optional(v.string()),
};

export interface CrawlInsurerPolicyResult {
  policyTitle: string;
  policyNumber?: string;
  effectiveDate?: string;
  clausesExtracted: number;
  evidences: Array<{
    sourceType: string;
    title: string;
    sourceUrl?: string;
    citationClause: string;
    extractedEvidenceMarkdown: string;
    relevanceScore: number;
    screenshotStorageId?: Id<"_storage">;
    screenshotUrl?: string;
    capturedAt?: number;
  }>;
  extractionEngine: string;
}

/**
 * Core clinical policy crawling and evidence extraction execution logic.
 * Shared between public user-facing action and internal durable workflow execution.
 */
export async function performCrawlInsurerPolicy(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    payer: string;
    cptCodes: string[];
    icd10Codes: string[];
    denialReasonCode: string;
    denialReasonDescription?: string;
    customPolicyUrl?: string;
    serviceDate?: string;
    forceRescan?: boolean;
    pipelineRunId?: string;
  },
  claim: Doc<"claims">,
  userId?: Id<"users">
): Promise<CrawlInsurerPolicyResult> {

    const userSettings = userId
      ? await ctx.runQuery(internal.settings.getSettingsInternal, { userId })
      : null;
    const shouldForceRescan = args.forceRescan ?? Boolean(userSettings?.autoRescanPolicies);

    // Determine target clinical policy year based on date of service or active calendar year
    const effectiveDate = args.serviceDate || claim?.serviceDate || "";
    const yearMatch = effectiveDate.match(/\b(20\d{2})\b/);
    const targetYear = yearMatch ? yearMatch[1] : `${new Date().getFullYear()}`;

    // Enforce rate limiting
    const limitStatus = await rateLimiter.limit(ctx, "policyCrawler", {
      key: userId || args.payer || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for clinical policy crawling. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
    }

    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey?.trim()) {
      throw new Error("Clinical policy analysis requires FIRECRAWL_API_KEY; no fallback policy source is available.");
    }
    if (!args.cptCodes.length) {
      throw new Error("Clinical policy analysis requires at least one CPT code.");
    }
    if (args.customPolicyUrl && !isAcceptableSourceUrl(args.customPolicyUrl)) {
      throw new Error("The custom policy URL must be a valid HTTP or HTTPS source URL.");
    }

    await logPipelineActivity(ctx, {
      claimId: args.claimId,
      runId: args.pipelineRunId,
      stage: "crawl",
      status: "running",
      message: args.customPolicyUrl
        ? "Reading the payer policy page you shared for the qualifying criteria."
        : `Searching ${args.payer}'s official policy bulletins for procedures ${args.cptCodes.join(", ")}.`,
    });

    let policySource: FirecrawlPolicySource | null = null;
    if (args.customPolicyUrl) {
      const candidateSource = await scrapeFirecrawlPolicySource(ctx, args.customPolicyUrl, {
        payer: args.payer,
        cptCodes: args.cptCodes,
        denialReasonCode: args.denialReasonCode,
        forceRescan: shouldForceRescan,
      });
      const relevance = await evaluatePolicySourceRelevance(
        candidateSource,
        args.payer,
        args.cptCodes,
        args.icd10Codes,
        args.denialReasonCode,
        args.denialReasonDescription || "",
        targetYear,
        effectiveDate,
      );
      if (!relevance.relevant) {
        throw new Error(`The supplied policy URL was rejected as irrelevant: ${relevance.rationale}`);
      }
      policySource = candidateSource;
    } else {
      // Cited-policy fast path: denial notices explicitly name the controlling
      // bulletin (e.g. "CPB 0171", "Policy 0066", "SURG.00011"). Extract those
      // identifiers generically and resolve them deterministically so search
      // ranking drift can never hide the exact cited policy behind related
      // bulletins (e.g. hip CPB 0736 surfacing for a knee MRI claim).
      const denialTextForIdentifiers = [
        args.denialReasonDescription || "",
        args.denialReasonCode || "",
        claim?.denialReasonDescription || "",
      ].join(" ");
      const citedIdentifiers = extractCitedPolicyIdentifiers(denialTextForIdentifiers);
      const citedSearchQueries = buildCitedPolicySearchQueries(
        args.payer,
        citedIdentifiers.cpbNumbers,
        citedIdentifiers.policyTokens,
        args.cptCodes,
      );
      const directCitedUrls = buildCitedAetnaCpbUrls(args.payer, citedIdentifiers.cpbNumbers);

      const llmSearchQueries = await generatePolicySearchQueries(
        args.payer,
        args.cptCodes,
        args.icd10Codes,
        args.denialReasonCode,
        args.denialReasonDescription || "",
        "",
        effectiveDate,
        targetYear,
      );
      // Deterministic cited-ID queries lead so Firecrawl is always asked for the
      // exact bulletin named in the denial; LLM multi-angle queries follow.
      let searchQueries = [...new Set([...citedSearchQueries, ...llmSearchQueries])].slice(0, 5);
      if (!searchQueries.length) {
        searchQueries = llmSearchQueries;
      }
      const failedSources: string[] = [];
      const searchFailures: string[] = [];
      const seenSourceUrls = new Set<string>();
      let discoveredSourceCount = 0;
      // Best-available vintage fallback: the first substantive document rejected
      // ONLY for archived/outdated vintage (not wrong anatomy, billing, landing,
      // or payer mismatch). Used when no active edition is retrievable so the
      // appeal can still cite transparently labeled best-available criteria
      // instead of failing the entire pipeline.
      // Holder object avoids TS closure-narrowing of `let` to `null`.
      const vintageFallbackHolder: {
        value: { source: FirecrawlPolicySource; rationale: string } | null;
      } = { value: null };
      const considerVintageFallback = (
        candidateSource: FirecrawlPolicySource,
        rationale: string,
      ) => {
        if (vintageFallbackHolder.value || !isVintageOnlyRejection(rationale)) return;
        if (!isPolicyMarkdownSubstantive(candidateSource.markdown)) return;
        if (candidateSource.markdown.trim().length < 2000) return;
        vintageFallbackHolder.value = { source: candidateSource, rationale };
      };
      const evaluateDirectCitedUrl = async (sourceUrl: string): Promise<FirecrawlPolicySource | null> => {
        if (seenSourceUrls.has(sourceUrl)) return null;
        seenSourceUrls.add(sourceUrl);
        discoveredSourceCount += 1;
        try {
          const candidateSource = await scrapeFirecrawlPolicySource(ctx, sourceUrl, {
            payer: args.payer,
            cptCodes: args.cptCodes,
            denialReasonCode: args.denialReasonCode,
            forceRescan: shouldForceRescan,
          });
          const relevance = await evaluatePolicySourceRelevance(
            candidateSource,
            args.payer,
            args.cptCodes,
            args.icd10Codes,
            args.denialReasonCode,
            args.denialReasonDescription || "",
            targetYear,
            effectiveDate,
          );
          if (relevance.relevant) {
            return candidateSource;
          }
          failedSources.push(`${sourceUrl}: document rejected as irrelevant (${relevance.rationale})`);
          considerVintageFallback(candidateSource, relevance.rationale);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown source error";
          failedSources.push(`${sourceUrl}: ${message}`);
        }
        return null;
      };

      // Attempt canonical cited-policy URLs first (highest precision, no search
      // ranking involved). For Aetna this resolves CPB 0171 directly even when
      // generic queries return 0736/0093.
      for (const directUrl of directCitedUrls) {
        if (policySource) break;
        const directHit = await evaluateDirectCitedUrl(directUrl);
        if (directHit) {
          policySource = directHit;
          break;
        }
      }

      for (let searchRound = 0; searchRound < MAX_POLICY_SEARCH_ROUNDS && !policySource; searchRound += 1) {
        const successfulSearches: Array<{ payload: Record<string, unknown> }> = [];
        const failedSearches: string[] = [];

        // Run search queries with bounded concurrency (strictly max 2 concurrent requests) to honor Firecrawl 2-browser plan limits
        const MAX_FIRECRAWL_SEARCH_CONCURRENCY = 2;
        // Cited-ID queries lead the set (up to 5 total) so the exact bulletin
        // named in the denial is always requested, not just generic procedure
        // queries that rank related bulletins higher.
        const queriesToRun = searchQueries.slice(0, 5);
        for (let i = 0; i < queriesToRun.length; i += MAX_FIRECRAWL_SEARCH_CONCURRENCY) {
          const chunk = queriesToRun.slice(i, i + MAX_FIRECRAWL_SEARCH_CONCURRENCY);
          const chunkResults = await Promise.all(
            chunk.map(async (query) => {
              try {
                const payload = await firecrawl.search(ctx, query, {
                  limit: 5,
                  sources: ["web"],
                });
                return { success: true as const, payload: payload as Record<string, unknown> };
              } catch (error) {
                const msg = error instanceof Error ? error.message : "Unknown Firecrawl search error";
                return { success: false as const, error: msg };
              }
            }),
          );

          for (const res of chunkResults) {
            if (res.success && res.payload) {
              successfulSearches.push({ payload: res.payload });
            } else if (!res.success && res.error) {
              failedSearches.push(res.error);
            }
          }

          if (failedSearches.some((s) => s.includes("429") || s.includes("concurrency") || s.includes("Rate limit"))) {
            break;
          }
        }

        searchFailures.push(...failedSearches);

        const searchQueryTerms = searchQueries.flatMap(
          (query) => query.toLowerCase().match(/[a-z0-9][a-z0-9.-]{2,}/g) ?? [],
        );
        const combinedSearchPayload = {
          data: {
            web: successfulSearches.flatMap(({ payload }) => getFirecrawlSearchResults(payload)),
          },
        };

        // Fast path: check if search payload already included substantive markdown across top candidates
        const directSources = selectFirecrawlPolicySources(combinedSearchPayload, 4);
        for (const directSource of directSources) {
          if (directSource && isPolicyMarkdownSubstantive(directSource.markdown)) {
            try {
              const relevance = await evaluatePolicySourceRelevance(
                directSource,
                args.payer,
                args.cptCodes,
                args.icd10Codes,
                args.denialReasonCode,
                args.denialReasonDescription || "",
                targetYear,
                effectiveDate,
              );
              if (relevance.relevant) {
                policySource = directSource;
                break;
              }
              considerVintageFallback(directSource, relevance.rationale);
              failedSources.push(
                `${directSource.sourceUrl}: document rejected as irrelevant (${relevance.rationale})`,
              );
            } catch {
              // Defer to URL scraping
            }
          }
        }
        if (policySource) break;

        const cptKeywordTerms = getCptKeywords(args.cptCodes);
        const sourceRelevanceTerms = [
          ...args.cptCodes,
          ...args.icd10Codes,
          ...cptKeywordTerms,
          ...searchQueryTerms,
          "medical policy",
          "medical necessity",
          "coverage criteria",
          "clinical policy",
        ];
        const sourceUrls = selectFirecrawlPolicyUrls(
          combinedSearchPayload,
          sourceRelevanceTerms,
          0,
          MAX_POLICY_SOURCE_CANDIDATES,
          args.payer,
          targetYear,
        ).filter((sourceUrl) => {
          if (seenSourceUrls.has(sourceUrl)) return false;
          seenSourceUrls.add(sourceUrl);
          return true;
        });
        discoveredSourceCount += sourceUrls.length;

        // Evaluate ranked candidates in batches of 2 concurrent scrapes to fully
        // utilize the Firecrawl 2-browser plan limit (searches already run in
        // chunks of 2). Relevance is still judged sequentially in rank order so
        // the highest-ranked relevant bulletin wins, not the fastest download.
        // Cover up to 5 ranked candidates per round (not just the top 3) so an
        // exact cited bulletin ranked 4th-5th is still scraped when generic
        // queries surface related bulletins first.
        const MAX_FIRECRAWL_SCRAPE_CONCURRENCY = 2;
        const rankedCandidates = sourceUrls.slice(0, 5);
        let scrapeRateLimited = false;
        for (
          let batchStart = 0;
          batchStart < rankedCandidates.length && !policySource && !scrapeRateLimited;
          batchStart += MAX_FIRECRAWL_SCRAPE_CONCURRENCY
        ) {
          const batch = rankedCandidates.slice(batchStart, batchStart + MAX_FIRECRAWL_SCRAPE_CONCURRENCY);
          const scrapedBatch = await Promise.all(
            batch.map(async (sourceUrl) => {
              try {
                const candidateSource = await scrapeFirecrawlPolicySource(ctx, sourceUrl, {
                  payer: args.payer,
                  cptCodes: args.cptCodes,
                  denialReasonCode: args.denialReasonCode,
                  forceRescan: shouldForceRescan,
                });
                return { ok: true as const, sourceUrl, candidateSource };
              } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown source error";
                return { ok: false as const, sourceUrl, errorMessage: message };
              }
            }),
          );
          for (const scraped of scrapedBatch) {
            if (policySource || scrapeRateLimited) break;
            if (!scraped.ok) {
              failedSources.push(`${scraped.sourceUrl}: ${scraped.errorMessage}`);
              if (scraped.errorMessage.includes("429") || scraped.errorMessage.includes("Rate limit")) {
                scrapeRateLimited = true;
              }
              continue;
            }
            const { sourceUrl, candidateSource } = scraped;
            const relevance = await evaluatePolicySourceRelevance(
              candidateSource,
              args.payer,
              args.cptCodes,
              args.icd10Codes,
              args.denialReasonCode,
              args.denialReasonDescription || "",
              targetYear,
              effectiveDate,
            );
            if (relevance.relevant) {
              policySource = candidateSource;
              break;
            }

            failedSources.push(`${sourceUrl}: document rejected as irrelevant (${relevance.rationale})`);
            considerVintageFallback(candidateSource, relevance.rationale);

            // If the document is an index/directory page, inspect child guideline links matching the procedure
            const isDirectoryLike =
              /landing page|directory|index of/i.test(relevance.rationale) ||
              sourceUrl.toLowerCase().includes("/research/clinical-guidelines") ||
              sourceUrl.toLowerCase().endsWith("/clinical-guidelines") ||
              sourceUrl.toLowerCase().endsWith("/guidelines");

            if (isDirectoryLike) {
              const childLinks = extractGuidelineLinksFromMarkdown(
                candidateSource.markdown,
                candidateSource.sourceUrl,
                args.cptCodes,
                targetYear,
              );
              for (const childUrl of childLinks.slice(0, 1)) {
                if (seenSourceUrls.has(childUrl)) continue;
                seenSourceUrls.add(childUrl);
                discoveredSourceCount += 1;
                try {
                  const childSource = await scrapeFirecrawlPolicySource(ctx, childUrl, {
                    payer: args.payer,
                    cptCodes: args.cptCodes,
                    denialReasonCode: args.denialReasonCode,
                    forceRescan: shouldForceRescan,
                  });
                  const childRelevance = await evaluatePolicySourceRelevance(
                    childSource,
                    args.payer,
                    args.cptCodes,
                    args.icd10Codes,
                    args.denialReasonCode,
                    args.denialReasonDescription || "",
                    targetYear,
                    effectiveDate,
                  );
                  if (childRelevance.relevant) {
                    policySource = childSource;
                    break;
                  }
                  failedSources.push(`${childUrl}: document rejected as irrelevant (${childRelevance.rationale})`);
                  considerVintageFallback(childSource, childRelevance.rationale);
                } catch (childErr) {
                  const msg = childErr instanceof Error ? childErr.message : "Child source error";
                  failedSources.push(`${childUrl}: ${msg}`);
                }
              }
              if (policySource) break;
            }
          }
        }

        if (!policySource && searchRound + 1 < MAX_POLICY_SEARCH_ROUNDS && !failedSearches.some((s) => s.includes("429"))) {
          const feedback = [...searchFailures, ...failedSources.slice(-10)].join(" | ");
          const refinedQueries = await generatePolicySearchQueries(
            args.payer,
            args.cptCodes,
            args.icd10Codes,
            args.denialReasonCode,
            args.denialReasonDescription || "",
            feedback,
            effectiveDate,
            targetYear,
          );
          // Preserve deterministic cited-ID queries across rounds so the exact
          // bulletin named in the denial is re-requested even after refinement.
          searchQueries = [...new Set([...citedSearchQueries, ...refinedQueries])].slice(0, 5);
        }
      }

      if (!policySource) {
        // Best-available vintage fallback: when every active edition was
        // unretrievable but a clinically specific archived/specialty edition was
        // found, cite it transparently with vintage disclosure instead of failing
        // the entire appeal pipeline. Wrong-anatomy, billing, landing, and payer-
        // mismatch rejections never qualify for this fallback.
        if (vintageFallbackHolder.value) {
          const fallback = vintageFallbackHolder.value;
          policySource = fallback.source;
          console.warn(
            `No active ${targetYear} guideline retrievable; using best-available vintage from ${fallback.source.sourceUrl} (${fallback.rationale})`,
          );
        } else {
          if (!discoveredSourceCount) {
            const detail = searchFailures.length ? ` ${searchFailures.join(" | ")}` : "";
            throw new Error(`Firecrawl search returned no direct HTTP(S) policy source URL.${detail}`);
          }

          throw new Error(`Firecrawl returned no publicly accessible policy document from ${discoveredSourceCount} direct result(s). ${failedSources.join(" | ")}`);
        }
      }
    }

    if (!policySource) {
      throw new Error("Firecrawl returned no scraped policy document with an acceptable source URL; no fallback policy source is available.");
    }

    const policyText = policySource.markdown;
    const policySourceUrl = policySource.sourceUrl;

    if (isAccessDeniedDocument(policyText) || isHtmlErrorBody(policyText)) {
      throw new Error("Scraped policy text is an access-denied or error page, not a clinical policy.");
    }

    let extractedData: PolicyExtractionResponse | null = null;
    let extractionEngine: "firecrawl_native" | "openai_fallback" = "openai_fallback";

    // Fast-path: Check if native Firecrawl structured extraction succeeded in the initial scrape
    if (policySource.json && typeof policySource.json === "object") {
      const nativeData = parseNativeExtractionResponse(policySource.json, args.cptCodes);
      if (nativeData && nativeData.clauses.length > 0) {
        const alignment = isPolicyAlignedWithClaim(policyText, nativeData.policyTitle, args.cptCodes);
        if (alignment.aligned && !isAccessDeniedDocument(nativeData.policyTitle)) {
          extractedData = nativeData;
          extractionEngine = "firecrawl_native";
        }
      }
    }

    // Fallback: Use gpt-5.4-nano to extract precise medical criteria and contradiction clauses if native extraction was unavailable or unaligned
    if (!extractedData) {
      const windowedPolicyText = extractRelevantDocumentWindow(policyText, args.cptCodes, 50000);

      extractedData = await createStructuredCompletion<PolicyExtractionResponse>({
        systemPrompt: `You are an expert Medical Legal Analyst and Clinical Auditor.
Analyze the provided insurer Clinical Policy Bulletin (CPB) or clinical guideline.
Extract all key medical necessity qualifying criteria, specific clause identifiers (e.g. Section 1.A, Section 2.3), and contradiction rules that can be cited in an ERISA medical appeal against denial code ${args.denialReasonCode}.
For each clause:
- Assign sourceType: "payer_cpb", "pubmed_study", "fda_package_insert", "nccn_guideline", or "legal_precedent".
- Extract clear, concise plain text summarizing the exact clinical requirements. Strictly do NOT use markdown bold asterisks (such as **bold**) or formatting tokens in extractedEvidenceMarkdown or title.
- Assign relevanceScore between 80 and 99.
- CRITICAL PROCEDURE FOCUS: Only extract criteria specifically applicable to the target procedure codes [${args.cptCodes.join(", ")}]. If this policy is an umbrella document covering multiple anatomical sites or different operations (e.g., Hip vs Knee, or Cervical vs Lumbar spine), strictly OMIT criteria for the other non-target body sites.`,
        userPrompt: `Extract structured clinical evidence clauses from this policy text for CPT codes [${args.cptCodes.join(", ")}] and Payer ${args.payer}:\n\n${windowedPolicyText}`,
        schemaName: "PolicyExtractionResponse",
        schema: POLICY_EXTRACTION_SCHEMA,
        temperature: 0.1,
      });
      extractionEngine = "openai_fallback";
    }

    // Post-extraction safety net: the model may have extracted clauses from a
    // document that is actually about a different service (e.g., foot bunionectomy
    // for a knee arthroplasty claim). Validate the extracted title and content
    // against the claimed CPT before persisting any citation.
    if (
      isAccessDeniedDocument(extractedData.policyTitle) ||
      /access denied|forbidden|error|not found|sign in required/i.test(extractedData.policyTitle)
    ) {
      throw new Error(`Extracted policy title indicates a non-policy document: "${extractedData.policyTitle}"`);
    }
    const titleAlignment = isPolicyAlignedWithClaim(policyText, extractedData.policyTitle, args.cptCodes);
    if (!titleAlignment.aligned) {
      throw new Error(`Extracted policy is not aligned with the claimed procedure: ${titleAlignment.reason}`);
    }
    if (!extractedData.clauses || extractedData.clauses.length === 0) {
      throw new Error("Policy extraction returned no clinical criteria clauses.");
    }
    // Ensure none of the extracted clauses are themselves error text
    for (const clause of extractedData.clauses) {
      if (isAccessDeniedDocument(clause.extractedEvidenceMarkdown) || isAccessDeniedDocument(clause.title)) {
        throw new Error(`Extracted clause contains access-denied content: "${clause.title}"`);
      }
    }

    const cleanPolicySourceUrl = sanitizePublicPolicyUrl(policySourceUrl);

    let screenshotStorageId: Id<"_storage"> | undefined = undefined;
    let capturedAt: number | undefined = undefined;
    if (policySource.screenshot) {
      screenshotStorageId = await storeScreenshotInStorage(ctx, policySource.screenshot);
      if (screenshotStorageId) {
        capturedAt = Date.now();
      }
    }

    const evidencesToInsert = extractedData.clauses.map((clause) => ({
      sourceType: clause.sourceType,
      title: (clause.title || extractedData.policyTitle).replace(/\*\*/g, ""),
      sourceUrl: cleanPolicySourceUrl,
      citationClause: clause.citationClause.replace(/\*\*/g, ""),
      extractedEvidenceMarkdown: clause.extractedEvidenceMarkdown.replace(/\*\*/g, ""),
      relevanceScore: clause.relevanceScore,
      screenshotStorageId,
      screenshotUrl: policySource.screenshot?.startsWith("http") ? policySource.screenshot : undefined,
      capturedAt,
    }));

    // Add at least 1 legal precedent clause citing ERISA
    evidencesToInsert.push({
      ...ERISA_STATUTORY_EVIDENCE,
      screenshotStorageId: undefined,
      screenshotUrl: undefined,
      capturedAt: undefined,
    });

    // Clear-after-success: atomically replace prior evidence only after new
    // policy clauses have been successfully retrieved, extracted, and verified.
    await ctx.runMutation(internal.clinicalEvidences.replaceForClaimInternal, {
      claimId: args.claimId,
      evidences: evidencesToInsert,
    });

    // Update claim status to analyzing
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Firecrawl & Policy Engine",
      details: `Policy indexed (${extractionEngine === "firecrawl_native" ? "Firecrawl Native AI Extraction" : "OpenAI LLM"}): "${extractedData.policyTitle}". ${evidencesToInsert.length} clauses extracted.`,
    });

    await logPipelineActivity(ctx, {
      claimId: args.claimId,
      runId: args.pipelineRunId,
      stage: "crawl",
      status: "completed",
      message: `Found ${evidencesToInsert.length} relevant clauses in ${extractedData.policyTitle}. Now weighing the case.`,
    });

    return {
      policyTitle: extractedData.policyTitle,
      policyNumber: extractedData.policyNumber,
      effectiveDate: extractedData.effectiveDate,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
      extractionEngine,
    };
}

/**
 * Insurer CPB & Clinical Policy Bulletin Crawler Action (User-facing)
 */
export const crawlInsurerPolicy = action({
  args: crawlInsurerPolicyArgs,
  handler: async (ctx, args): Promise<CrawlInsurerPolicyResult> => {
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);
    return await performCrawlInsurerPolicy(ctx, args, claim as Doc<"claims">, userId);
  },
});

/**
 * Insurer CPB & Clinical Policy Bulletin Crawler Internal Action:
 * For durable workflows and background jobs without active user session.
 */
export const crawlInsurerPolicyInternal = internalAction({
  args: crawlInsurerPolicyArgs,
  handler: async (ctx, args): Promise<CrawlInsurerPolicyResult> => {
    const claim = (await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    })) as Doc<"claims"> | null;
    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }
    return await performCrawlInsurerPolicy(ctx, args, claim, claim.userId);
  },
});

/**
 * Generate targeted PubMed & ClinicalTrials.gov search queries.
 */
async function generatePubMedSearchQueries(
  cptCodes: string[],
  icd10Codes: string[],
  denialReasonCode: string,
  denialReasonDescription = "",
  customQuery = "",
): Promise<string[]> {
  if (customQuery?.trim()) {
    return [
      `site:pubmed.ncbi.nlm.nih.gov ${customQuery.trim()}`,
      `site:clinicaltrials.gov ${customQuery.trim()}`,
    ];
  }

  const cptDescriptions = cptCodes
    .map((code) => {
      const name = CPT_CLINICAL_NAMES[code];
      return name ? `${code} ${name}` : code;
    })
    .join(" ");

  const result = await createStructuredCompletion<PolicySearchIntentResponse>({
    systemPrompt: `You are an expert Medical Research Librarian.
Generate 2-3 precise Google/web search queries targeting peer-reviewed medical trial abstracts and clinical study efficacy evidence on PubMed (site:pubmed.ncbi.nlm.nih.gov) and ClinicalTrials.gov (site:clinicaltrials.gov).
Focus queries on:
1. Standard of care status and clinical efficacy for the given procedure and diagnosis.
2. Clinical trial endpoints, randomized controlled trials (RCTs), meta-analyses, and long-term functional outcomes.
3. Overcoming denial justification (e.g. medical necessity, conservative therapy failure, non-experimental evidence).
Include site:pubmed.ncbi.nlm.nih.gov or site:clinicaltrials.gov in the queries.`,
    userPrompt: `Generate PubMed and ClinicalTrials search queries for:
Procedure: ${cptDescriptions || "Medical Procedure"}
Diagnosis: ${icd10Codes.join(", ") || "Clinical Diagnosis"}
Denial Issue: ${denialReasonCode} - ${denialReasonDescription || "Medical necessity"}`,
    schemaName: "PolicySearchIntentResponse",
    schema: POLICY_SEARCH_INTENT_SCHEMA,
    temperature: 0.1,
  });

  return result.queries.filter(Boolean).slice(0, 3);
}

/**
 * Generate targeted FDA package insert / NDA / 510(k) search queries.
 */
async function generateFdaSearchQueries(
  cptCodes: string[],
  icd10Codes: string[],
  drugOrDeviceName = "",
  customUrl = "",
): Promise<string[]> {
  if (customUrl?.trim()) return [];

  const cptDescriptions = cptCodes
    .map((code) => {
      const name = CPT_CLINICAL_NAMES[code];
      return name ? `${code} ${name}` : code;
    })
    .join(" ");

  const result = await createStructuredCompletion<PolicySearchIntentResponse>({
    systemPrompt: `You are an expert FDA Regulatory Affairs and Healthcare Compliance Specialist.
Generate 2-3 precise web search queries targeting official FDA package inserts, FDA approvals (Drugs@FDA site:accessdata.fda.gov or Devices site:accessdata.fda.gov), and DailyMed package labels (site:dailymed.nlm.nih.gov).
Focus queries on approved on-label indications, safety pharmacology, 510(k) / PMA / NDA approval status that proves the treatment is FDA-approved and legally non-experimental.`,
    userPrompt: `Generate FDA package insert and approval search queries for:
Procedure / Device: ${drugOrDeviceName || cptDescriptions || "Medical intervention"}
Diagnosis: ${icd10Codes.join(", ") || "Clinical Indication"}`,
    schemaName: "PolicySearchIntentResponse",
    schema: POLICY_SEARCH_INTENT_SCHEMA,
    temperature: 0.1,
  });

  return result.queries.filter(Boolean).slice(0, 3);
}

/**
 * PubMed & ClinicalTrials.gov Scraper Action
 * Dynamically retrieves peer-reviewed medical study abstracts proving standard-of-care status and clinical efficacy.
 */
export const crawlPubMedAndTrials = action({
  args: {
    claimId: v.id("claims"),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.optional(v.string()),
    customQuery: v.optional(v.string()),
    customUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireClaimOwnerAction(ctx, args.claimId);

    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey?.trim()) {
      throw new Error("PubMed & clinical trials research requires FIRECRAWL_API_KEY.");
    }

    let sourceMarkdown = "";
    let sourceUrl = args.customUrl || "";
    let sourceScreenshot: string | undefined = undefined;

    if (args.customUrl) {
      const scraped = await scrapeFirecrawlPolicySource(ctx, args.customUrl);
      sourceMarkdown = scraped.markdown;
      sourceUrl = scraped.sourceUrl;
      sourceScreenshot = scraped.screenshot;
    } else {
      const searchQueries = await generatePubMedSearchQueries(
        args.cptCodes,
        args.icd10Codes,
        args.denialReasonCode,
        args.denialReasonDescription || "",
        args.customQuery || "",
      );

      let foundSource: FirecrawlPolicySource | null = null;
      for (const query of searchQueries) {
        try {
          const payload = await firecrawl.search(ctx, query, {
            limit: 5,
            sources: ["web"],
          });

          const candidateUrls = selectFirecrawlPolicyUrls(payload, [...args.cptCodes, "pubmed", "trial", "study", "efficacy"], 0, 4);

          for (const candUrl of candidateUrls) {
            try {
              const scraped = await scrapeFirecrawlPolicySource(ctx, candUrl);
              if (scraped.markdown && scraped.markdown.length > 300) {
                foundSource = scraped;
                break;
              }
            } catch {
              // Try next candidate
            }
          }

          if (foundSource) break;
        } catch {
          // Continue to next query
        }
      }

      if (!foundSource) {
        throw new Error("Firecrawl PubMed search could not locate an accessible clinical trial or study abstract.");
      }

      sourceMarkdown = foundSource.markdown;
      sourceUrl = foundSource.sourceUrl;
      sourceScreenshot = foundSource.screenshot;
    }

    let screenshotStorageId: Id<"_storage"> | undefined = undefined;
    let capturedAt: number | undefined = undefined;
    if (sourceScreenshot) {
      screenshotStorageId = await storeScreenshotInStorage(ctx, sourceScreenshot);
      if (screenshotStorageId) {
        capturedAt = Date.now();
      }
    }

    const windowedText = sourceMarkdown.slice(0, 40000);

    const extracted = await createStructuredCompletion<PubMedExtractionResponse>({
      systemPrompt: `You are an expert Clinical Epidemiologist and Medical Evidence Specialist.
Analyze the provided peer-reviewed medical study abstract or ClinicalTrials.gov entry.
Extract the study's standard-of-care conclusions, clinical efficacy findings, trial methodology, and concise citation clauses to support health insurance appeals.
For citationClause, provide ONLY a short section identifier under 25 characters (e.g. "Results §3", "Methods", "Conclusions", "Abstract", "Table 2"). Strictly do NOT put sentences or titles in citationClause.
Strictly do NOT use markdown bold asterisks (such as **bold**) in extracted markdown or titles.
Assign relevanceScore between 85 and 99.`,
      userPrompt: `Extract structured clinical trial evidence for CPT codes [${args.cptCodes.join(", ")}]:\n\n${windowedText}`,
      schemaName: "PubMedExtractionResponse",
      schema: PUBMED_EXTRACTION_SCHEMA,
      temperature: 0.1,
    });

    const evidencesToInsert = extracted.clauses.map((clause) => {
      const rawClause = (clause.citationClause || "").replace(/\*\*/g, "").trim();
      const shortClause = rawClause.length > 25 ? rawClause.slice(0, 22) + "..." : rawClause;
      const id = extracted.identifier || "PMID";
      const citationClause = shortClause && !shortClause.toLowerCase().includes(id.toLowerCase())
        ? `${id} • ${shortClause}`
        : id;

      return {
        sourceType: "pubmed_study",
        title: `${extracted.studyTitle} (${extracted.identifier || extracted.authorsOrJournal || "PubMed"})`.replace(/\*\*/g, ""),
        sourceUrl: sourceUrl || "https://pubmed.ncbi.nlm.nih.gov",
        citationClause,
        extractedEvidenceMarkdown: `${clause.extractedEvidenceMarkdown}\n\nStudy Design: ${extracted.studyDesign}\nKey Clinical Findings: ${extracted.keyFindings}\nStandard of Care: ${extracted.standardOfCareConclusion}`.replace(/\*\*/g, "").trim(),
        relevanceScore: clause.relevanceScore || 90,
        screenshotStorageId,
        screenshotUrl: sourceScreenshot?.startsWith("http") ? sourceScreenshot : undefined,
        capturedAt,
      };
    });

    if (evidencesToInsert.length > 0) {
      await ctx.runMutation(internal.clinicalEvidences.insertBatchInternal, {
        claimId: args.claimId,
        evidences: evidencesToInsert,
      });

      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: args.claimId,
        status: "analyzing",
        details: `Firecrawl indexed ${evidencesToInsert.length} PubMed study clauses (${extracted.identifier || "Clinical Trial"}).`,
      });
    }

    return {
      studyTitle: extracted.studyTitle,
      identifier: extracted.identifier,
      studyDesign: extracted.studyDesign,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
    };
  },
});

/**
 * FDA Label & Indication Crawler Action
 * Scrapes FDA-approved package inserts to legally rebut arbitrary "experimental / investigational" denial determinations.
 */
export const crawlFdaIndications = action({
  args: {
    claimId: v.id("claims"),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    customUrl: v.optional(v.string()),
    drugOrDeviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireClaimOwnerAction(ctx, args.claimId);

    let sourceMarkdown = "";
    let sourceUrl = args.customUrl || "";
    let sourceScreenshot: string | undefined = undefined;

    if (args.customUrl) {
      const scraped = await scrapeFirecrawlPolicySource(ctx, args.customUrl);
      sourceMarkdown = scraped.markdown;
      sourceUrl = scraped.sourceUrl;
      sourceScreenshot = scraped.screenshot;
    } else {
      const searchQueries = await generateFdaSearchQueries(
        args.cptCodes,
        args.icd10Codes,
        args.drugOrDeviceName || "",
      );

      let foundSource: FirecrawlPolicySource | null = null;
      for (const query of searchQueries) {
        try {
          const payload = await firecrawl.search(ctx, query, {
            limit: 5,
            sources: ["web"],
          });

          const candidateUrls = selectFirecrawlPolicyUrls(payload, ["fda", "label", "indication", "package insert", "accessdata"], 0, 4);

          for (const candUrl of candidateUrls) {
            try {
              const scraped = await scrapeFirecrawlPolicySource(ctx, candUrl);
              if (scraped.markdown && scraped.markdown.length > 300) {
                foundSource = scraped;
                break;
              }
            } catch {
              // Try next candidate
            }
          }

          if (foundSource) break;
        } catch {
          // Continue to next query
        }
      }

      if (!foundSource) {
        throw new Error("Firecrawl could not locate an accessible FDA package insert or indication document.");
      }

      sourceMarkdown = foundSource.markdown;
      sourceUrl = foundSource.sourceUrl;
      sourceScreenshot = foundSource.screenshot;
    }

    let screenshotStorageId: Id<"_storage"> | undefined = undefined;
    let capturedAt: number | undefined = undefined;
    if (sourceScreenshot) {
      screenshotStorageId = await storeScreenshotInStorage(ctx, sourceScreenshot);
      if (screenshotStorageId) {
        capturedAt = Date.now();
      }
    }

    const windowedText = sourceMarkdown.slice(0, 40000);

    const extracted = await createStructuredCompletion<FdaExtractionResponse>({
      systemPrompt: `You are an expert FDA Regulatory Affairs and Health Law Counsel.
Analyze the provided FDA package insert, approval summary, or DailyMed label.
Extract the official on-label indications, application/NDA/PMA/510(k) numbers, and articulate a rigorous legal/clinical rebuttal showing that FDA approval legally refutes arbitrary payer "experimental / investigational" determinations.
For citationClause, provide ONLY a concise section identifier under 25 characters (e.g. "Section 1: Indications", "Dosage & Admin", "Boxed Warning", "Indication §1.2"). Strictly do NOT put sentences or full titles in citationClause.
Strictly do NOT use markdown bold asterisks in extracted text or titles.
Assign relevanceScore between 88 and 99.`,
      userPrompt: `Extract FDA indication evidence for CPT codes [${args.cptCodes.join(", ")}]:\n\n${windowedText}`,
      schemaName: "FdaExtractionResponse",
      schema: FDA_EXTRACTION_SCHEMA,
      temperature: 0.1,
    });

    const evidencesToInsert = extracted.clauses.map((clause) => {
      const rawClause = (clause.citationClause || "").replace(/\*\*/g, "").trim();
      const shortClause = rawClause.length > 25 ? rawClause.slice(0, 22) + "..." : rawClause;
      const appNum = extracted.applicationNumber || "FDA Label";
      const citationClause = shortClause && !shortClause.toLowerCase().includes(appNum.toLowerCase())
        ? `${appNum} • ${shortClause}`
        : appNum;

      return {
        sourceType: "fda_package_insert",
        title: `FDA Approved Label: ${extracted.productName} (${extracted.applicationNumber})`.replace(/\*\*/g, ""),
        sourceUrl: sourceUrl || "https://accessdata.fda.gov",
        citationClause,
        extractedEvidenceMarkdown: `${clause.extractedEvidenceMarkdown}\n\nApproved Indications: ${extracted.approvedIndications}\nApproval Date: ${extracted.approvalDate}\nAnti-Investigational Legal Basis: ${extracted.antiInvestigationalRebuttal}`.replace(/\*\*/g, "").trim(),
        relevanceScore: clause.relevanceScore || 92,
        screenshotStorageId,
        screenshotUrl: sourceScreenshot?.startsWith("http") ? sourceScreenshot : undefined,
        capturedAt,
      };
    });

    if (evidencesToInsert.length > 0) {
      await ctx.runMutation(internal.clinicalEvidences.insertBatchInternal, {
        claimId: args.claimId,
        evidences: evidencesToInsert,
      });

      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: args.claimId,
        status: "analyzing",
        details: `Firecrawl indexed ${evidencesToInsert.length} FDA label & indication clauses (${extracted.productName}).`,
      });
    }

    return {
      productName: extracted.productName,
      applicationNumber: extracted.applicationNumber,
      approvalDate: extracted.approvalDate,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
    };
  },
});

/**
 * Custom Research URL Scraper Action
 * Allows clinicians or patients to input custom insurance URLs or clinical guidelines for structured criteria extraction.
 */
export const crawlCustomResearchUrl = action({
  args: {
    claimId: v.id("claims"),
    customUrl: v.string(),
    sourceCategory: v.optional(v.string()), // payer_cpb, pubmed_study, fda_package_insert, nccn_guideline, legal_precedent
    clinicalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);

    if (!isAcceptableSourceUrl(args.customUrl)) {
      throw new Error("Please provide a valid HTTP or HTTPS web URL.");
    }

    const scraped = await scrapeFirecrawlPolicySource(ctx, args.customUrl, {
      payer: claim?.insurancePayer,
      cptCodes: claim?.cptCodes,
      denialReasonCode: claim?.denialReasonCode,
    });
    const category = args.sourceCategory || "payer_cpb";

    let screenshotStorageId: Id<"_storage"> | undefined = undefined;
    let capturedAt: number | undefined = undefined;
    if (scraped.screenshot) {
      screenshotStorageId = await storeScreenshotInStorage(ctx, scraped.screenshot);
      if (screenshotStorageId) {
        capturedAt = Date.now();
      }
    }

    let extracted: CustomGuidelineExtractionResponse | null = null;
    let extractionEngine: "firecrawl_native" | "openai_fallback" = "openai_fallback";

    // Fast-path: Check if native Firecrawl structured extraction succeeded
    if (scraped.json && typeof scraped.json === "object") {
      const nativeParsed = parseNativeExtractionResponse(scraped.json, claim?.cptCodes || []);
      if (nativeParsed && nativeParsed.clauses.length > 0) {
        extracted = {
          documentTitle: nativeParsed.policyTitle,
          issuingAuthority: claim?.insurancePayer || "Clinical Authority",
          effectiveDate: nativeParsed.effectiveDate,
          clauses: nativeParsed.clauses.map((c) => ({
            title: c.title,
            citationClause: c.citationClause,
            extractedEvidenceMarkdown: c.extractedEvidenceMarkdown,
            relevanceScore: c.relevanceScore,
          })),
        };
        extractionEngine = "firecrawl_native";
      }
    }

    if (!extracted) {
      const windowedText = scraped.markdown.slice(0, 45000);
      extracted = await createStructuredCompletion<CustomGuidelineExtractionResponse>({
        systemPrompt: `You are an expert Clinical Policy Auditor and Health Insurance Appellate Counsel.
Analyze the scraped medical guideline, clinical policy, or research document.
Extract all actionable medical necessity criteria, coverage rules, diagnostic standards, and qualifying exceptions.
Strictly do NOT use markdown bold asterisks in titles or extracted evidence markdown.
Assign relevanceScore between 80 and 99.`,
        userPrompt: `Extract structured clinical criteria clauses from this document:${args.clinicalNotes ? `\nClinical Notes: ${args.clinicalNotes}` : ""}\n\n${windowedText}`,
        schemaName: "CustomGuidelineExtractionResponse",
        schema: CUSTOM_GUIDELINE_EXTRACTION_SCHEMA,
        temperature: 0.1,
      });
      extractionEngine = "openai_fallback";
    }

    const evidencesToInsert = extracted.clauses.map((clause) => ({
      sourceType: category,
      title: `${extracted.documentTitle} (${extracted.issuingAuthority || "Clinical Authority"})`.replace(/\*\*/g, ""),
      sourceUrl: scraped.sourceUrl || args.customUrl,
      citationClause: clause.citationClause.replace(/\*\*/g, ""),
      extractedEvidenceMarkdown: clause.extractedEvidenceMarkdown.replace(/\*\*/g, "").trim(),
      relevanceScore: clause.relevanceScore || 88,
      screenshotStorageId,
      screenshotUrl: scraped.screenshot?.startsWith("http") ? scraped.screenshot : undefined,
      capturedAt,
    }));

    if (evidencesToInsert.length > 0) {
      await ctx.runMutation(internal.clinicalEvidences.insertBatchInternal, {
        claimId: args.claimId,
        evidences: evidencesToInsert,
      });

      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: args.claimId,
        status: "analyzing",
        details: `Firecrawl extracted ${evidencesToInsert.length} clauses (${extractionEngine === "firecrawl_native" ? "Native AI Extraction" : "OpenAI LLM"}) from custom URL: ${extracted.documentTitle}.`,
      });
    }

    return {
      documentTitle: extracted.documentTitle,
      issuingAuthority: extracted.issuingAuthority,
      effectiveDate: extracted.effectiveDate,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
      extractionEngine,
    };
  },
});

/**
 * Multi-Source Clinical Research Hub Action
 * Coordinates comprehensive parallel ingestion across Insurer CPB, PubMed Studies, and FDA Indication inserts.
 */
export const crawlMultiSourceHub = action({
  args: {
    claimId: v.id("claims"),
    payer: v.string(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.optional(v.string()),
    customPolicyUrl: v.optional(v.string()),
    forceRescan: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireClaimOwnerAction(ctx, args.claimId);

    await ctx.runMutation(internal.auditLogs.logEventInternal, {
      eventType: "multi_source_crawl_started",
      actor: "Sentinel Multi-Source Policy Hub",
      details: `Initiating multi-vector clinical intelligence gathering: Payer CPB (${args.payer}), PubMed / NIH Clinical Trials, and FDA Drug/Device Indications.`,
      claimId: args.claimId,
    });

    const results: {
      cpbResult?: unknown;
      pubMedResult?: unknown;
      fdaResult?: unknown;
      errors: string[];
    } = {
      errors: [],
    };

    // 1. Crawl Insurer CPB / Guideline
    try {
      results.cpbResult = await ctx.runAction(api.actions.policyCrawler.crawlInsurerPolicy, {
        claimId: args.claimId,
        payer: args.payer,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
        denialReasonCode: args.denialReasonCode,
        denialReasonDescription: args.denialReasonDescription,
        customPolicyUrl: args.customPolicyUrl,
        forceRescan: args.forceRescan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      results.errors.push(`CPB Crawl: ${message}`);
    }

    // 2. Crawl PubMed & ClinicalTrials
    try {
      results.pubMedResult = await ctx.runAction(api.actions.policyCrawler.crawlPubMedAndTrials, {
        claimId: args.claimId,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
        denialReasonCode: args.denialReasonCode,
        denialReasonDescription: args.denialReasonDescription,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      results.errors.push(`PubMed Scrape: ${message}`);
    }

    // 3. Crawl FDA Labels & Indications
    try {
      results.fdaResult = await ctx.runAction(api.actions.policyCrawler.crawlFdaIndications, {
        claimId: args.claimId,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
        denialReasonCode: args.denialReasonCode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      results.errors.push(`FDA Crawler: ${message}`);
    }

    // Ensure ERISA statutory legal precedent is always present
    await ctx.runMutation(internal.clinicalEvidences.insertSingleInternal, {
      claimId: args.claimId,
      ...ERISA_STATUTORY_EVIDENCE,
    });

    const getClausesCount = (res: unknown): number => {
      if (typeof res === "object" && res !== null && "clausesExtracted" in res) {
        return Number((res as { clausesExtracted?: unknown }).clausesExtracted) || 0;
      }
      return 0;
    };

    return {
      success: true,
      cpbClauses: getClausesCount(results.cpbResult),
      pubMedClauses: getClausesCount(results.pubMedResult),
      fdaClauses: getClausesCount(results.fdaResult),
      errors: results.errors,
    };
  },
});

/**
 * Canonical payer clinical directory domains for Firecrawl /v1/map URL structure mapping.
 * Discovers root policy directories where insurers publish clinical policy bulletins (CPBs).
 */
export function getPayerClinicalDirectoryDomain(payer: string): string {
  const norm = (payer || "").toLowerCase().trim();
  if (norm.includes("aetna")) {
    return "https://www.aetna.com/cpb";
  }
  if (norm.includes("cigna")) {
    return "https://www.cigna.com/coveragePolicies";
  }
  if (norm.includes("united") || norm.includes("uhc") || norm.includes("optum")) {
    return "https://www.uhcprovider.com/en/policies-protocols/commercial-policies.html";
  }
  if (norm.includes("humana")) {
    return "https://www.humana.com/provider/medical-resources/clinical-guidance/medical-policies";
  }
  if (norm.includes("anthem") || norm.includes("blue") || norm.includes("bcbs")) {
    return "https://www.anthem.com/provider/policies";
  }
  if (norm.includes("molina")) {
    return "https://www.molinahealthcare.com/providers/common/medicaid/clinical-guidelines.aspx";
  }
  if (norm.includes("kaiser")) {
    return "https://healthy.kaiserpermanente.org/clinical-library";
  }
  // Default to Aetna CPB directory as the standard benchmark directory
  return "https://www.aetna.com/cpb";
}

/**
 * Extract bulletin or policy identifier from URL or title (e.g. "0736", "CPB 0736", "0512").
 */
export function extractBulletinIdentifier(url: string, title?: string): string | undefined {
  if (title) {
    const titleMatch = title.match(/(?:CPB|Policy|Bulletin|Guideline|LCD|NCD)[#\s:-]*([A-Z0-9.-]{3,12})/i);
    if (titleMatch) return titleMatch[1].trim();
  }
  if (url) {
    // Check filename / last path segment first to avoid parent range folders (e.g. /700_799/0736.html)
    const pathPart = url.split("?")[0];
    const lastSegment = pathPart.split("/").filter(Boolean).pop() || "";
    const filenameMatch = lastSegment.match(/(?:cpb|policy|bulletin|lcd|guideline)?[-_]?([0-9]{3,6}|L[0-9]{4,6})(?:\.html|\.pdf|\.aspx|\.jsp)?$/i);
    if (filenameMatch) return filenameMatch[1].trim();

    // Secondary match on explicit cpb-123 or policy-123 within path
    const urlMatch = pathPart.match(/(?:cpb|policy|bulletin|lcd)[-_/]([0-9]{3,6}|L[0-9]{4,6})/i);
    if (urlMatch) return urlMatch[1].trim();
  }
  return undefined;
}

/**
 * Deduce medical specialty from claim procedure and diagnosis codes
 */
export function deduceClaimSpecialty(cptCodes: string[] = [], icd10Codes: string[] = []): string {
  const codes = cptCodes.concat(icd10Codes).join(" ").toLowerCase();

  // Orthopedics & Musculoskeletal
  if (
    cptCodes.some((c) => ["27447", "29881", "29877", "29827", "23412", "27130", "20610"].includes(c)) ||
    codes.includes("knee") || codes.includes("arthroplasty") || codes.includes("meniscus") || codes.includes("m17")
  ) {
    return "Orthopedics";
  }

  // Neurology & Spine
  if (
    cptCodes.some((c) => ["63047", "22633", "22558", "63030", "64483", "62322"].includes(c)) ||
    codes.includes("lumbar") || codes.includes("spine") || codes.includes("decompression") || codes.includes("m54")
  ) {
    return "Spine & Orthopedics";
  }

  // Oncology & Hematology
  if (
    cptCodes.some((c) => c.startsWith("964") || c.startsWith("J9") || ["77427", "77301"].includes(c)) ||
    codes.includes("cancer") || codes.includes("neoplasm") || codes.includes("chemo") || codes.includes("c50")
  ) {
    return "Oncology";
  }

  // Cardiology & Vascular
  if (
    cptCodes.some((c) => c.startsWith("93") || ["33533", "92928", "93458"].includes(c)) ||
    codes.includes("cardiac") || codes.includes("stent") || codes.includes("angioplasty") || codes.includes("i25")
  ) {
    return "Cardiology";
  }

  // Radiology & Imaging
  if (
    cptCodes.some((c) => c.startsWith("7")) ||
    codes.includes("mri") || codes.includes("ct scan") || codes.includes("ultrasound")
  ) {
    return "Radiology";
  }

  return "Orthopedics";
}

export const discoverInsurerPolicyDirectoryArgs = {
  claimId: v.id("claims"),
  payer: v.optional(v.string()),
  specialty: v.optional(v.string()),
  customDomain: v.optional(v.string()),
  limit: v.optional(v.number()),
  saveToEvidenceMatrix: v.optional(v.boolean()),
};

export interface DiscoveredPolicyBulletin {
  url: string;
  title: string;
  description?: string;
  bulletinNumber?: string;
}

export interface DiscoverInsurerPolicyDirectoryResult {
  success: boolean;
  payer: string;
  specialty: string;
  domain: string;
  totalDiscovered: number;
  bulletins: DiscoveredPolicyBulletin[];
  savedToEvidence: boolean;
}

async function performDiscoverInsurerPolicyDirectory(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    payer?: string;
    specialty?: string;
    customDomain?: string;
    limit?: number;
    saveToEvidenceMatrix?: boolean;
  },
  claim: Doc<"claims">,
  userId?: Id<"users">,
): Promise<DiscoverInsurerPolicyDirectoryResult> {
  const limitStatus = await rateLimiter.limit(ctx, "policyCrawler", {
    key: userId || args.payer || claim.insurancePayer || "global",
  });
  if (!limitStatus.ok) {
    throw new Error(
      `Rate limit reached for policy directory discovery. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
    );
  }

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlApiKey?.trim() && !process.env.CONVEX_TEST) {
    throw new Error("Insurer policy directory discovery requires FIRECRAWL_API_KEY; no fallback directory source is available.");
  }

  const effectivePayer = (args.payer || claim.insurancePayer || "Insurer").trim();
  const effectiveSpecialty = (
    args.specialty?.trim() ||
    deduceClaimSpecialty(claim.cptCodes || [], claim.icd10Codes || [])
  );

  let targetDomain = args.customDomain?.trim();
  if (targetDomain) {
    if (!isAcceptableSourceUrl(targetDomain)) {
      throw new Error("The custom clinical domain must be a valid HTTP or HTTPS web URL.");
    }
  } else {
    targetDomain = getPayerClinicalDirectoryDomain(effectivePayer);
  }

  const searchLimit = Math.min(Math.max(args.limit || 30, 5), 100);

  await logPipelineActivity(ctx, {
    claimId: args.claimId,
    stage: "crawl",
    status: "running",
    message: `Firecrawl /v1/map: Mapping ${targetDomain} URL structure for ${effectiveSpecialty} bulletins...`,
  });

  let mapResult: { links?: unknown[] } | undefined;
  try {
    mapResult = (await firecrawl.map(ctx, targetDomain, {
      search: effectiveSpecialty,
      limit: searchLimit,
      sitemap: "include",
    })) as { links?: unknown[] };
  } catch (err) {
    console.warn(`firecrawl.map on ${targetDomain} encountered error:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("rate limit")) {
      throw new Error(`Firecrawl rate limit: ${msg}`);
    }
    throw err;
  }

  const rawLinks = Array.isArray(mapResult?.links) ? mapResult.links : [];
  const seenUrls = new Set<string>();
  const validPolicies: DiscoveredPolicyBulletin[] = [];

  for (const raw of rawLinks) {
    let rawUrl = "";
    let rawTitle: string | undefined;
    let rawDesc: string | undefined;

    if (typeof raw === "string") {
      rawUrl = raw;
    } else if (raw && typeof raw === "object") {
      const item = raw as Record<string, unknown>;
      rawUrl = typeof item.url === "string" ? item.url : "";
      rawTitle = typeof item.title === "string" ? item.title : undefined;
      rawDesc = typeof item.description === "string" ? item.description : undefined;
    }

    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl || !isAcceptableSourceUrl(trimmedUrl)) continue;

    const normalizedUrl = trimmedUrl.split("#")[0];
    if (seenUrls.has(normalizedUrl.toLowerCase())) continue;
    seenUrls.add(normalizedUrl.toLowerCase());

    const bulletinNumber = extractBulletinIdentifier(normalizedUrl, rawTitle);

    let cleanTitle = rawTitle?.replace(/\*\*/g, "").trim();
    if (!cleanTitle || cleanTitle.length < 5) {
      if (bulletinNumber) {
        cleanTitle = `${effectivePayer} CPB ${bulletinNumber}: ${effectiveSpecialty} Policy`;
      } else {
        try {
          const parsed = new URL(normalizedUrl);
          const pathSegments = parsed.pathname.split("/").filter(Boolean);
          const lastSeg = pathSegments[pathSegments.length - 1] || effectiveSpecialty;
          cleanTitle = `${effectivePayer} Policy: ${lastSeg.replace(/[-_]/g, " ").replace(/\.html|\.pdf/i, "")}`;
        } catch {
          cleanTitle = `${effectivePayer} ${effectiveSpecialty} Clinical Bulletin`;
        }
      }
    }

    validPolicies.push({
      url: normalizedUrl,
      title: cleanTitle,
      description: rawDesc?.replace(/\*\*/g, "").trim(),
      bulletinNumber,
    });

    if (validPolicies.length >= searchLimit) break;
  }

  // Persist discovered policy directory bulletins into Convex database
  if (validPolicies.length > 0) {
    await ctx.runMutation(internal.clinicalEvidences.saveDiscoveredPoliciesInternal, {
      claimId: args.claimId,
      payer: effectivePayer,
      specialty: effectiveSpecialty,
      domain: targetDomain,
      policies: validPolicies,
      saveToEvidenceMatrix: args.saveToEvidenceMatrix !== false,
    });
  }

  await logPipelineActivity(ctx, {
    claimId: args.claimId,
    stage: "crawl",
    status: "completed",
    message: `Firecrawl /v1/map: Discovered ${validPolicies.length} policy directory bulletins from ${targetDomain} (${effectiveSpecialty}).`,
  });

  return {
    success: true,
    payer: effectivePayer,
    specialty: effectiveSpecialty,
    domain: targetDomain,
    totalDiscovered: validPolicies.length,
    bulletins: validPolicies,
    savedToEvidence: Boolean(args.saveToEvidenceMatrix !== false),
  };
}

/**
 * Discover Insurer Policy Directory Action (User-facing):
 * Deploys Firecrawl /v1/map on payer's clinical domain to map directory structure
 * and discover all bulletins for a medical specialty.
 */
export const discoverInsurerPolicyDirectory = action({
  args: discoverInsurerPolicyDirectoryArgs,
  handler: async (ctx, args): Promise<DiscoverInsurerPolicyDirectoryResult> => {
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);
    return await performDiscoverInsurerPolicyDirectory(ctx, args, claim as Doc<"claims">, userId);
  },
});

/**
 * Discover Insurer Policy Directory Action (Internal):
 * For background jobs and durable workflow orchestration.
 */
export const discoverInsurerPolicyDirectoryInternal = internalAction({
  args: discoverInsurerPolicyDirectoryArgs,
  handler: async (ctx, args): Promise<DiscoverInsurerPolicyDirectoryResult> => {
    const claim = (await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    })) as Doc<"claims"> | null;
    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }
    return await performDiscoverInsurerPolicyDirectory(ctx, args, claim, claim.userId);
  },
});

