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
  scoringBreakdown?: ScoringCriterion[];
  assignedAgentEmail: string;
  agentMailInboxId?: string;
  agentMailInboxEmail?: string;
  agentMailAdjudicatorInboxId?: string;
  agentMailAdjudicatorEmail?: string;
  autoPilotEnabled?: boolean;
  agentMailProvisioningStatus?: "pending" | "shared" | "provisioned" | "not_configured" | "failed" | string;
  agentMailProvisioningError?: string;
  denialLetterStorageId?: string;
  appealContext?: AppealContext;
  redactionMetadata?: RedactionMetadata;
  financialLiability?: FinancialLiabilityData;
  erisaPenalties?: ErisaPenaltyData;
  isDemo?: boolean;
  dataOrigin?: string;
  isSyntheticPII?: boolean;
  createdAt: number;
  updatedAt: number;
  patient?: Patient;
  latestAppeal?: Appeal | null;
  evidenceCount?: number;
  payerContact?: PayerContact;
}

export type NetworkStatus = "in_network" | "out_of_network";

export interface FinancialLiabilityData {
  billedAmount: number;
  allowedAmount: number;
  contractualDiscount: number;
  deductibleTotal: number;
  deductibleMet: number;
  coinsuranceRate: number; // 0 - 100
  copayAmount: number;
  outOfPocketMax: number;
  outOfPocketSpent: number;
  networkStatus: NetworkStatus;
  noSurprisesActProtected: boolean;
  calculatedPatientShare: number;
  balanceBillingAmount: number;
  totalPatientExposureDenied: number;
  totalPatientLiabilityOverturned: number;
  netPatientSavings: number;
  payerExpectedObligation: number;
  updatedAt: number;
}

export interface FinancialScheduleItem {
  id: string;
  label: string;
  description: string;
  deniedAmount: number;
  overturnedAmount: number;
  variance: number;
  type: "charge" | "adjustment" | "cost_share" | "total";
}

export interface FinancialLiabilityResult {
  data: FinancialLiabilityData;
  deductibleApplied: number;
  coinsuranceOwed: number;
  copayOwed: number;
  remainingOopCapacity: number;
  coveredPatientShare: number;
  balanceBillingExposure: number;
  totalPatientExposureDenied: number;
  totalPatientLiabilityOverturned: number;
  netPatientSavings: number;
  payerExpectedObligation: number;
  schedule: FinancialScheduleItem[];
  isOopMaxReached: boolean;
  costSharingBreakdownPercent: {
    deductible: number;
    coinsurance: number;
    copay: number;
    payer: number;
  };
}

export type StatutoryComplianceStatus = "defaulted" | "partial" | "compliant";

export type StatutorySeverityTier =
  | "grace_period"
  | "actionable_default"
  | "egregious_noncompliance"
  | "bad_faith_enforcement";

export interface ErisaPenaltyData {
  documentRequestDate: string; // YYYY-MM-DD
  disclosureDeadlineDate: string; // YYYY-MM-DD
  calculationDate: string; // YYYY-MM-DD
  requestedDocuments: string[];
  complianceStatus: StatutoryComplianceStatus;
  dailyPenaltyRate: number;
  daysInDefault: number;
  accruedPenaltyAmount: number;
  statutoryInterestRate: number; // e.g. 18 for 18%
  accruedInterestAmount: number;
  estimatedAttorneysFees: number;
  totalStatutoryDamages: number;
  totalPlanAdministratorExposure: number;
  severityTier: StatutorySeverityTier;
  statutoryDemandLanguage: string;
  updatedAt: number;
}

export interface ErisaPenaltyTrajectoryItem {
  horizonDays: number;
  futureDate: string;
  projectedDaysInDefault: number;
  projectedPenalties: number;
  projectedInterest: number;
  projectedTotalExposure: number;
}

export interface ErisaPenaltyResult {
  data: ErisaPenaltyData;
  daysElapsedSinceRequest: number;
  graceDaysRemaining: number;
  isPastDeadline: boolean;
  statutoryAuthorityCitation: string;
  trajectories: ErisaPenaltyTrajectoryItem[];
  noticeOfDefaultText: string;
}

export interface RedactionMetadata {
  isRedacted: boolean;
  mode: string;
  redactedEntityCount: number;
  maskedCategories: string[];
  appliedAt: number;
}

export interface AppealSenderDetails {
  name: string;
  credentials?: string;
  email?: string;
  phone?: string;
  npiNumber?: string;
}

export interface ClinicalFacts {
  symptomsAndFunctionalImpact?: string;
  examinationFindings?: string;
  imagingAndDiagnostics?: string;
  treatmentHistoryAndResponse?: string;
  otherDocumentedFacts?: string;
  recordsAreIncomplete: boolean;
}

export interface AppealContext {
  sender: AppealSenderDetails;
  clinicalFacts: ClinicalFacts;
  physicianNotes?: string;
  confirmedAt: number;
}

export type ClinicalIntakeField = keyof Omit<ClinicalFacts, "recordsAreIncomplete">;

export interface ClinicalIntakeQuestion {
  field: ClinicalIntakeField;
  question: string;
  whyItMatters: string;
}

export interface PayerContact {
  officialAppealsEmail?: string;
  intakePortalUrl?: string;
  portalName?: string;
  appealsFax?: string;
  statutoryPoBox?: string;
  ediPayerId?: string;
  tollFreeHelpline?: string;
  isVerified: boolean;
  submissionPolicyNote?: string;
  source?: "preset" | "firecrawl_live" | "document_ocr" | "ai_knowledge" | "unresolved" | string;
}

export interface ScoringCriterion {
  category: "policy_alignment" | "clinical_documentation" | "statutory_erisa" | "precedent_strength" | string;
  criterion: string;
  score: number;
  maxScore: number;
  status: "strong" | "moderate" | "weak";
  rationale: string;
}

export type PrecedentSourceKind =
  | "winning_brief"
  | "commissioner_ruling"
  | "court_overturn"
  | "statutory_authority";

export interface VectorPrecedentMatch {
  _id: string;
  sourceKind: PrecedentSourceKind | string;
  title: string;
  citation: string;
  jurisdiction: string;
  sourceUrl?: string;
  icd10Codes: string[];
  cptCodes: string[];
  carcCodes: string[];
  winningArgument: string;
  statutoryLanguage: string;
  outcome: string;
  vectorScore: number;
  combinedScore: number;
  codeOverlap: number;
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

export type StatutoryPosture =
  | "administrative_reconsideration"
  | "procedural_grievance_bad_faith"
  | "external_iro_erisa_502_petition"
  | string;

export type LegalAggressiveness =
  | "standard"
  | "elevated_grievance"
  | "maximum_statutory_enforcement"
  | string;

export interface Appeal {
  _id: string;
  claimId: string;
  version: number;
  appealLevel: AppealLevel;
  statutoryPosture?: StatutoryPosture;
  targetAuthority?: string;
  legalAggressiveness?: LegalAggressiveness;
  statutoryAuthorities?: string[];
  escalationNotes?: string;
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
  agentMailMessageId?: string;
  detectedDetermination?: "OVERTURNED_APPROVED" | "ADDITIONAL_RECORDS_REQUIRED" | "DENIAL_UPHELD" | "ACKNOWLEDGMENT_ONLY" | "GENERAL_INQUIRY" | string;
  clinicalRationale?: string;
  missingRecordsRequested?: string[];
  settlementAmount?: number;
  autoReplyDraft?: string;
  autoReplyStatus?: "pending" | "dispatched" | "dismissed" | string;
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
  scoringBreakdown?: ScoringCriterion[];
  keyPolicyContradictions: string[];
  winningPrecedentSummary: string;
  suggestedAppealLevel: AppealLevel;
  llmAvailable?: boolean;
  generatedBy?: "openai" | "fallback";
}

export interface PolicyCitation {
  source: string;
  clause: string;
  quote: string;
}

export interface AppealBriefSynthesisResult {
  appealId?: string;
  statutoryPosture?: StatutoryPosture;
  targetAuthority?: string;
  legalAggressiveness?: LegalAggressiveness;
  statutoryAuthorities?: string[];
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

// Multi-Source Clinical Research Hub Types
export type ResearchMode =
  | "multi_source"
  | "payer_cpb"
  | "pubmed_trials"
  | "fda_labels"
  | "custom_url";

export interface ResearchProgressStep {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "running" | "completed" | "error";
  durationMs?: number;
}

export interface MultiSourceCrawlResult {
  success: boolean;
  cpbClauses: number;
  pubMedClauses: number;
  fdaClauses: number;
  errors: string[];
}

export interface PubMedScrapeResult {
  studyTitle: string;
  identifier: string;
  studyDesign: string;
  clausesExtracted: number;
  evidences: Array<{
    sourceType: string;
    title: string;
    sourceUrl?: string;
    citationClause: string;
    extractedEvidenceMarkdown: string;
    relevanceScore: number;
  }>;
}

export interface FdaScrapeResult {
  productName: string;
  applicationNumber: string;
  approvalDate: string;
  clausesExtracted: number;
  evidences: Array<{
    sourceType: string;
    title: string;
    sourceUrl?: string;
    citationClause: string;
    extractedEvidenceMarkdown: string;
    relevanceScore: number;
  }>;
}

// Physician Peer-to-Peer (P2P) Defense Types
export interface PolicyCitationScriptItem {
  cpbTitle: string;
  section: string;
  criteriaMetText: string;
  rebuttalBullet: string;
  sourceUrl?: string;
}

export interface DisqualificationCounter {
  insurerTrapQuestion: string;
  physicianDirectRebuttal: string;
  clinicalRationale: string;
  regulatoryLeverage?: string;
}

export interface CondensedCheatSheet {
  rapidChecklist: string[];
  keyDiagnosisCodes: string[];
  keyProcedureCodes: string[];
  mustSayPoints: string[];
  doNotConcedePoints: string[];
  closingDemandStatement: string;
}

export interface P2PScript {
  _id: string;
  claimId: string;
  version: number;
  physicianName: string;
  physicianSpecialty?: string;
  medicalDirectorRole?: string;
  estimatedCallDuration: string;
  openingStatutoryStatement: string;
  clinicalPolicyCitations: PolicyCitationScriptItem[];
  disqualificationCounters: DisqualificationCounter[];
  statutoryDemands: string;
  condensedCheatSheet: CondensedCheatSheet;
  fullScriptMarkdown: string;
  lastEditedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface P2PDefenseSynthesisResult {
  openingStatutoryStatement: string;
  clinicalPolicyCitations: PolicyCitationScriptItem[];
  disqualificationCounters: DisqualificationCounter[];
  statutoryDemands: string;
  condensedCheatSheet: CondensedCheatSheet;
  fullScriptMarkdown: string;
}

// Real-Time P2P Live Call Copilot Types
export type CallSpeaker = "physician" | "insurer" | "system";

export interface CallTranscriptItem {
  id: string;
  speaker: CallSpeaker | string;
  text: string;
  timestamp: number;
  detectedIntent?: string;
  isFinal: boolean;
}

export interface LiveFastAnswer {
  id: string;
  trapQuestion: string;
  suggestedQuote: string;
  chartProof: string;
  cpbCitation: string;
  regulatoryLeverage?: string;
  confidenceScore: number;
  timestamp: number;
}

export interface LiveCallChecklistItem {
  id: string;
  label: string;
  category: string;
  isCompleted: boolean;
  completedAt?: number;
}

export interface P2PCallSession {
  _id: string;
  claimId: string;
  sessionStatus: "idle" | "live" | "paused" | "completed" | string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
  transcripts: CallTranscriptItem[];
  fastAnswers: LiveFastAnswer[];
  checklistProgress: LiveCallChecklistItem[];
  winScore: number;
  summaryNotes?: string;
  createdAt: number;
  updatedAt: number;
}


