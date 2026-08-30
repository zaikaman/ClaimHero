/**
 * Deterministic 1536-d embedding helpers for the Precedent Vector Archive.
 *
 * Primary path (createEmbedding in openai.ts) calls the OpenAI embeddings
 * endpoint with OPENAI_MODEL. Proxies that only expose chat completions fall
 * back to signed feature hashing of the same canonical text so index and query
 * stay in one vector space.
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
}

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

export function hashEmbed(text: string, extraWeightedTokens: string[] = []): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9§.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").filter((token) => token.length > 1);

  const addToken = (token: string, weight: number) => {
    const h1 = fnv1a(token);
    const h2 = fnv1a(`${token}#sign`);
    const h3 = fnv1a(`${token}#alt`);
    const sign = (h2 & 1) === 0 ? 1 : -1;
    vector[h1 % EMBEDDING_DIMENSIONS] += sign * weight;
    vector[h3 % EMBEDDING_DIMENSIONS] += sign * weight * 0.45;
  };

  for (const token of tokens) {
    addToken(token, 1);
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    addToken(`${tokens[i]}_${tokens[i + 1]}`, 0.65);
  }
  for (const extra of extraWeightedTokens) {
    const cleaned = extra.toLowerCase().trim();
    if (cleaned.length > 0) {
      addToken(cleaned, 3.2);
    }
  }

  return l2Normalize(vector);
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

export function rankPrecedentHits<T extends RankablePrecedentHit>(
  hits: T[],
  query: ClaimQueryFields,
  limit = 3
): Array<T & { combinedScore: number; codeOverlap: number }> {
  const queryIcd = new Set(query.icd10Codes.map((code) => code.toUpperCase().trim()).filter(Boolean));
  const queryIcdFamilies = new Set(
    [...queryIcd].map((code) => code.slice(0, 3))
  );
  const queryCpt = new Set(query.cptCodes.map((code) => code.replace(/\D/g, "")).filter(Boolean));
  const queryCarc = query.denialReasonCode.toUpperCase().trim();

  const scored = hits.map((hit) => {
    const icdHits = hit.icd10Codes.filter((code) => {
      const normalized = code.toUpperCase().trim();
      return queryIcd.has(normalized) || queryIcdFamilies.has(normalized.slice(0, 3));
    }).length;
    const cptHits = hit.cptCodes.filter((code) => queryCpt.has(code.replace(/\D/g, ""))).length;
    const carcHit = hit.carcCodes.some((code) => code.toUpperCase().trim() === queryCarc) ? 1 : 0;
    const denominator = Math.max(1, queryIcd.size + queryCpt.size + (queryCarc ? 1 : 0));
    const codeOverlap = Math.min(1, (icdHits + cptHits + carcHit) / denominator);
    const combinedScore = hit.vectorScore * 0.65 + codeOverlap * 0.35;
    return { ...hit, combinedScore, codeOverlap };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);

  const seen = new Set<string>();
  const deduplicated: Array<T & { combinedScore: number; codeOverlap: number }> = [];
  for (const item of scored) {
    const key = ((item as any).citation || (item as any).title || String(item._id)).trim().toLowerCase();
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
}): string {
  const similarity = Math.round(Math.max(0, Math.min(1, (match.vectorScore + 1) / 2)) * 1000) / 10;
  return [
    `### Controlling Precedent: ${match.title}`,
    ``,
    `> ${match.statutoryLanguage}`,
    ``,
    match.winningArgument,
    ``,
    `*Citation: ${match.citation} (vector similarity ${similarity}%)*`,
  ].join("\n");
}
