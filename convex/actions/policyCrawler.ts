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

const MAX_POLICY_SEARCH_ROUNDS = 1;
const MAX_POLICY_SOURCE_CANDIDATES = 3;
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

const NEUTRAL_PUBLIC_HOSTS = new Set([
  "cms.gov",
  "www.cms.gov",
  "medicare.gov",
  "www.medicare.gov",
  "medicaid.gov",
  "www.medicaid.gov",
  "fda.gov",
  "www.fda.gov",
  "nih.gov",
  "www.nih.gov",
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
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
]);

function getPayerHostKeyword(payer: string): string | null {
  const clean = payer.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.includes("molina")) return "molina";
  if (clean.includes("bcbsfl") || clean.includes("bluecrossblueshieldflorida")) return "bcbsfl";
  if (clean.includes("bcbs") || clean.includes("bluecross") || clean.includes("anthem") || clean.includes("elevance")) return "bcbs";
  if (clean.includes("aetna") || clean.includes("cvs")) return "aetna";
  if (clean.includes("cigna") || clean.includes("evernorth")) return "cigna";
  if (clean.includes("united") || clean.includes("uhc") || clean.includes("optum")) return "uhc";
  if (clean.includes("humana")) return "humana";
  if (clean.includes("kaiser")) return "kaiser";
  if (clean.includes("geoblue") || clean.includes("geo_blue")) return "geo-blue";
  if (clean.includes("globalcore")) return "globalcore";
  return null;
}

export function isPayerMismatchedSource(payer: string, sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    // Neutral public hosts (CMS, FDA, NIH, ECFr, etc.) are payer-agnostic and always allowed.
    if (NEUTRAL_PUBLIC_HOSTS.has(host) || [...NEUTRAL_PUBLIC_HOSTS].some((h) => host.endsWith(`.${h}`) || host === h)) return false;
    // Explicit ECFr / law hosts used for ERISA precedent are neutral.
    if (host.includes("ecfr.gov") || host.includes("law.cornell.edu")) return false;

    const payerKeyword = getPayerHostKeyword(payer);
    if (!payerKeyword) return false; // Unknown payer, defer to LLM

    // If the host is a known payer host but does not contain the payer keyword, it's a mismatch.
    // Example: molina claim + mcgs.bcbsfl.com (contains bcbsfl/bcbs, not molina) → mismatch.
    // This is generic: any host containing a payer keyword from a different payer is suspect.
    const knownPayerKeywords = ["molina", "bcbsfl", "bcbs", "aetna", "cigna", "uhc", "humana", "kaiser", "geo-blue", "globalcore", "mcgs"];
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
      const score = termScore + specificDocumentScore + documentFormatScore - landingPagePenalty - privateViewerPenalty;

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

  // Public accessibility is determined solely via Firecrawl (no direct fetch) per
  // production constraint: all web retrieval must use Firecrawl. Firecrawl's
  // headless browser already bypasses Incapsula/Cloudflare bot challenges and
  // returns the rendered markdown; an additional direct fetch would be redundant
  // and would incorrectly flag Incapsula-protected payer pages (e.g., horizonblue.com)
  // as blocked even though Firecrawl succeeded. Trust Firecrawl's statusCode +
  // markdown checks above as the source of truth.

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

function getCptKeywords(cptCodes: string[]): string[] {
  // Keywords are derived from the CPT's clinical name, not from any payer URL.
  // This keeps the check generic: a knee policy must mention knee/arthroplasty/TKA, etc.
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
  // If none of the codes are in the clinical dictionary, let the LLM decide.
  // Returning an empty set signals "no deterministic gate".
  if (!hasKnown) return [];
  return [...new Set(terms)];
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
  // Hard payer and viewer gates before LLM: these are cheap, deterministic and avoid citing
  // a different payer's policy or a licensed MCG viewer that is not publicly citable.
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

  // Provide the LLM with the human-readable CPT meaning so it can compare anatomical sites.
  const cptDescriptions = cptCodes
    .map((code) => {
      const name = CPT_CLINICAL_NAMES[code];
      return name ? `${code} (${name})` : code;
    })
    .join(", ");

  const llmResult = await createStructuredCompletion<PolicyRelevanceResponse>({
    systemPrompt: `You are a strict document relevance classifier for health-insurance claim appeals.
Return relevant=true only when the supplied document is a clinical coverage policy, medical-necessity guideline, utilization-management criterion, or equivalent payer clinical rule that directly addresses the submitted claim's procedure, diagnosis, or denial issue.

Relevance requires all of:
- Payer alignment: the source must be from the claimed payer's own policy domain (e.g., molinahealthcare.com for Molina) or a neutral public guideline (CMS, FDA, NIH, NCCN, ECFr). A BCBSFL or other payer's domain for a Molina claim is NOT relevant unless it is a neutral guideline.
- Viewer check: private Milliman Care Guidelines viewers (mcgs.*, /MCG?, mcgId=, pv=false) are NOT publicly citable and must be rejected.
- Anatomical and procedural alignment: the document must concern the same body site / specialty as the claimed procedure. For example, a foot bunionectomy / hallux valgus policy (foot, hallux, metatarsal, bunion) is NOT relevant to a total knee arthroplasty (knee, arthroplasty, TKA) claim, even though both are orthopedic.
- The document must address the claimed CPT's clinical category. If the claim is 27447 Total Knee Arthroplasty, a valid document must discuss knee arthroplasty, knee replacement, or TKA — not spinal, foot, or unrelated services.
- Translate CPT/ICD codes to their clinical meaning when the dictionary mapping is obvious; otherwise require the code string itself to appear.

Return relevant=false for billing manuals, EDI companion guides, provider enrollment instructions, claim-submission instructions, general payer pages, search-result pages, access-denied pages, private MCG viewers, wrong-payer domains, or documents that concern a different service or anatomical site.
Use only the document text and claim identifiers supplied. Do not infer relevance from the payer name alone. If uncertain, return relevant=false. Keep the rationale concise.`,
    userPrompt: `Evaluate this Firecrawl document before it is used as appeal evidence.

Payer: ${payer}
Procedure code(s): ${cptDescriptions}
Diagnosis code(s): ${icd10Codes.join(", ") || "Not provided"}
Denial reason code: ${denialReasonCode || "Not provided"}
Denial description: ${denialReasonDescription || "Not provided"}
Source URL: ${policySource.sourceUrl}

Document excerpt (title may be first line):
${policySource.markdown.slice(0, 50000)}`,
    schemaName: "PolicyRelevanceResponse",
    schema: POLICY_RELEVANCE_SCHEMA,
    temperature: 0,
  });

  // Deterministic anatomical guard: even if the LLM is permissive, a document whose
  // title + body contains none of the expected CPT keywords is not citable for that CPT.
  // This is generic — keywords come from the CPT dictionary, not hard-coded sites.
  if (llmResult.relevant) {
    const titleGuess = policySource.markdown.split("\n")[0]?.slice(0, 300) || "";
    const alignment = isPolicyAlignedWithClaim(policySource.markdown, titleGuess, cptCodes);
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
    systemPrompt: `Create concise, high-signal web-search queries for locating the official payer clinical coverage policy or medical-necessity guideline relevant to a health-insurance claim.
Use the supplied payer, procedure codes, diagnosis codes, and denial information. Translate codes into likely clinical terminology only when you are confident; otherwise retain the codes. Every query must seek a clinical policy, coverage guideline, medical-necessity criterion, or utilization-management rule. Do not seek general member pages, EDI or billing manuals, provider enrollment instructions, claim-submission guides, search-result pages, or legal advice. Do not invent URLs, policy numbers, or facts. Return 1-2 distinct English queries; at least one must contain the payer name with clinical context, and for payers with sparse public CPB corpora (e.g., GeoBlue) one may be a neutral query without payer targeting CMS/NASS/AAOS medical necessity criteria for the procedure to ensure Firecrawl still returns citable public guidelines.${rejectedSearchFeedback ? `
The previous search pass produced these rejected results or failures:
${rejectedSearchFeedback.slice(0, 6000)}
Generate materially different queries that correct for those failures.` : ""}`,
    userPrompt: `Build the search plan for this claim.

Payer: ${payer}
Procedure code(s): ${cptCodes.join(", ") || "Not provided"}
Diagnosis code(s): ${icd10Codes.join(", ") || "Not provided"}
Denial reason code: ${denialReasonCode || "Not provided"}
Denial description: ${denialReasonDescription || "Not provided"}`,
    schemaName: "PolicySearchIntentResponse",
    schema: POLICY_SEARCH_INTENT_SCHEMA,
    temperature: 0,
  });

  const queries = [...new Set(
    result.queries
      .filter((query): query is string => typeof query === "string")
      .map((query) => query.trim())
      .filter(Boolean),
  )].slice(0, 2);

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
                  limit: 5,
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
          // Pre-filter candidates by CPT clinical keywords before spending scrape credits.
          // Only titles/snippets containing a CPT keyword (knee/arthroplasty/tka for 27447)
          // will bubble to the top 3, avoiding wasted scrapes on unrelated policies.
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

    // Guard against soft-blocked content that slipped past the fetch gate
    // (e.g., Firecrawl bypassed WAF but the extracted text is still an error page).
    if (isAccessDeniedDocument(policyText) || isHtmlErrorBody(policyText)) {
      throw new Error("Scraped policy text is an access-denied or error page, not a clinical policy.");
    }

    // Use gpt-5-nano to extract precise medical criteria and contradiction clauses.
    const extractedData = await createStructuredCompletion<PolicyExtractionResponse>({
      systemPrompt: `You are an expert Medical Legal Analyst and Clinical Auditor.
Analyze the provided insurer Clinical Policy Bulletin (CPB) or clinical guideline.
Extract all key medical necessity qualifying criteria, specific clause identifiers (e.g. Section 1.A, Section 2.3), and contradiction rules that can be cited in an ERISA medical appeal against denial code ${args.denialReasonCode}.
For each clause:
- Assign sourceType: "payer_cpb", "pubmed_study", "fda_package_insert", "nccn_guideline", or "legal_precedent".
- Extract clear, concise plain text summarizing the exact clinical requirements. Strictly do NOT use markdown bold asterisks (such as **bold**) or formatting tokens in extractedEvidenceMarkdown or title.
- Assign relevanceScore between 80 and 99.`,
      userPrompt: `Extract structured clinical evidence clauses from this policy text for CPT codes [${args.cptCodes.join(", ")}] and Payer ${args.payer}:\n\n${policyText}`,
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
