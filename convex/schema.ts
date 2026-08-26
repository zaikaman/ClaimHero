import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // Patients / Insured Policyholders
  patients: defineTable({
    name: v.string(),
    email: v.string(),
    memberId: v.string(),
    groupNumber: v.optional(v.string()),
    insurancePayer: v.string(),
    state: v.string(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_payer", ["insurancePayer"]),

  // Core Medical Appeal Claims
  claims: defineTable({
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
    assignedAgentEmail: v.string(),
    denialLetterStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
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
    receivedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_claim", ["claimId"]),

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
