"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { api } from "../_generated/api";

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

interface FirecrawlPolicySource {
  markdown: string;
  sourceUrl: string;
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
const MAX_FIRECRAWL_SCRAPE_ATTEMPTS = 2;

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

    return !/(?:^|\/)(?:login|signin|sign-in|oauth|sso|authenticate)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isAccessDeniedDocument(value: string): boolean {
  const preview = value.slice(0, 8000).replace(/\s+/g, " ").trim();
  if (!preview) return false;
  // Generic CDN / WAF / auth block + unreachable signatures. Must be strict enough to avoid
  // false-positiving legitimate payer pages that happen to mention "sign in" or "captcha" in a footer.
  // We only flag when the block signal is accompanied by lack of policy substance or an explicit error title.
  const hasPolicyMarker =
    /medical necessity|coverage criteria|clinical policy|coverage policy|medical policy|indication|contraindication|policy number|effective date|procedure code|diagnosis code|icd-10|cpt code/i.test(
      preview,
    );
  const blockTitlePattern = /<title[^>]*>\s*(access denied|this site can.t be reached|request unsuccessful)\s*<\/title>/i;
  if (blockTitlePattern.test(value) || /^#\s*access denied\s*$/im.test(value)) return true;

  const hasIncapsulaChallenge =
    /request unsuccessful\. incapsula incident id|_incapsula_resource|incapsula incident id/i.test(preview);
  if (hasIncapsulaChallenge && preview.length < 2000 && !hasPolicyMarker) return true;

  const lowerPreview = preview.toLowerCase();
  const hasBlockKeyword =
    /access denied|forbidden|not authorized|blocked|reference #|can.t be reached|timed out|took too long|dns_probe|err_connection/i.test(
      lowerPreview,
    );
  // Only flag short, non-substantive error pages - not full payer policy pages that happen to contain a word like "captcha" in a footer.
  if (hasBlockKeyword && !hasPolicyMarker && preview.length < 1500) return true;

  // For longer documents, require a strong, unambiguous block signal without any policy content.
  const strongBlockPattern =
    /you don't have permission to access|you do not have permission|edgesuite\.net|akamaighost|failover|error from edge|err_connection_timed_out|err_name_not_resolved/i;
  if (strongBlockPattern.test(preview) && !hasPolicyMarker) return true;

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
    // Incapsula challenge is HTML with iframe - only treat as error if no policy content and short.
    if (preview.length < 2500 && /request unsuccessful|incapsula incident id|access denied|forbidden|can.t be reached|timed out|dns_probe|err_connection/i.test(value)) {
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

    // If payer is GeoBlue or BCBS, allow BCBS/Carelon/Anthem networks
    if (
      (payerKeyword === "geoblue" || payerKeyword === "bcbs" || payerKeyword === "bcbsfl") &&
      (host.includes("bcbs") ||
        host.includes("bluecross") ||
        host.includes("anthem") ||
        host.includes("elevance") ||
        host.includes("carelon") ||
        host.includes("geo-blue") ||
        host.includes("geoblue") ||
        host.includes("bcbsglobalcore"))
    ) {
      return false;
    }

    const knownPayerKeywords = ["molina", "bcbsfl", "bcbs", "aetna", "cigna", "uhc", "humana", "kaiser", "geoblue", "globalcore", "mcgs"];
    const hostContainsPayerKeyword = knownPayerKeywords.find((kw) => host.includes(kw));
    if (hostContainsPayerKeyword && !host.includes(payerKeyword)) {
      // Special case: bcbsfl host for bcbs payer is not a mismatch (bcbsfl contains bcbs)
      if (payerKeyword === "bcbs" && (host.includes("bcbsfl") || host.includes("bcbs"))) return false;
      if (payerKeyword === "bcbsfl" && host.includes("bcbs")) return false;
      return true;
    }
    // Also check path/query for payer mention when host is generic (e.g., mcgs)
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
): string[] {
  const candidates: Array<{ sourceUrl: string; score: number; position: number }> = [];
  const seenUrls = new Set<string>();

  getFirecrawlSearchResults(payload).forEach((result, position) => {
    const sourceUrl = getAcceptableResultUrl(result);
    if (sourceUrl && !seenUrls.has(sourceUrl)) {
      seenUrls.add(sourceUrl);

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
      ].reduce(
        (total, term) => total + (sourceUrl.toLowerCase().includes(term) ? 3 : 0),
        0,
      );
      const documentFormatScore = /\.(?:pdf|ashx?)(?:$|[?#])/i.test(sourceUrl) ? 1 : 0;
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
      ].reduce(
        (total, term) => total + (searchableText.includes(term) ? 3 : 0),
        0,
      );
      const privateViewerPenalty = isPrivateMcgViewerUrl(sourceUrl) ? 10 : 0;
      const score = termScore + specificDocumentScore + authorityHostScore + documentFormatScore - landingPagePenalty - privateViewerPenalty;

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

async function scrapeFirecrawlPolicySource(
  apiKey: string,
  sourceUrl: string,
): Promise<FirecrawlPolicySource> {
  if (isPrivateMcgViewerUrl(sourceUrl)) {
    throw new Error("Source URL is a private Milliman Care Guidelines viewer and not publicly citable without authentication.");
  }
  let response: Response | null = null;
  for (let attempt = 0; attempt < MAX_FIRECRAWL_SCRAPE_ATTEMPTS; attempt += 1) {
    response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: sourceUrl,
        formats: ["markdown"],
      }),
    });

    if (response.status !== 429 || attempt + 1 >= MAX_FIRECRAWL_SCRAPE_ATTEMPTS) {
      break;
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const retryDelayMs = Number.isFinite(retryAfterSeconds)
      ? Math.min(Math.max(retryAfterSeconds * 1000, 250), 5000)
      : 1000;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  if (!response || !response.ok) {
    const status = response?.status ?? "unknown";
    throw new Error(`Firecrawl scrape failed with HTTP ${status}.`);
  }

  const payload = await response.json();
  const data = payload && typeof payload === "object"
    ? (payload as { data?: unknown }).data
    : undefined;
  const markdown = data && typeof data === "object" && typeof (data as { markdown?: unknown }).markdown === "string"
    ? (data as { markdown: string }).markdown.trim()
    : "";

  const statusCode = data && typeof data === "object"
    ? (data as { metadata?: { statusCode?: unknown } }).metadata?.statusCode
    : undefined;
  if (typeof statusCode === "number" && statusCode >= 400) {
    throw new Error(`Firecrawl could not access the source URL (HTTP ${statusCode}).`);
  }

  if (!markdown) {
    throw new Error("Firecrawl scrape returned no Markdown policy document.");
  }

  if (isAccessDeniedDocument(markdown) || isHtmlErrorBody(markdown) || isPdfUrlExposingHtml(sourceUrl, markdown)) {
    throw new Error("Firecrawl returned an access-denied or authentication page instead of the policy document.");
  }

  if (!isPolicyMarkdownSubstantive(markdown)) {
    throw new Error("Firecrawl returned a document without substantive clinical policy content.");
  }

  const scrapedSourceUrl = data && typeof data === "object"
    ? getAcceptableResultUrl({
        url: sourceUrl,
        metadata: (data as { metadata?: unknown }).metadata as FirecrawlSearchResult["metadata"],
      })
    : null;

  return {
    markdown,
    sourceUrl: scrapedSourceUrl ?? sourceUrl,
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

async function evaluatePolicySourceRelevance(
  policySource: FirecrawlPolicySource,
  payer: string,
  cptCodes: string[],
  icd10Codes: string[],
  denialReasonCode: string,
  denialReasonDescription: string,
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
    systemPrompt: `You are a strict document relevance classifier for health-insurance claim appeals.
Return relevant=true only when the supplied document is a clinical coverage policy, medical-necessity guideline, utilization-management criterion, specialty society guideline, or equivalent payer clinical rule that directly addresses the submitted claim's procedure, diagnosis, or denial issue.

Relevance requires all of:
- Payer or clinical authority alignment: the source must be from the claimed payer's own policy domain, their guideline administrator (e.g. Carelon, EviCore for BCBS/Anthem/GeoBlue), or a neutral public clinical authority (CMS LCD/NCD, NASS spine.org, AAOS aaos.org, ACR acr.org, NCCN nccn.org, FDA, NIH, ECFr).
- Viewer check: private Milliman Care Guidelines viewers (mcgs.*, /MCG?, mcgId=, pv=false) are NOT publicly citable and must be rejected.
- Anatomical and procedural alignment: the document must concern the same body site / specialty as the claimed procedure (e.g., lumbar spine decompression/laminectomy for CPT 63047, knee arthroplasty for CPT 27447, knee MRI for CPT 73721). Multi-chapter guidelines covering both cervical and lumbar spine are relevant if they contain criteria for the claimed anatomical section.
- The document must provide substantive medical necessity criteria, diagnostic requirements, or conservative therapy standards.

Return relevant=false for billing manuals, EDI companion guides, commercial coding blog posts, provider enrollment forms, claim-submission instructions, general landing pages, or documents solely concerning an unrelated anatomical site.
Keep the rationale concise.`,
    userPrompt: `Evaluate this Firecrawl document before it is used as appeal evidence.

Payer: ${payer}
Procedure code(s): ${cptDescriptions}
Diagnosis code(s): ${icd10Codes.join(", ") || "Not provided"}
Denial reason code: ${denialReasonCode || "Not provided"}
Denial description: ${denialReasonDescription || "Not provided"}
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

async function generatePolicySearchQueries(
  payer: string,
  cptCodes: string[],
  icd10Codes: string[],
  denialReasonCode: string,
  denialReasonDescription: string,
  rejectedSearchFeedback = "",
): Promise<string[]> {
  const result = await createStructuredCompletion<PolicySearchIntentResponse>({
    systemPrompt: `Create concise, high-signal web-search queries for locating official payer clinical coverage policies, medical-necessity criteria, or accredited specialty society guidelines relevant to a health-insurance claim appeal.
Use the supplied payer, procedure codes, diagnosis codes, and denial information.
Generate 2-3 distinct English search queries covering diverse retrieval angles:
1. Payer / Network clinical policy query: Target the insurer name (or its clinical administrator like Carelon for BCBS/GeoBlue) with procedure codes and medical necessity terms.
2. Clinical Specialty Society / Guideline Clearinghouse query: Target standard clinical guidelines (e.g. North American Spine Society / NASS for spine, AAOS for orthopedics, ACR for imaging, NCCN for oncology, CMS LCDs) without restricting to the payer's domain.
3. Specific Medical Criteria / CARC exception query: Target the specific clinical indication or emergency/retroactive criteria.

Every query must seek clinical criteria, coverage guidelines, or medical necessity rules. Do NOT seek billing blogs, EDI manuals, or generic sign-in pages.${rejectedSearchFeedback ? `
The previous search pass produced these rejected results or failures:
${rejectedSearchFeedback.slice(0, 6000)}
Generate materially different queries that correct for those failures and broaden toward neutral guideline authorities (CMS LCDs, NASS, AAOS, Carelon, ACR).` : ""}`,
    userPrompt: `Build the search plan for this claim.

Payer: ${payer}
Procedure code(s): ${cptCodes.join(", ") || "Not provided"}
Diagnosis code(s): ${icd10Codes.join(", ") || "Not provided"}
Denial reason code: ${denialReasonCode || "Not provided"}
Denial description: ${denialReasonDescription || "Not provided"}`,
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

/**
 * Policy Crawler Action: Search and scrape an insurer policy through Firecrawl.
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
  },
  handler: async (ctx, args) => {
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

    // Do not leave stale, previously accepted citations visible while a new
    // source-only crawl is in progress or when the crawl fails.
    await ctx.runMutation((api as any).clinicalEvidences.clearByClaim, {
      claimId: args.claimId,
    });

    let policySource: FirecrawlPolicySource | null = null;
    try {
      if (args.customPolicyUrl) {
        const candidateSource = await scrapeFirecrawlPolicySource(firecrawlApiKey, args.customPolicyUrl);
        const relevance = await evaluatePolicySourceRelevance(
          candidateSource,
          args.payer,
          args.cptCodes,
          args.icd10Codes,
          args.denialReasonCode,
          args.denialReasonDescription || "",
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
        );
        const failedSources: string[] = [];
        const searchFailures: string[] = [];
        const seenSourceUrls = new Set<string>();
        let discoveredSourceCount = 0;

        for (let searchRound = 0; searchRound < MAX_POLICY_SEARCH_ROUNDS && !policySource; searchRound += 1) {
          const searchResults = await Promise.all(searchQueries.map(async (query) => {
            try {
              const response = await fetch("https://api.firecrawl.dev/v2/search", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${firecrawlApiKey}`,
                },
                body: JSON.stringify({
                  query,
                  limit: 10,
                  sources: ["web"],
                }),
              });

              if (!response.ok) {
                throw new Error(`Firecrawl policy search failed with HTTP ${response.status}.`);
              }

              return { payload: await response.json() };
            } catch (error) {
              return {
                error: error instanceof Error ? error.message : "Unknown Firecrawl search error",
              };
            }
          }));

          const successfulSearches = searchResults.filter(
            (result): result is { payload: unknown } => "payload" in result,
          );
          const failedSearches = searchResults
            .filter((result): result is { error: string } => "error" in result)
            .map((result) => result.error);
          searchFailures.push(...failedSearches);

          const searchQueryTerms = searchQueries.flatMap(
            (query) => query.toLowerCase().match(/[a-z0-9][a-z0-9.-]{2,}/g) ?? [],
          );
          const combinedSearchPayload = {
            data: {
              web: successfulSearches.flatMap(({ payload }) => getFirecrawlSearchResults(payload)),
            },
          };
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
          ).filter((sourceUrl) => {
            if (seenSourceUrls.has(sourceUrl)) return false;
            seenSourceUrls.add(sourceUrl);
            return true;
          });
          discoveredSourceCount += sourceUrls.length;

          for (const sourceUrl of sourceUrls) {
            try {
              const candidateSource = await scrapeFirecrawlPolicySource(firecrawlApiKey, sourceUrl);
              const relevance = await evaluatePolicySourceRelevance(
                candidateSource,
                args.payer,
                args.cptCodes,
                args.icd10Codes,
                args.denialReasonCode,
                args.denialReasonDescription || "",
              );
              if (relevance.relevant) {
                policySource = candidateSource;
                break;
              }

              failedSources.push(`${sourceUrl}: document rejected as irrelevant (${relevance.rationale})`);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown source error";
              failedSources.push(`${sourceUrl}: ${message}`);
            }
          }

          if (!policySource && searchRound + 1 < MAX_POLICY_SEARCH_ROUNDS) {
            const feedback = [...searchFailures, ...failedSources.slice(-10)].join(" | ");
            searchQueries = await generatePolicySearchQueries(
              args.payer,
              args.cptCodes,
              args.icd10Codes,
              args.denialReasonCode,
              args.denialReasonDescription || "",
              feedback,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Firecrawl error";
      throw new Error(`Unable to retrieve an official policy source from Firecrawl: ${message}`);
    }

    if (!policySource) {
      throw new Error("Firecrawl returned no scraped policy document with an acceptable source URL; no fallback policy source is available.");
    }

    const policyText = policySource.markdown;
    const policySourceUrl = policySource.sourceUrl;

    if (isAccessDeniedDocument(policyText) || isHtmlErrorBody(policyText)) {
      throw new Error("Scraped policy text is an access-denied or error page, not a clinical policy.");
    }

    const windowedPolicyText = extractRelevantDocumentWindow(policyText, args.cptCodes, 50000);

    // Use gpt-5-nano to extract precise medical criteria and contradiction clauses.
    const extractedData = await createStructuredCompletion<PolicyExtractionResponse>({
      systemPrompt: `You are an expert Medical Legal Analyst and Clinical Auditor.
Analyze the provided insurer Clinical Policy Bulletin (CPB) or clinical guideline.
Extract all key medical necessity qualifying criteria, specific clause identifiers (e.g. Section 1.A, Section 2.3), and contradiction rules that can be cited in an ERISA medical appeal against denial code ${args.denialReasonCode}.
For each clause:
- Assign sourceType: "payer_cpb", "pubmed_study", "fda_package_insert", "nccn_guideline", or "legal_precedent".
- Extract clear, concise plain text summarizing the exact clinical requirements. Strictly do NOT use markdown bold asterisks (such as **bold**) or formatting tokens in extractedEvidenceMarkdown or title.
- Assign relevanceScore between 80 and 99.`,
      userPrompt: `Extract structured clinical evidence clauses from this policy text for CPT codes [${args.cptCodes.join(", ")}] and Payer ${args.payer}:\n\n${windowedPolicyText}`,
      schemaName: "PolicyExtractionResponse",
      schema: POLICY_EXTRACTION_SCHEMA,
      temperature: 0.1,
    });

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

    const evidencesToInsert = extractedData.clauses.map((clause) => ({
      sourceType: clause.sourceType,
      title: (clause.title || extractedData.policyTitle).replace(/\*\*/g, ""),
      sourceUrl: policySourceUrl,
      citationClause: clause.citationClause.replace(/\*\*/g, ""),
      extractedEvidenceMarkdown: clause.extractedEvidenceMarkdown.replace(/\*\*/g, ""),
      relevanceScore: clause.relevanceScore,
    }));

    // Add at least 1 legal precedent clause citing ERISA
    evidencesToInsert.push({
      sourceType: "legal_precedent",
      title: "ERISA Full & Fair Review Statutory Protocol",
      sourceUrl: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
      citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
      extractedEvidenceMarkdown: "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Adverse benefit determinations lacking specific clinical justification violate the claimant's right to a full and fair review.",
      relevanceScore: 95,
    });

    await ctx.runMutation((api as any).clinicalEvidences.insertBatch, {
      claimId: args.claimId,
      evidences: evidencesToInsert,
    });

    // Update claim status to analyzing
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "analyzing",
      details: `Firecrawl indexed ${evidencesToInsert.length} clinical policy clauses for ${args.payer}.`,
    });

    return {
      policyTitle: extractedData.policyTitle,
      policyNumber: extractedData.policyNumber,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
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
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey?.trim()) {
      throw new Error("PubMed & clinical trials research requires FIRECRAWL_API_KEY.");
    }

    let sourceMarkdown = "";
    let sourceUrl = args.customUrl || "";

    if (args.customUrl) {
      const scraped = await scrapeFirecrawlPolicySource(firecrawlApiKey, args.customUrl);
      sourceMarkdown = scraped.markdown;
      sourceUrl = scraped.sourceUrl;
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
          const response = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${firecrawlApiKey}`,
            },
            body: JSON.stringify({
              query,
              limit: 5,
              sources: ["web"],
            }),
          });

          if (!response.ok) continue;
          const payload = await response.json();
          const candidateUrls = selectFirecrawlPolicyUrls(payload, [...args.cptCodes, "pubmed", "trial", "study", "efficacy"], 0, 4);

          for (const candUrl of candidateUrls) {
            try {
              const scraped = await scrapeFirecrawlPolicySource(firecrawlApiKey, candUrl);
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
      };
    });

    if (evidencesToInsert.length > 0) {
      await ctx.runMutation((api as any).clinicalEvidences.insertBatch, {
        claimId: args.claimId,
        evidences: evidencesToInsert,
      });

      await ctx.runMutation((api as any).claims.updateStatus, {
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
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey?.trim()) {
      throw new Error("FDA indication research requires FIRECRAWL_API_KEY.");
    }

    let sourceMarkdown = "";
    let sourceUrl = args.customUrl || "";

    if (args.customUrl) {
      const scraped = await scrapeFirecrawlPolicySource(firecrawlApiKey, args.customUrl);
      sourceMarkdown = scraped.markdown;
      sourceUrl = scraped.sourceUrl;
    } else {
      const searchQueries = await generateFdaSearchQueries(
        args.cptCodes,
        args.icd10Codes,
        args.drugOrDeviceName || "",
      );

      let foundSource: FirecrawlPolicySource | null = null;
      for (const query of searchQueries) {
        try {
          const response = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${firecrawlApiKey}`,
            },
            body: JSON.stringify({
              query,
              limit: 5,
              sources: ["web"],
            }),
          });

          if (!response.ok) continue;
          const payload = await response.json();
          const candidateUrls = selectFirecrawlPolicyUrls(payload, ["fda", "label", "indication", "package insert", "accessdata"], 0, 4);

          for (const candUrl of candidateUrls) {
            try {
              const scraped = await scrapeFirecrawlPolicySource(firecrawlApiKey, candUrl);
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
      };
    });

    if (evidencesToInsert.length > 0) {
      await ctx.runMutation((api as any).clinicalEvidences.insertBatch, {
        claimId: args.claimId,
        evidences: evidencesToInsert,
      });

      await ctx.runMutation((api as any).claims.updateStatus, {
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
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey?.trim()) {
      throw new Error("Custom URL research requires FIRECRAWL_API_KEY.");
    }

    if (!isAcceptableSourceUrl(args.customUrl)) {
      throw new Error("Please provide a valid HTTP or HTTPS web URL.");
    }

    const scraped = await scrapeFirecrawlPolicySource(firecrawlApiKey, args.customUrl);
    const windowedText = scraped.markdown.slice(0, 45000);
    const category = args.sourceCategory || "payer_cpb";

    const extracted = await createStructuredCompletion<CustomGuidelineExtractionResponse>({
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

    const evidencesToInsert = extracted.clauses.map((clause) => ({
      sourceType: category,
      title: `${extracted.documentTitle} (${extracted.issuingAuthority || "Clinical Authority"})`.replace(/\*\*/g, ""),
      sourceUrl: scraped.sourceUrl || args.customUrl,
      citationClause: clause.citationClause.replace(/\*\*/g, ""),
      extractedEvidenceMarkdown: clause.extractedEvidenceMarkdown.replace(/\*\*/g, "").trim(),
      relevanceScore: clause.relevanceScore || 88,
    }));

    if (evidencesToInsert.length > 0) {
      await ctx.runMutation((api as any).clinicalEvidences.insertBatch, {
        claimId: args.claimId,
        evidences: evidencesToInsert,
      });

      await ctx.runMutation((api as any).claims.updateStatus, {
        claimId: args.claimId,
        status: "analyzing",
        details: `Firecrawl extracted ${evidencesToInsert.length} clauses from custom URL: ${extracted.documentTitle}.`,
      });
    }

    return {
      documentTitle: extracted.documentTitle,
      issuingAuthority: extracted.issuingAuthority,
      effectiveDate: extracted.effectiveDate,
      clausesExtracted: evidencesToInsert.length,
      evidences: evidencesToInsert,
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
    // Clear prior evidence to start fresh multi-source sweep
    await ctx.runMutation((api as any).clinicalEvidences.clearByClaim, {
      claimId: args.claimId,
    });

    const results: {
      cpbResult?: any;
      pubMedResult?: any;
      fdaResult?: any;
      errors: string[];
    } = {
      errors: [],
    };

    // 1. Crawl Insurer CPB / Guideline
    try {
      results.cpbResult = await ctx.runAction((api as any).actions?.policyCrawler?.crawlInsurerPolicy || (api as any)["actions/policyCrawler"]?.crawlInsurerPolicy, {
        claimId: args.claimId,
        payer: args.payer,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
        denialReasonCode: args.denialReasonCode,
        denialReasonDescription: args.denialReasonDescription,
        customPolicyUrl: args.customPolicyUrl,
      });
    } catch (err: any) {
      results.errors.push(`CPB Crawl: ${err?.message || "Failed"}`);
    }

    // 2. Crawl PubMed & ClinicalTrials
    try {
      results.pubMedResult = await ctx.runAction((api as any).actions?.policyCrawler?.crawlPubMedAndTrials || (api as any)["actions/policyCrawler"]?.crawlPubMedAndTrials, {
        claimId: args.claimId,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
        denialReasonCode: args.denialReasonCode,
        denialReasonDescription: args.denialReasonDescription,
      });
    } catch (err: any) {
      results.errors.push(`PubMed Scrape: ${err?.message || "Failed"}`);
    }

    // 3. Crawl FDA Labels & Indications
    try {
      results.fdaResult = await ctx.runAction((api as any).actions?.policyCrawler?.crawlFdaIndications || (api as any)["actions/policyCrawler"]?.crawlFdaIndications, {
        claimId: args.claimId,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
        denialReasonCode: args.denialReasonCode,
      });
    } catch (err: any) {
      results.errors.push(`FDA Crawler: ${err?.message || "Failed"}`);
    }

    // Ensure ERISA statutory legal precedent is always present
    await ctx.runMutation((api as any).clinicalEvidences.insertSingle, {
      claimId: args.claimId,
      sourceType: "legal_precedent",
      title: "ERISA Full & Fair Review Statutory Protocol",
      sourceUrl: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
      citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
      extractedEvidenceMarkdown: "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Adverse benefit determinations lacking specific clinical justification violate the claimant's right to a full and fair review.",
      relevanceScore: 95,
    });

    return {
      success: true,
      cpbClauses: results.cpbResult?.clausesExtracted || 0,
      pubMedClauses: results.pubMedResult?.clausesExtracted || 0,
      fdaClauses: results.fdaResult?.clausesExtracted || 0,
      errors: results.errors,
    };
  },
});

