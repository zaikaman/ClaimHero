"use node";

import { action, ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { api, components, internal } from "../_generated/api";
import { rateLimiter } from "../lib/rateLimiter";
import { requireClaimOwnerAction } from "../lib/auth";
import { FirecrawlClient, type Format } from "@firecrawl/firecrawl-convex";

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
  extractionEngine?: "firecrawl_native" | "openai_fallback";
}

/**
 * Store high-resolution visual proof screenshot into Convex File Storage (_storage).
 * Supports base64 data URIs, raw base64 buffers, and remote image URLs.
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
    let blob: Blob;

    if (trimmed.startsWith("data:")) {
      const commaIdx = trimmed.indexOf(",");
      if (commaIdx === -1) return undefined;
      const meta = trimmed.slice(5, commaIdx);
      const isBase64 = meta.includes(";base64");
      const mime = meta.split(";")[0] || "image/png";
      const payload = trimmed.slice(commaIdx + 1);
      const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
      blob = new Blob([buffer], { type: mime });
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
      // Raw base64 string
      const buffer = Buffer.from(trimmed, "base64");
      blob = new Blob([buffer], { type: "image/png" });
    } else {
      return undefined;
    }

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
]);

function isAcceptableSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
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
            if (parsedHost.includes(payerKw)) {
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

      // Staleness penalty: mentions old years (e.g. 2024, 2023, 2022) without mentioning the active year
      let stalenessPenalty = 0;
      const hasOldYear = /20(?:1\d|2[0-4])\b/.test(searchableText) || /20(?:1\d|2[0-4])\b/.test(sourceUrl);
      const hasCurrentYear = searchableText.includes(activeYear) || sourceUrl.includes(activeYear);
      if (hasOldYear && !hasCurrentYear) {
        stalenessPenalty = 15;
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
        archivePenalty -
        stalenessPenalty;

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

export function selectFirecrawlPolicySource(payload: unknown): FirecrawlPolicySource | null {
  for (const result of getFirecrawlSearchResults(payload)) {
    if (!result || typeof result !== "object") continue;

    const candidate = result as FirecrawlSearchResult;
    const markdown = typeof candidate.markdown === "string" ? candidate.markdown.trim() : "";
    const sourceUrl = getAcceptableResultUrl(result);

    if (markdown && sourceUrl) {
      return { markdown, sourceUrl };
    }
  }

  return null;
}

export interface ScrapeExtractionOptions {
  payer?: string;
  cptCodes?: string[];
  denialReasonCode?: string;
}

export async function scrapeFirecrawlPolicySource(
  ctx: ActionCtx,
  sourceUrl: string,
  extractionOptions?: ScrapeExtractionOptions,
): Promise<FirecrawlPolicySource> {
  if (isPrivateMcgViewerUrl(sourceUrl)) {
    throw new Error("Source URL is a private Milliman Care Guidelines viewer and not publicly citable without authentication.");
  }

  const cleanSourceUrl = sanitizePublicPolicyUrl(sourceUrl);
  const isPdf = /\.(pdf|ashx)(\?|#|$)/i.test(cleanSourceUrl);

  try {
    const formats: Format[] = [
      "markdown",
      {
        type: "screenshot",
        fullPage: true,
      },
    ];

    if (extractionOptions?.cptCodes && extractionOptions.cptCodes.length > 0) {
      formats.push({
        type: "json",
        prompt: `Extract structured clinical policy criteria, medical necessity guidelines, contraindications, prior authorization requirements, effective date, revision history, and specific clause identifiers for CPT codes [${extractionOptions.cptCodes.join(", ")}] and payer ${extractionOptions.payer || "Health Insurer"} to refute denial code ${extractionOptions.denialReasonCode || "CO-50"}. Focus strictly on criteria for procedures [${extractionOptions.cptCodes.join(", ")}].`,
        schema: NATIVE_POLICY_EXTRACTION_SCHEMA,
      });
    }

    const doc = await firecrawl.scrape(ctx, cleanSourceUrl, {
      formats,
      onlyMainContent: true,
      proxy: "auto",
      timeout: 12000,
      waitFor: isPdf ? 0 : 300,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      blockAds: true,
    });

    const markdown = doc.markdown?.trim() || "";
    const statusCode = doc.metadata?.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400) {
      throw new Error(`Firecrawl could not access the source URL (HTTP ${statusCode}).`);
    }

    if (!markdown) {
      throw new Error("Firecrawl scrape returned no Markdown policy document.");
    }

    if (isAccessDeniedDocument(markdown) || isHtmlErrorBody(markdown) || isPdfUrlExposingHtml(cleanSourceUrl, markdown)) {
      throw new Error("Firecrawl returned an access-denied or authentication page instead of the policy document.");
    }

    if (!isPolicyMarkdownSubstantive(markdown)) {
      throw new Error("Firecrawl returned a document without substantive clinical policy content.");
    }

    const scrapedSourceUrl = getAcceptableResultUrl({
      url: cleanSourceUrl,
      metadata: doc.metadata as FirecrawlSearchResult["metadata"],
    });

    return {
      markdown,
      sourceUrl: sanitizePublicPolicyUrl(scrapedSourceUrl ?? cleanSourceUrl),
      json: doc.json,
      screenshot: doc.screenshot,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("concurrency") || msg.includes("timed out") || msg.includes("408") || msg.includes("rate limit")) {
      throw new Error(`Firecrawl concurrency/timeout: ${msg}`);
    }
    throw err;
  }
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

  return {
    aligned: false,
    reason: `Document does not mention any expected term for CPT ${cptCodes.join(", ")} (expected one of: ${keywords.join(", ")}). Title was: "${policyTitle}".`,
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

  const windowedMarkdown = extractRelevantDocumentWindow(policySource.markdown, cptCodes, 50000);

  const llmResult = await createStructuredCompletion<PolicyRelevanceResponse>({
    systemPrompt: `You are an expert clinical document auditor for health insurance claim appeals.
Evaluate whether the supplied document is an authoritative, clinically relevant coverage policy, medical necessity guideline, or specialty society standard that directly applies to this claim.

Evaluation Directives:
1. Provenance & Authority: The document must be an official policy from the claim's payer, their recognized clinical guidelines manager (e.g. Carelon, EviCore), or a neutral national medical authority (CMS LCD/NCD, AAOS, NASS, ACR, NCCN, PubMed, FDA, ECFR). Strictly reject policies issued by competing commercial health plans or unrelated regional programs.
2. Clinical Specificity: The document must establish substantive medical necessity criteria, diagnostic standards, conservative therapy rules, or coverage indications for the procedure and anatomical site involved in the claim (e.g. Spine Surgery / Decompression for CPT 63047, Total Knee Arthroplasty for CPT 27447, Knee MRI for CPT 73721).
3. Content Type: Reject commercial billing coding blogs, consumer marketing materials, provider enrollment forms, and private password-protected viewers.
4. Guideline Recency & Active Effective Date:
   - In health insurance appeals, citations must reference the ACTIVE, CURRENTLY EFFECTIVE clinical guideline in effect on the claim's Date of Service (${serviceDate || targetYear}, Year ${targetYear}).
   - You MUST REJECT any document that is explicitly marked as "ARCHIVED", "SUPERSEDED", "HISTORICAL", or whose effective coverage window expired prior to the claim's Date of Service (for example, Carelon's "ARCHIVED Spine Surgery 2024-10-20 to 2025-11-14" ended in 2025 and is an expired historical document for a 2026 Date of Service).
   - If a document is an archived or superseded edition whose effective period ended before the Date of Service, return relevant=false with rationale: "Document is an archived/superseded policy from prior years (expired before Date of Service ${serviceDate || targetYear}). The appeal requires the active, up-to-date guideline version."
   - Only accept an archived version if the claim's Date of Service explicitly fell within that historical document's active date range, or if the guideline manager has issued no subsequent updates.
5. Administrative & Prior-Authorization Denials (e.g. CO-197, CO-16, Precertification Absent): When a claim is denied for lack of prior authorization or precertification, the universal legal and clinical appeal mechanism under ERISA and health plan rules is demonstrating emergency medical necessity, acute progressive deficit, or clinical indication for retroactive authorization. You MUST NEVER reject an authoritative clinical guideline, coverage policy, or peer-reviewed study simply because the denial code was administrative or 'lack of prior authorization'. Clinical criteria and surgical indications ARE the exact substantive evidence required to overturn prior-authorization denials.
6. Peer-Reviewed Clinical Evidence & PubMed: Peer-reviewed clinical studies, systematic reviews, and meta-analyses indexed on PubMed/NCBI establish clinical efficacy, standard-of-care, and medical necessity indications under ERISA full-and-fair review regulations. You MUST accept a PubMed study or systematic review if it evaluates the surgical indications, clinical outcomes, or medical necessity for the procedure and diagnosis in the claim. Do not reject PubMed documents merely because they are formatted as journal articles or abstracts rather than an insurer CPB bulletin.

Return relevant=true if the document satisfies all directives, or relevant=false with a concise explanation.`,
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
    temperature: 0,
  });

  if (llmResult.relevant) {
    const titleGuess = policySource.markdown.split("\n")[0]?.slice(0, 300) || "";
    const alignment = isPolicyAlignedWithClaim(windowedMarkdown, titleGuess, cptCodes);
    if (!alignment.aligned) {
      return { relevant: false, rationale: alignment.reason };
    }
  }

  return llmResult;
}

function cleanPayerForSearch(payer: string): string {
  const clean = payer
    .replace(/\b(of|inc|llc|corp|corporation|insurance company|plan|health plan|services|fl|florida|ca|california|tx|texas|ny|new york)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 3 ? clean : payer;
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
- For Carelon Medical Benefits Management guidelines (used by GeoBlue, Anthem, BCBS, Elevance, etc.): active guidelines are published under guidelines.carelonmedicalbenefitsmanagement.com with date slugs representing the latest effective update window (such as updated ${targetYear}). Example: Carelon spine surgery clinical appropriateness guideline ${targetYear} -archived OR site:guidelines.carelonmedicalbenefitsmanagement.com spine surgery ${targetYear}

Query Strategy:
1. Payer & Utilization Management Guideline Query:
   - Target currently active payer medical policies and recognized clinical guidelines managers for ${targetYear}:
     * GeoBlue / Blue Cross Blue Shield / Anthem / Elevance utilize Carelon (formerly AIM Specialty Health) clinical appropriateness guidelines or Anthem clinical guidelines.
     * Cigna, Molina, and regional plans utilize EviCore or Carelon clinical policies.
     * Aetna and UnitedHealthcare utilize direct Clinical Policy Bulletins (CPBs).
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

export const ERISA_STATUTORY_EVIDENCE = {
  sourceType: "legal_precedent",
  title: "ERISA Full & Fair Review Statutory Protocol",
  sourceUrl:
    "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
  citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
  extractedEvidenceMarkdown:
    "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Adverse benefit determinations lacking specific clinical justification violate the claimant's right to a full and fair review.",
  relevanceScore: 95,
} as const;

/**
 * Insurer CPB & Clinical Policy Bulletin Crawler Action
 * Dynamically queries Firecrawl to retrieve, parse, and extract clinical coverage criteria for any US insurer.
 */
export const crawlInsurerPolicy = action({
  args: {
    claimId: v.id("claims"),
    payer: v.string(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.optional(v.string()),
    customPolicyUrl: v.optional(v.string()),
    serviceDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);

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

    let policySource: FirecrawlPolicySource | null = null;
    if (args.customPolicyUrl) {
      const candidateSource = await scrapeFirecrawlPolicySource(ctx, args.customPolicyUrl, {
        payer: args.payer,
        cptCodes: args.cptCodes,
        denialReasonCode: args.denialReasonCode,
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
      let searchQueries = await generatePolicySearchQueries(
        args.payer,
        args.cptCodes,
        args.icd10Codes,
        args.denialReasonCode,
        args.denialReasonDescription || "",
        "",
        effectiveDate,
        targetYear,
      );
      const failedSources: string[] = [];
      const searchFailures: string[] = [];
      const seenSourceUrls = new Set<string>();
      let discoveredSourceCount = 0;

      for (let searchRound = 0; searchRound < MAX_POLICY_SEARCH_ROUNDS && !policySource; searchRound += 1) {
        const successfulSearches: Array<{ payload: Record<string, unknown> }> = [];
        const failedSearches: string[] = [];

        // Run search queries sequentially (not in parallel) to prevent rate-limit bursts
        for (const query of searchQueries.slice(0, 3)) {
          try {
            const payload = await firecrawl.search(ctx, query, {
              limit: 5,
              sources: ["web"],
            });
            if (payload) successfulSearches.push({ payload: payload as Record<string, unknown> });
          } catch (error) {
            const msg = error instanceof Error ? error.message : "Unknown Firecrawl search error";
            failedSearches.push(msg);
            // If rate limited, break early to avoid worsening the 429
            if (msg.includes("429") || msg.includes("Rate limit")) break;
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

        // Fast path: check if search payload already included substantive markdown
        const directSource = selectFirecrawlPolicySource(combinedSearchPayload);
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
          } catch {
            // Defer to URL scraping
          }
        }

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

        // Evaluate candidate URLs sequentially (concurrency 1) to honor Firecrawl concurrency limits
        for (const sourceUrl of sourceUrls.slice(0, 5)) {
          try {
            const candidateSource = await scrapeFirecrawlPolicySource(ctx, sourceUrl, {
              payer: args.payer,
              cptCodes: args.cptCodes,
              denialReasonCode: args.denialReasonCode,
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
              policySource = candidateSource;
              break;
            }

            failedSources.push(`${sourceUrl}: document rejected as irrelevant (${relevance.rationale})`);

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
              for (const childUrl of childLinks.slice(0, 2)) {
                if (seenSourceUrls.has(childUrl)) continue;
                seenSourceUrls.add(childUrl);
                discoveredSourceCount += 1;
                try {
                  const childSource = await scrapeFirecrawlPolicySource(ctx, childUrl, {
                    payer: args.payer,
                    cptCodes: args.cptCodes,
                    denialReasonCode: args.denialReasonCode,
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
                } catch (childErr) {
                  const msg = childErr instanceof Error ? childErr.message : "Child source error";
                  failedSources.push(`${childUrl}: ${msg}`);
                }
              }
              if (policySource) break;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown source error";
            failedSources.push(`${sourceUrl}: ${message}`);
            if (message.includes("429") || message.includes("Rate limit")) break;
          }
        }

        if (!policySource && searchRound + 1 < MAX_POLICY_SEARCH_ROUNDS && !failedSearches.some((s) => s.includes("429"))) {
          const feedback = [...searchFailures, ...failedSources.slice(-10)].join(" | ");
          searchQueries = await generatePolicySearchQueries(
            args.payer,
            args.cptCodes,
            args.icd10Codes,
            args.denialReasonCode,
            args.denialReasonDescription || "",
            feedback,
            effectiveDate,
            targetYear,
          );
        }
      }

      if (!policySource) {
        if (!discoveredSourceCount) {
          const detail = searchFailures.length ? ` ${searchFailures.join(" | ")}` : "";
          throw new Error(`Firecrawl search returned no direct HTTP(S) policy source URL.${detail}`);
        }

        throw new Error(`Firecrawl returned no publicly accessible policy document from ${discoveredSourceCount} direct result(s). ${failedSources.join(" | ")}`);
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

    return {
      policyTitle: extractedData.policyTitle,
      policyNumber: extractedData.policyNumber,
      effectiveDate: extractedData.effectiveDate,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
      extractionEngine,
    };
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
