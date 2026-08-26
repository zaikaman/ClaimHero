# API Contract: Convex Backend (ClaimHero)

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Ready for Implementation  

---

## 1. Queries

### `claims.list`
Returns active claims with optional status and search filters.
- **Arguments**:
  - `status`: `v.optional(v.string())`
  - `limit`: `v.optional(v.number())`
- **Returns**: `Array<ClaimDocument>` (with joined patient metadata)

### `claims.getById`
Retrieves a complete claim record including associated patient, active appeal draft, and audit count.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `ClaimDetailsObject | null`

### `clinicalEvidences.listByClaim`
Fetches all clinical policy clauses, FDA citations, and PubMed evidence for a specific claim.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `Array<ClinicalEvidenceDocument>`

### `appeals.getByClaim`
Retrieves the latest appeal draft for a given claim.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `AppealDocument | null`

### `emails.listMessagesByClaim`
Fetches all incoming and outgoing email messages for the dedicated claim inbox.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `Array<EmailMessageDocument>`

### `auditLogs.listByClaim`
Retrieves the chronological audit log of all case events.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `Array<AuditLogDocument>`

---

## 2. Mutations

### `claims.create`
Manually or programmatically creates a new claim record.
- **Arguments**:
  - `patientId`: `v.id("patients")`
  - `claimNumber`: `v.string()`
  - `serviceDate`: `v.string()`
  - `providerName`: `v.string()`
  - `deniedAmount`: `v.number()`
  - `patientOwedAmount`: `v.number()`
  - `cptCodes`: `v.array(v.string())`
  - `icd10Codes`: `v.array(v.string())`
  - `denialReasonCode`: `v.string()`
  - `denialReasonDescription`: `v.string()`
  - `statutoryDeadline`: `v.number()`
- **Returns**: `Id<"claims">`

### `claims.updateStatus`
Updates the claim lifecycle status and records an audit log entry.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `status`: `v.string()`
  - `details`: `v.optional(v.string())`
  - `actor`: `v.string()`
- **Returns**: `null`

### `appeals.saveDraft`
Saves edits made to an appeal brief from the Live Appeal Studio.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `fullAppealMarkdown`: `v.string()`
  - `medicalNecessityArguments`: `v.optional(v.string())`
  - `legalCitations`: `v.optional(v.string())`
  - `lastEditedBy`: `v.string()`
- **Returns**: `Id<"appeals">`

---

## 3. Actions (Asynchronous & External Orchestration)

### `actions.opticalParser.parseDenialDocument`
Calls OpenAI Vision / Structured JSON to parse an uploaded denial PDF / EOB image.
- **Arguments**:
  - `storageId`: `v.id("_storage")`
  - `patientId`: `v.id("patients")`
- **Returns**: `{ claimId: Id<"claims">, extractedData: DenialExtractionResult }`

### `actions.policyCrawler.crawlInsurerPolicy`
Calls Firecrawl API to scrape relevant Clinical Policy Bulletins for the payer and procedure code.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `payer`: `v.string()`
  - `cptCodes`: `v.array(v.string())`
  - `icd10Codes`: `v.array(v.string())`
- **Returns**: `{ clausesExtracted: number, topSources: Array<string> }`

### `actions.precedentMatcher.computeOverturnScore`
Uses `gpt-5-nano` to cross-examine insurer CPB criteria against patient records and historical overturned precedents to compute win probability.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `{ score: number, riskLevel: string, matchedPrecedents: number }`

### `actions.appealSynthesizer.generateAppealBrief`
Synthesizes a 4-page cited medical and ERISA appeal brief using `gpt-5-nano`.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `appealLevel`: `v.string()`
- **Returns**: `{ appealId: Id<"appeals">, version: number }`

### `actions.mailDispatcher.dispatchAppealPacket`
Transmits the finalized appeal dossier to the insurer grievance department via AgentMail.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `recipientEmail`: `v.string()`
  - `customCoverLetter`: `v.optional(v.string())`
- **Returns**: `{ success: boolean, messageId: string, deliveryStatus: string }`

### `actions.simulationRunner.runLiveJudgeSimulation`
Orchestrates an end-to-end 15-second simulation flow of a $24,500 Knee Surgery Denial.
- **Arguments**: `{}`
- **Returns**: `{ claimId: Id<"claims">, executionDurationMs: number }`

---

## 4. Crons & Scheduled Background Tasks

### `crons.ts: dailyDeadlineSweep`
- **Schedule**: Every 24 hours (`0 0 * * *`)
- **Behavior**: Iterates over all active claims, recomputes `daysRemaining = Math.max(0, Math.ceil((statutoryDeadline - Date.now()) / 86400000))`, and triggers alert notifications for claims with `< 15` days remaining.

---

## 5. HTTP Webhook Endpoints (`http.ts`)

### `POST /http/agentmail-inbound`
Receives inbound webhook notifications from AgentMail when an email or reply is received at any assigned claim inbox address (`appeal-claim-xxx@claimhero.agentmail.com`). Automatically parses content, matches to `claims` table via assigned email, and inserts into `emailMessages`.
