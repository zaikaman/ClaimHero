import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  appealLevelValidator,
  statutoryPostureValidator,
  targetAuthorityValidator,
  legalAggressivenessValidator,
} from "./lib/statutoryTierValidators";

export default defineSchema({
  // Users table managed with Convex Auth v2
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  })
    .index("by_email", ["email"]),

  // Patients / Insured Policyholders
  patients: defineTable({
    userId: v.id("users"),
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
    userId: v.id("users"),
    patientId: v.id("patients"),
    patientName: v.optional(v.string()),
    insurancePayer: v.optional(v.string()),
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
    agentMailThreadId: v.optional(v.string()),
    autoPilotEnabled: v.optional(v.boolean()),
    lastPayerAlertAt: v.optional(v.number()),
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
        registryDate: v.optional(v.string()),
        verifiedAt: v.optional(v.number()),
        liveVerifiedAt: v.optional(v.number()),
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
    isDemo: v.optional(v.boolean()),
    dataOrigin: v.optional(v.string()),
    origin: v.optional(v.string()),
    isSyntheticPII: v.optional(v.boolean()),
    evidenceCount: v.optional(v.number()),
    workflowId: v.optional(v.string()),
    workflowStatus: v.optional(v.string()),
    searchContent: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_payer", ["userId", "insurancePayer"])
    .index("by_user_payer_status", ["userId", "insurancePayer", "status"])
    .index("by_deadline", ["statutoryDeadline"])
    .index("by_claim_number", ["claimNumber"])
    .index("by_inbox_email", ["agentMailInboxEmail"])
    .index("by_adjudicator_email", ["agentMailAdjudicatorEmail"])
    .index("by_assigned_agent_email", ["assignedAgentEmail"])
    .index("by_created", ["createdAt"])
    .index("by_threadId", ["agentMailThreadId"])
    .searchIndex("search_claims", {
      searchField: "searchContent",
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
    screenshotStorageId: v.optional(v.id("_storage")),
    screenshotUrl: v.optional(v.string()),
    capturedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_time", ["claimId", "createdAt"])
    .index("by_claim_relevance", ["claimId", "relevanceScore"])
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
    appealLevel: appealLevelValidator,
    statutoryPosture: v.optional(statutoryPostureValidator),
    targetAuthority: v.optional(targetAuthorityValidator),
    legalAggressiveness: v.optional(legalAggressivenessValidator),
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
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
        })
      )
    ),
    agentMailMessageId: v.optional(v.string()),
    outboundId: v.optional(v.string()),
    detectedDetermination: v.optional(v.string()), // OVERTURNED_APPROVED, PARTIAL_SETTLEMENT_OFFER, ADDITIONAL_RECORDS_REQUIRED, POLICY_CONFLICT_CITATION, DENIAL_UPHELD, ACKNOWLEDGMENT_ONLY, GENERAL_INQUIRY, DELIVERY_FAILURE
    clinicalRationale: v.optional(v.string()),
    missingRecordsRequested: v.optional(v.array(v.string())),
    settlementAmount: v.optional(v.number()),
    autoReplyDraft: v.optional(v.string()),
    autoReplyStatus: v.optional(v.string()), // pending, dispatched, dismissed, generating, skipped, disabled, failed
    receivedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_claim", ["claimId"])
    .index("by_claim_time", ["claimId", "receivedAt"])
    .index("by_agent_mail_message_id", ["agentMailMessageId"])
    .index("by_outbound_id", ["outboundId"])
    .index("by_auto_reply_status", ["autoReplyStatus"])
    .index("by_auto_reply_status_and_received_at", ["autoReplyStatus", "receivedAt"]),

  // Ignored / unmatched AgentMail messages that have no matching claim to prevent perpetual re-processing
  ignoredAgentMailMessages: defineTable({
    agentMailMessageId: v.string(),
    reason: v.string(),
    ignoredAt: v.number(),
  }).index("by_agent_mail_message_id", ["agentMailMessageId"]),

  // Compact index table for fast AgentMail message ID existence checks without loading heavy MIME bodies
  recordedAgentMailMessageIds: defineTable({
    agentMailMessageId: v.string(),
    claimId: v.optional(v.id("claims")),
    status: v.optional(v.string()), // processed, ignored
    recordedAt: v.number(),
  }).index("by_agent_mail_message_id", ["agentMailMessageId"]),

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
    embedding_redacted: v.optional(v.boolean()),
    retentionPolicy: v.optional(v.string()),
    retentionExpiresAt: v.optional(v.number()),
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

  // Case Audit Trail (Statutory Record Retention & Tombstoned on Case Purge)
  appealAuditLogs: defineTable({
    claimId: v.id("claims"),
    userId: v.optional(v.id("users")),
    eventType: v.string(), // denial_ingested, policy_crawled, overturn_score_computed, appeal_edited, appeal_dispatched, decision_recorded, p2p_script_generated, p2p_live_call_completed, case_tombstoned, case_deleted
    actor: v.string(),
    details: v.string(),
    timestamp: v.number(),
    isTombstoned: v.optional(v.boolean()),
    tombstonedAt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_and_timestamp", ["claimId", "timestamp"])
    .index("by_claim_event", ["claimId", "eventType", "timestamp"])
    .index("by_user_and_timestamp", ["userId", "timestamp"])
    .index("by_idempotency_key", ["idempotencyKey"])
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
  })
    .index("by_claim", ["claimId"])
    .index("by_claimId_and_version", ["claimId", "version"]),

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
        generatedBy: v.optional(v.union(v.literal("openai"), v.literal("fallback"))),
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
    userId: v.id("users"),
    title: v.string(),
    activeClaimId: v.optional(v.id("claims")),
    agentThreadId: v.optional(v.string()), // Convex AI Agent component thread ID for streaming
    summary: v.optional(v.string()), // Compressed summary of older conversation turns
    messageCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_agent_thread", ["agentThreadId"])
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

  // Global & Per-User Sentinel Operational Settings
  userSettings: defineTable({
    userId: v.id("users"),
    approvalMode: v.union(
      v.literal("manual_review"),
      v.literal("autonomous_high_confidence")
    ),
    followUpCadenceDays: v.number(),
    defaultLegalPosture: v.union(
      v.literal("administrative_reconsideration"),
      v.literal("procedural_grievance_bad_faith"),
      v.literal("external_iro_erisa_502_petition")
    ),
    autoReplyInbound: v.boolean(),
    autoRescanPolicies: v.boolean(),
    criticalDeadlineAlerts: v.boolean(),
    advocateProfile: v.object({
      name: v.string(),
      credentials: v.string(),
      organization: v.string(),
      phone: v.string(),
      state: v.string(),
    }),
    lastSyncTimestamp: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Track unattached and pending document uploads per authenticated user
  pendingUploads: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("consumed")
    ),
    claimId: v.optional(v.id("claims")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_storageId", ["storageId"])
    .index("by_userId_and_storageId", ["userId", "storageId"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // Cached Firecrawl policy snapshots by URL hash + capturedAt
  policySnapshots: defineTable({
    urlHash: v.string(),
    url: v.string(),
    title: v.optional(v.string()),
    markdown: v.string(),
    extractedJson: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
    screenshotUrl: v.optional(v.string()),
    capturedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_url_hash", ["urlHash"])
    .index("by_captured_at", ["capturedAt"]),

  // Live autonomous pipeline activity stream (human-language progress events).
  // Kept separate from the statutory audit trail so operational chatter never
  // pollutes the legal record. Entries contain no PHI: payer names, public
  // procedure codes, counts, and scores only.
  pipelineActivities: defineTable({
    claimId: v.id("claims"),
    runId: v.string(),
    stage: v.union(
      v.literal("run"),
      v.literal("crawl"),
      v.literal("score"),
      v.literal("precedents"),
      v.literal("synthesis")
    ),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("error")
    ),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_and_run", ["claimId", "runId"]),

  // Case-level collaboration grants for the Appeal Studio.
  // Owner invites by email with editor/viewer role. Invites start as pending
  // and grant nothing until the recipient accepts; userId is resolved when
  // the invited address matches an existing users record, otherwise the grant
  // stays email-keyed until the recipient signs in.
  claimCollaborators: defineTable({
    claimId: v.id("claims"),
    userId: v.optional(v.id("users")),
    email: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("declined"),
      v.literal("revoked")
    ),
    invitedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_and_email", ["claimId", "email"])
    .index("by_user", ["userId"])
    .index("by_email_and_status", ["email", "status"]),

  // Yjs CRDT operation log for true realtime co-editing of appeal briefs.
  // The Convex backend is a dumb, access-checked op log: Yjs updates are
  // idempotent and commutative, so clients merge them locally and only need
  // clocks for incremental fetching. Periodic full-state snapshots bound
  // history growth; snapshot rows also carry clocks so late joiners can start
  // from the snapshot plus newer ops.
  appealYjsUpdates: defineTable({
    appealId: v.id("appeals"),
    clock: v.number(),
    isSnapshot: v.boolean(),
    update: v.bytes(),
    authorId: v.optional(v.id("users")),
    contentHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_appeal_and_clock", ["appealId", "clock"])
    .index("by_appeal_and_snapshot", ["appealId", "isSnapshot", "clock"]),
});


