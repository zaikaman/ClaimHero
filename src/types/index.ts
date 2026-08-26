/**
 * ClaimHero Domain Types & Data Contracts
 */

export type ClaimStatus =
  | "ingested"
  | "parsing"
  | "analyzing"
  | "precedent_matched"
  | "drafting"
  | "ready_for_review"
  | "dispatched"
  | "won"
  | "lost"
  | "escalated";

export type RiskLevel = "high_confidence" | "moderate" | "complex_litigation";

export type AppealLevel =
  | "level_1_internal"
  | "level_2_grievance"
  | "level_3_external_state_review";

export type EvidenceSourceType =
  | "payer_cpb"
  | "fda_package_insert"
  | "pubmed_study"
  | "nccn_guideline"
  | "legal_precedent";

export interface Patient {
  _id: string;
  name: string;
  email: string;
  memberId: string;
  groupNumber?: string;
  insurancePayer: string;
  state: string;
  createdAt: number;
}

export interface Claim {
  _id: string;
  patientId: string;
  claimNumber: string;
  serviceDate: string;
  providerName: string;
  deniedAmount: number;
  patientOwedAmount: number;
  cptCodes: string[];
  icd10Codes: string[];
  denialReasonCode: string;
  denialReasonDescription: string;
  status: ClaimStatus;
  statutoryDeadline: number;
  daysRemaining: number;
  overturnProbabilityScore?: number;
  riskLevel?: RiskLevel;
  assignedAgentEmail: string;
  denialLetterStorageId?: string;
  createdAt: number;
  updatedAt: number;
  patient?: Patient;
}

export interface ClinicalEvidence {
  _id: string;
  claimId: string;
  sourceType: EvidenceSourceType;
  title: string;
  sourceUrl?: string;
  citationClause: string;
  extractedEvidenceMarkdown: string;
  relevanceScore: number;
  createdAt: number;
}

export interface Appeal {
  _id: string;
  claimId: string;
  version: number;
  appealLevel: AppealLevel;
  executiveSummary: string;
  medicalNecessityArguments: string;
  legalCitations: string;
  fullAppealMarkdown: string;
  pdfExportStorageId?: string;
  lastEditedBy: string;
  updatedAt: number;
}

export interface EmailThread {
  _id: string;
  claimId: string;
  agentEmail: string;
  payerEmail: string;
  subject: string;
  status: "active" | "dispatched" | "response_received" | "resolved";
  lastMessageAt: number;
}

export interface EmailMessage {
  _id: string;
  threadId: string;
  claimId: string;
  direction: "inbound" | "outbound";
  sender: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  hasAttachments: boolean;
  receivedAt: number;
}

export interface AppealAuditLog {
  _id: string;
  claimId: string;
  eventType: string;
  actor: string;
  details: string;
  timestamp: number;
}

export type AuditLog = AppealAuditLog;

// LLM Output Structured Schemas
export interface DenialExtractionResult {
  claimNumber: string;
  patientName: string;
  memberId: string;
  insurancePayer: string;
  serviceDate: string;
  providerName: string;
  deniedAmount: number;
  patientOwedAmount: number;
  cptCodes: string[];
  icd10Codes: string[];
  denialReasonCode: string;
  denialReasonDescription: string;
  appealFilingDeadlineDays: number;
}

export interface OverturnScoringResult {
  overturnProbabilityScore: number;
  riskLevel: RiskLevel;
  keyPolicyContradictions: string[];
  winningPrecedentSummary: string;
  suggestedAppealLevel: AppealLevel;
}

export interface PolicyCitation {
  source: string;
  clause: string;
  quote: string;
}

export interface AppealBriefSynthesisResult {
  executiveSummary: string;
  statutoryRightsNotice: string;
  medicalNecessityArguments: string;
  policyCitations: PolicyCitation[];
  formalDemandForPayment: string;
  fullAppealMarkdown: string;
}

// Simulation & Navigation Types
export interface SimulationProgress {
  currentStage: number;
  totalStages: number;
  stageName: string;
  stageDescription: string;
  isComplete: boolean;
  claimId?: string;
}

export interface DashboardStats {
  totalClaims: number;
  activeDisputedAmount: number;
  overturnedWonAmount: number;
  averageWinScore: number;
  criticalDeadlinesCount: number;
}
