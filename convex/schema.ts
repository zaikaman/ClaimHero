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
        physicianNotes: v.optional(v.string()),
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
    redactionMetadata: v.optional(
      v.object({
        isRedacted: v.boolean(),
        mode: v.string(), // safe_harbor, balanced_appellate, public_exhibit, custom
        redactedEntityCount: v.number(),
        maskedCategories: v.array(v.string()),
        appliedAt: v.number(),
      })
    ),
    financialLiability: v.optional(
      v.object({
        billedAmount: v.number(),
        allowedAmount: v.number(),
        contractualDiscount: v.number(),
        deductibleTotal: v.number(),
        deductibleMet: v.number(),
        coinsuranceRate: v.number(),
        copayAmount: v.number(),
        outOfPocketMax: v.number(),
        outOfPocketSpent: v.number(),
        networkStatus: v.string(),
        noSurprisesActProtected: v.boolean(),
        calculatedPatientShare: v.number(),
        balanceBillingAmount: v.number(),
        totalPatientExposureDenied: v.number(),
        totalPatientLiabilityOverturned: v.number(),
        netPatientSavings: v.number(),
        payerExpectedObligation: v.number(),
        updatedAt: v.number(),
      })
    ),
    erisaPenalties: v.optional(
      v.object({
        documentRequestDate: v.string(),
        disclosureDeadlineDate: v.string(),
        calculationDate: v.string(),
        requestedDocuments: v.array(v.string()),
        complianceStatus: v.string(),
        dailyPenaltyRate: v.number(),
        daysInDefault: v.number(),
        accruedPenaltyAmount: v.number(),
        statutoryInterestRate: v.number(),
        accruedInterestAmount: v.number(),
        estimatedAttorneysFees: v.number(),
        totalStatutoryDamages: v.number(),
        totalPlanAdministratorExposure: v.number(),
        severityTier: v.string(),
        statutoryDemandLanguage: v.string(),
        updatedAt: v.number(),
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
    .index("by_claim_number", ["claimNumber"])
    .index("by_inbox_email", ["agentMailInboxEmail"])
    .index("by_adjudicator_email", ["agentMailAdjudicatorEmail"])
    .index("by_assigned_agent_email", ["assignedAgentEmail"])
    .index("by_created", ["createdAt"])
    .index("by_updated", ["updatedAt"])
    .searchIndex("search_claims", {
      searchField: "denialReasonDescription",
      filterFields: ["userId", "status", "denialReasonCode"],
    }),

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
    .index("by_source", ["sourceType"])
    .searchIndex("search_evidence", {
      searchField: "extractedEvidenceMarkdown",
      filterFields: ["claimId", "sourceType"],
    }),

  // Synthesized & Collaborative Legal/Medical Appeal Briefs
  appeals: defineTable({
    claimId: v.id("claims"),
    version: v.number(),
    appealLevel: v.string(), // level_1_internal, level_2_grievance, level_3_external_state_review
    statutoryPosture: v.optional(v.string()), // administrative_reconsideration, procedural_grievance_bad_faith, external_iro_erisa_502_petition
    targetAuthority: v.optional(v.string()), // Payer Medical Director, Multi-Disciplinary Peer Review Panel, External IRO & State Insurance Commissioner
    legalAggressiveness: v.optional(v.string()), // standard, elevated_grievance, maximum_statutory_enforcement
    statutoryAuthorities: v.optional(v.array(v.string())),
    escalationNotes: v.optional(v.string()),
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    pdfExportStorageId: v.optional(v.id("_storage")),
    lastEditedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claimId_and_appealLevel", ["claimId", "appealLevel"])
    .index("by_claimId_and_version", ["claimId", "version"]),

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
    .index("by_claim_agent", ["claimId", "agentEmail"])
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

  // Idempotency and operational state for the shared electronic intake inbox.
  agentMailIntakeEvents: defineTable({
    eventId: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
    status: v.string(), // processing, completed, failed
    claimId: v.optional(v.id("claims")),
    error: v.optional(v.string()),
    receivedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_message_id", ["messageId"]),

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
    })
    .searchIndex("search_precedents", {
      searchField: "winningArgument",
      filterFields: ["sourceKind", "primaryCpt", "carcCode"],
    }),

  // Immutable Event Audit Trail
  appealAuditLogs: defineTable({
    claimId: v.id("claims"),
    eventType: v.string(), // denial_ingested, policy_crawled, overturn_score_computed, appeal_edited, appeal_dispatched, decision_recorded, p2p_script_generated, p2p_live_call_completed
    actor: v.string(),
    details: v.string(),
    timestamp: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_and_timestamp", ["claimId", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  // Physician Peer-to-Peer (P2P) Defense Tele-Scripts
  p2pScripts: defineTable({
    claimId: v.id("claims"),
    version: v.number(),
    physicianName: v.string(),
    physicianSpecialty: v.optional(v.string()),
    medicalDirectorRole: v.optional(v.string()),
    estimatedCallDuration: v.string(),
    openingStatutoryStatement: v.string(),
    clinicalPolicyCitations: v.array(
      v.object({
        cpbTitle: v.string(),
        section: v.string(),
        criteriaMetText: v.string(),
        rebuttalBullet: v.string(),
        sourceUrl: v.optional(v.string()),
      })
    ),
    disqualificationCounters: v.array(
      v.object({
        insurerTrapQuestion: v.string(),
        physicianDirectRebuttal: v.string(),
        clinicalRationale: v.string(),
        regulatoryLeverage: v.optional(v.string()),
      })
    ),
    statutoryDemands: v.string(),
    condensedCheatSheet: v.object({
      rapidChecklist: v.array(v.string()),
      keyDiagnosisCodes: v.array(v.string()),
      keyProcedureCodes: v.array(v.string()),
      mustSayPoints: v.array(v.string()),
      doNotConcedePoints: v.array(v.string()),
      closingDemandStatement: v.string(),
    }),
    fullScriptMarkdown: v.string(),
    lastEditedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_claim", ["claimId"]),

  // Real-Time P2P Live Call Copilot Sessions
  p2pCallSessions: defineTable({
    claimId: v.id("claims"),
    sessionStatus: v.string(), // idle, live, paused, completed
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationSeconds: v.number(),
    transcripts: v.array(
      v.object({
        id: v.string(),
        speaker: v.string(), // physician, insurer, system
        text: v.string(),
        timestamp: v.number(),
        detectedIntent: v.optional(v.string()),
        isFinal: v.boolean(),
      })
    ),
    fastAnswers: v.array(
      v.object({
        id: v.string(),
        trapQuestion: v.string(),
        suggestedQuote: v.string(),
        chartProof: v.string(),
        cpbCitation: v.string(),
        regulatoryLeverage: v.optional(v.string()),
        confidenceScore: v.number(),
        timestamp: v.number(),
      })
    ),
    checklistProgress: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        category: v.string(),
        isCompleted: v.boolean(),
        completedAt: v.optional(v.number()),
      })
    ),
    winScore: v.number(),
    summaryNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_claim", ["claimId"]),

  // Sentinel Chatbot Persistent Conversation Sessions
  chatbotSessions: defineTable({
    userId: v.optional(v.id("users")),
    title: v.string(),
    activeClaimId: v.optional(v.id("claims")),
    summary: v.optional(v.string()), // Compressed summary of older conversation turns
    messageCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_updated", ["updatedAt"]),

  // Sentinel Chatbot Messages
  chatbotMessages: defineTable({
    sessionId: v.id("chatbotSessions"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system"), v.literal("tool")),
    content: v.string(),
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          arguments: v.string(),
          output: v.optional(v.string()),
        })
      )
    ),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_time", ["sessionId", "createdAt"]),
});


