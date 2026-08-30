import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // Patients / Insured Policyholders
  patients: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.string(),
    memberId: v.string(),
    groupNumber: v.optional(v.string()),
    insurancePayer: v.string(),
    state: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_payer", ["insurancePayer"]),

  // Core Medical Appeal Claims
  claims: defineTable({
    userId: v.optional(v.id("users")),
    patientId: v.id("patients"),
    claimNumber: v.string(),
    serviceDate: v.string(),
    providerName: v.string(),
    deniedAmount: v.number(),
    patientOwedAmount: v.number(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.string(),
    status: v.string(), // ingested, parsing, analyzing, precedent_matched, drafting, ready_for_review, dispatched, won, lost, escalated
    statutoryDeadline: v.number(),
    daysRemaining: v.number(),
    overturnProbabilityScore: v.optional(v.number()),
    riskLevel: v.optional(v.string()), // high_confidence, moderate, complex_litigation
    scoringBreakdown: v.optional(
      v.array(
        v.object({
          category: v.string(),
          criterion: v.string(),
          score: v.number(),
          maxScore: v.number(),
          status: v.string(), // strong, moderate, weak
          rationale: v.string(),
        })
      )
    ),
    assignedAgentEmail: v.string(),
    agentMailInboxId: v.optional(v.string()),
    agentMailInboxEmail: v.optional(v.string()),
    agentMailAdjudicatorInboxId: v.optional(v.string()),
    agentMailAdjudicatorEmail: v.optional(v.string()),
      agentMailProvisioningStatus: v.optional(v.string()), // pending, shared, provisioned, not_configured, failed
    agentMailProvisioningError: v.optional(v.string()),
    denialLetterStorageId: v.optional(v.id("_storage")),
    appealContext: v.optional(
      v.object({
        sender: v.object({
          name: v.string(),
          credentials: v.optional(v.string()),
          email: v.optional(v.string()),
          phone: v.optional(v.string()),
        }),
        clinicalFacts: v.object({
          symptomsAndFunctionalImpact: v.optional(v.string()),
          examinationFindings: v.optional(v.string()),
          imagingAndDiagnostics: v.optional(v.string()),
          treatmentHistoryAndResponse: v.optional(v.string()),
          otherDocumentedFacts: v.optional(v.string()),
          recordsAreIncomplete: v.boolean(),
        }),
        confirmedAt: v.number(),
      })
    ),
    payerContact: v.optional(
      v.object({
        officialAppealsEmail: v.optional(v.string()),
        intakePortalUrl: v.optional(v.string()),
        portalName: v.optional(v.string()),
        appealsFax: v.optional(v.string()),
        statutoryPoBox: v.optional(v.string()),
        ediPayerId: v.optional(v.string()),
        tollFreeHelpline: v.optional(v.string()),
        isVerified: v.boolean(),
        submissionPolicyNote: v.optional(v.string()),
        source: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_patient", ["patientId"])
    .index("by_deadline", ["statutoryDeadline"])
    .index("by_claim_number", ["claimNumber"]),

  // Clinical Policy Bulletins, Studies & Evidence
  clinicalEvidences: defineTable({
    claimId: v.id("claims"),
    sourceType: v.string(), // payer_cpb, fda_package_insert, pubmed_study, nccn_guideline, legal_precedent
    title: v.string(),
    sourceUrl: v.optional(v.string()),
    citationClause: v.string(),
    extractedEvidenceMarkdown: v.string(),
    relevanceScore: v.number(),
    createdAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_source", ["claimId", "sourceType"])
    .index("by_source", ["sourceType"]),

  // Synthesized & Collaborative Legal/Medical Appeal Briefs
  appeals: defineTable({
    claimId: v.id("claims"),
    version: v.number(),
    appealLevel: v.string(), // level_1_internal, level_2_grievance, level_3_external_state_review
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    pdfExportStorageId: v.optional(v.id("_storage")),
    lastEditedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_claim", ["claimId"]),

  // Autonomous AgentMail Communication Threads
  emailThreads: defineTable({
    claimId: v.id("claims"),
    agentEmail: v.string(),
    payerEmail: v.string(),
    subject: v.string(),
    status: v.string(), // active, dispatched, response_received, resolved
    lastMessageAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_agent_email", ["agentEmail"]),

  // Inbound & Outbound Email Messages
  emailMessages: defineTable({
    threadId: v.id("emailThreads"),
    claimId: v.id("claims"),
    direction: v.string(), // inbound, outbound
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    hasAttachments: v.boolean(),
    agentMailMessageId: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_claim", ["claimId"])
    .index("by_agentmail_message", ["agentMailMessageId"]),

  // Precedent Vector Archive — winning briefs, commissioner rulings, court overturns
  precedents: defineTable({
    sourceKind: v.union(
      v.literal("winning_brief"),
      v.literal("commissioner_ruling"),
      v.literal("court_overturn"),
      v.literal("statutory_authority")
    ),
    title: v.string(),
    citation: v.string(),
    jurisdiction: v.string(),
    sourceUrl: v.optional(v.string()),
    icd10Codes: v.array(v.string()),
    cptCodes: v.array(v.string()),
    carcCodes: v.array(v.string()),
    primaryIcd10: v.string(),
    primaryCpt: v.string(),
    carcCode: v.string(),
    winningArgument: v.string(),
    statutoryLanguage: v.string(),
    outcome: v.string(),
    embedding: v.array(v.float64()),
    sourceClaimId: v.optional(v.id("claims")),
    corpusKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_corpus_key", ["corpusKey"])
    .index("by_carc", ["carcCode"])
    .index("by_primary_cpt", ["primaryCpt"])
    .index("by_source_kind", ["sourceKind"])
    .index("by_source_claim", ["sourceClaimId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["sourceKind", "primaryCpt", "carcCode", "primaryIcd10"],
    }),

  // Immutable Event Audit Trail
  appealAuditLogs: defineTable({
    claimId: v.id("claims"),
    eventType: v.string(), // denial_ingested, policy_crawled, overturn_score_computed, appeal_edited, appeal_dispatched, decision_recorded
    actor: v.string(),
    details: v.string(),
    timestamp: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_timestamp", ["timestamp"]),
});
