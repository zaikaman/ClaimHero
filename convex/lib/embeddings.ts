/**
 * 1536-d embedding normalization and ranking helpers for the Precedent Vector Archive.
 *
 * Primary path (createEmbedding in openai.ts) calls the OpenAI embeddings endpoint
 * with OPENAI_EMBEDDING_MODEL (e.g. text-embedding-3-small) and fits dimensions to 1536.
 */

export const EMBEDDING_DIMENSIONS = 1536;

export type PrecedentSourceKind =
  | "winning_brief"
  | "commissioner_ruling"
  | "court_overturn"
  | "statutory_authority";

export interface PrecedentEmbedFields {
  title: string;
  citation: string;
  winningArgument: string;
  statutoryLanguage: string;
  outcome: string;
  icd10Codes: string[];
  cptCodes: string[];
  carcCodes: string[];
  sourceKind: string;
}

export interface ClaimQueryFields {
  cptCodes: string[];
  icd10Codes: string[];
  denialReasonCode: string;
  denialReasonDescription: string;
}

export interface RankablePrecedentHit {
  _id: string;
  vectorScore: number;
  icd10Codes: string[];
  cptCodes: string[];
  carcCodes: string[];
  title?: string;
  citation?: string;
}

export function l2Normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) {
    const fallback = vector.slice();
    fallback[0] = 1;
    return fallback;
  }
  return vector.map((value) => value / magnitude);
}

export function fitDimensions(vector: number[], dimensions: number = EMBEDDING_DIMENSIONS): number[] {
  if (vector.length === dimensions) {
    return l2Normalize(vector);
  }
  if (vector.length > dimensions) {
    return l2Normalize(vector.slice(0, dimensions));
  }
  const padded = vector.concat(new Array(dimensions - vector.length).fill(0));
  return l2Normalize(padded);
}

export function weightedTokensForCodes(
  icd10Codes: string[],
  cptCodes: string[],
  carcCodes: string[]
): string[] {
  const tokens: string[] = [];
  for (const code of icd10Codes) {
    const normalized = code.toUpperCase().trim();
    if (!normalized) continue;
    tokens.push(`icd:${normalized.toLowerCase()}`);
    tokens.push(`icd:${normalized.slice(0, 3).toLowerCase()}`);
  }
  for (const code of cptCodes) {
    const digits = code.replace(/\D/g, "");
    if (digits) {
      tokens.push(`cpt:${digits}`);
    }
  }
  for (const code of carcCodes) {
    const normalized = code.toUpperCase().trim();
    if (normalized) {
      tokens.push(`carc:${normalized.toLowerCase()}`);
    }
  }
  return tokens;
}

export function buildPrecedentEmbedText(doc: PrecedentEmbedFields): string {
  return [
    `Source: ${doc.sourceKind}`,
    `Title: ${doc.title}`,
    `Citation: ${doc.citation}`,
    `ICD-10: ${doc.icd10Codes.join(", ")}`,
    `CPT: ${doc.cptCodes.join(", ")}`,
    `CARC: ${doc.carcCodes.join(", ")}`,
    `Outcome: ${doc.outcome}`,
    `Winning argument: ${doc.winningArgument}`,
    `Statutory language: ${doc.statutoryLanguage}`,
  ].join("\n");
}

export function buildClaimQueryText(claim: ClaimQueryFields): string {
  return [
    `Source: winning_brief commissioner_ruling court_overturn statutory_authority`,
    `ICD-10: ${claim.icd10Codes.join(", ")}`,
    `CPT: ${claim.cptCodes.join(", ")}`,
    `CARC: ${claim.denialReasonCode}`,
    `Denial: ${claim.denialReasonDescription}`,
    `Query: historical winning medical insurance appeal arguments for procedure ${claim.cptCodes.join(", ")} diagnosis ${claim.icd10Codes.join(", ")} denial ${claim.denialReasonCode} medical necessity ERISA 29 CFR 2560.503-1 independent external review`,
  ].join("\n");
}

export const RRF_K_CONSTANT = 60;


export interface HybridRankableHit {
  _id: string;
  icd10Codes: string[];
  cptCodes: string[];
  carcCodes: string[];
  title?: string;
  citation?: string;
  vectorScore?: number;
  textScore?: number;
  winningArgument?: string;
  statutoryLanguage?: string;
  outcome?: string;
  sourceKind?: string;
  sourceUrl?: string;
  jurisdiction?: string;
}

export interface FusedPrecedentHit<T> {
  hit: T;
  vectorRank?: number;
  textRank?: number;
  rrfScore: number;
  vectorScore: number;
  textScore: number;
  codeOverlap: number;
  combinedScore: number;
  retrievalSource: "hybrid_fusion" | "vector_only" | "bm25_only";
}

/**
 * Extract clean, high-signal lexical query keywords from claim details
 * for Convex BM25 .withSearchIndex("search_precedents") lexical matching.
 */
export function buildClaimLexicalTerms(claim: ClaimQueryFields): string {
  const terms: string[] = [];

  // Add primary clinical codes
  for (const cpt of claim.cptCodes) {
    const digits = cpt.replace(/\D/g, "");
    if (digits) terms.push(digits);
  }
  for (const icd of claim.icd10Codes) {
    const clean = icd.trim();
    if (clean) terms.push(clean);
  }
  if (claim.denialReasonCode) {
    terms.push(claim.denialReasonCode.trim());
  }

  // Extract key clinical phrases from denial description
  if (claim.denialReasonDescription) {
    const cleanDesc = claim.denialReasonDescription
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !/^(this|that|with|from|have|been|were|when|your|what|will)$/i.test(w));
    terms.push(...cleanDesc.slice(0, 6));
  }

  // Default statutory phrases if empty
  if (terms.length === 0) {
    terms.push("medical", "necessity", "criteria", "erisa");
  }

  return terms.join(" ");
}

/**
 * Calculate clinical & billing code overlap score (ICD-10 exact/family, CPT, CARC)
 */
export function calculateCodeOverlap(
  doc: { icd10Codes: string[]; cptCodes: string[]; carcCodes: string[] },
  query: ClaimQueryFields
): number {
  const queryIcd = new Set(query.icd10Codes.map((c) => c.toUpperCase().trim()).filter(Boolean));
  const queryIcdFamilies = new Set([...queryIcd].map((c) => c.slice(0, 3)));
  const queryCpt = new Set(query.cptCodes.map((c) => c.replace(/\D/g, "")).filter(Boolean));
  const queryCarc = query.denialReasonCode.toUpperCase().trim();

  const icdHits = doc.icd10Codes.filter((c) => {
    const normalized = c.toUpperCase().trim();
    return queryIcd.has(normalized) || queryIcdFamilies.has(normalized.slice(0, 3));
  }).length;
  const cptHits = doc.cptCodes.filter((c) => queryCpt.has(c.replace(/\D/g, ""))).length;
  const carcHit = doc.carcCodes.some((c) => c.toUpperCase().trim() === queryCarc) ? 1 : 0;

  const denominator = Math.max(1, queryIcd.size + queryCpt.size + (queryCarc ? 1 : 0));
  return Math.min(1, (icdHits + cptHits + carcHit) / denominator);
}

/**
 * Reciprocal Rank Fusion (RRF) algorithm combining dense vector search rankings
 * and BM25 full-text lexical search rankings with structured domain code overlap.
 *
 * Mathematical formula (Cormack, Clarke & Büttcher, SIGIR 2009):
 *   RRF_score(d) = Σ_{m ∈ {vector, bm25}} (w_m / (k + rank_m(d)))
 *
 * Parameters:
 *   - k: smoothing constant (standard benchmark default = 60)
 *   - vectorHits: dense vector retrieval results ordered by descending similarity
 *   - lexicalHits: BM25 lexical retrieval results ordered by descending text match
 *   - query: claim clinical codes and denial reasoning
 *   - options: custom weights, limit, and k factor
 */
export function reciprocalRankFusion<
  V extends HybridRankableHit,
  L extends HybridRankableHit = V,
>(
  vectorHits: V[],
  lexicalHits: L[],
  query: ClaimQueryFields,
  options: {
    k?: number;
    vectorWeight?: number;
    lexicalWeight?: number;
    limit?: number;
  } = {}
): Array<(V | L) & {
  vectorRank?: number;
  textRank?: number;
  rrfScore: number;
  vectorScore: number;
  textScore: number;
  codeOverlap: number;
  combinedScore: number;
  retrievalSource: "hybrid_fusion" | "vector_only" | "bm25_only";
}> {
  const k = options.k ?? RRF_K_CONSTANT;
  const vectorWeight = options.vectorWeight ?? 1.0;
  const lexicalWeight = options.lexicalWeight ?? 1.0;
  const limit = options.limit ?? 3;

  const maxPossibleRrf = vectorWeight / (k + 1) + lexicalWeight / (k + 1);

  // Map candidate documents by unique ID
  const candidateMap = new Map<string, V | L>();
  const vectorRankMap = new Map<string, number>();
  const textRankMap = new Map<string, number>();

  vectorHits.forEach((hit, idx) => {
    const id = String(hit._id);
    if (!candidateMap.has(id)) {
      candidateMap.set(id, hit);
    }
    // 1-based rank
    if (!vectorRankMap.has(id)) {
      vectorRankMap.set(id, idx + 1);
    }
  });

  lexicalHits.forEach((hit, idx) => {
    const id = String(hit._id);
    if (!candidateMap.has(id)) {
      candidateMap.set(id, hit);
    }
    // 1-based rank
    if (!textRankMap.has(id)) {
      textRankMap.set(id, idx + 1);
    }
  });


  const candidates = Array.from(candidateMap.values());

  const scoredCandidates = candidates.map((doc) => {
    const id = String(doc._id);
    const vRank = vectorRankMap.get(id);
    const tRank = textRankMap.get(id);

    const vScoreComponent = vRank ? vectorWeight / (k + vRank) : 0;
    const tScoreComponent = tRank ? lexicalWeight / (k + tRank) : 0;
    const rrfScore = vScoreComponent + tScoreComponent;

    let retrievalSource: "hybrid_fusion" | "vector_only" | "bm25_only";
    if (vRank && tRank) {
      retrievalSource = "hybrid_fusion";
    } else if (vRank) {
      retrievalSource = "vector_only";
    } else {
      retrievalSource = "bm25_only";
    }

    const codeOverlap = calculateCodeOverlap(doc, query);
    const normalizedRrf = maxPossibleRrf > 0 ? Math.min(1, rrfScore / maxPossibleRrf) : 0;

    // Vector score preservation: use doc's vectorScore if present, else derive from rank
    const vectorScore = typeof doc.vectorScore === "number"
      ? doc.vectorScore
      : vRank
        ? Math.max(0.1, 1 - (vRank - 1) * 0.05)
        : 0;

    // Lexical score: normalized reciprocal rank
    const textScore = tRank ? Math.max(0.1, 1 / tRank) : 0;

    // Composite combined score: 65% RRF Fusion + 35% Domain Code Overlap
    const combinedScore = normalizedRrf * 0.65 + codeOverlap * 0.35;

    return {
      ...doc,
      vectorRank: vRank,
      textRank: tRank,
      rrfScore: Math.round(rrfScore * 10000) / 10000,
      vectorScore: Math.round(vectorScore * 10000) / 10000,
      textScore: Math.round(textScore * 10000) / 10000,
      codeOverlap: Math.round(codeOverlap * 10000) / 10000,
      combinedScore: Math.round(combinedScore * 10000) / 10000,
      retrievalSource,
    };
  });

  // Sort by descending combined score (with RRF score tiebreaker)
  scoredCandidates.sort((a, b) => {
    if (Math.abs(b.combinedScore - a.combinedScore) > 0.0001) {
      return b.combinedScore - a.combinedScore;
    }
    return b.rrfScore - a.rrfScore;
  });

  // Deduplicate by title / citation
  const seen = new Set<string>();
  const deduplicated: typeof scoredCandidates = [];
  for (const item of scoredCandidates) {
    const key = (item.citation || item.title || String(item._id)).trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(item);
      if (deduplicated.length >= limit) break;
    }
  }

  return deduplicated;
}

export function rankPrecedentHits<T extends RankablePrecedentHit>(
  hits: T[],
  query: ClaimQueryFields,
  limit = 3
): Array<T & { combinedScore: number; codeOverlap: number }> {
  const scored = hits.map((hit) => {
    const codeOverlap = calculateCodeOverlap(hit, query);
    const combinedScore = hit.vectorScore * 0.65 + codeOverlap * 0.35;
    return { ...hit, combinedScore, codeOverlap };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);

  const seen = new Set<string>();
  const deduplicated: Array<T & { combinedScore: number; codeOverlap: number }> = [];
  for (const item of scored) {
    const key = (item.citation || item.title || String(item._id)).trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(item);
      if (deduplicated.length >= limit) break;
    }
  }

  return deduplicated;
}

export function formatPrecedentInsertion(match: {
  title: string;
  citation: string;
  statutoryLanguage: string;
  winningArgument: string;
  vectorScore: number;
  retrievalSource?: string;
  rrfScore?: number;
}): string {
  const similarity = Math.round(Math.max(0, Math.min(1, (match.vectorScore + 1) / 2)) * 1000) / 10;
  const methodBadge = match.retrievalSource === "hybrid_fusion"
    ? " [Hybrid Vector+BM25 RRF]"
    : match.retrievalSource === "bm25_only"
      ? " [BM25 Lexical]"
      : "";
  return [
    `### Controlling Precedent: ${match.title}${methodBadge}`,
    ``,
    `> ${match.statutoryLanguage}`,
    ``,
    match.winningArgument,
    ``,
    `*Citation: ${match.citation} (vector similarity ${similarity}%${match.rrfScore ? `, RRF score: ${match.rrfScore.toFixed(4)}` : ""})*`,
  ].join("\n");
}

