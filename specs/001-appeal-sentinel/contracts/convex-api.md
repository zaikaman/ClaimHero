# API Contracts: Convex Reactive Backend

## 1. Claims API (`convex/claims.ts`)

### `queries.claims.list`
Lists all claims with optional status and payer filters, joined with patient data.
- **Arguments**:
  - `status`: `v.optional(v.string())`
  - `payer`: `v.optional(v.string())`
- **Returns**: `Array<Claim>`

### `queries.claims.getById`
Fetches a single claim by its ID with full joined patient, clinical evidences, and appeal drafts.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `ClaimDetails | null`

### `mutations.claims.createWithPatient`
Atomically creates a new patient record and associated claim case with statutory ERISA deadline.
- **Arguments**:
  - `patientName`: `v.string()`
  - `patientEmail`: `v.string()`
  - `memberId`: `v.string()`
  - `insurancePayer`: `v.string()`
  - `state`: `v.string()`
  - `claimNumber`: `v.string()`
  - `serviceDate`: `v.string()`
  - `providerName`: `v.string()`
  - `deniedAmount`: `v.number()`
  - `patientOwedAmount`: `v.number()`
  - `cptCodes`: `v.array(v.string())`
  - `icd10Codes`: `v.array(v.string())`
  - `denialReasonCode`: `v.string()`
  - `denialReasonDescription`: `v.string()`
  - `appealFilingDeadlineDays`: `v.optional(v.number())`
  - `denialLetterStorageId`: `v.optional(v.id("_storage"))`
- **Returns**: `Id<"claims">`

### `mutations.claims.updateStatus`
Updates the state machine status of a claim and creates an audit log entry.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `status`: `v.string()`
  - `details`: `v.optional(v.string())`
- **Returns**: `void`

### `mutations.claims.generateUploadUrl`
Generates a one-time secure upload URL for Convex File Storage.
- **Arguments**: `{}`
- **Returns**: `string`

---

## 2. Clinical Evidence API (`convex/clinicalEvidences.ts`)

### `queries.clinicalEvidences.listByClaim`
Fetches all indexed Clinical Policy Bulletins, guideline excerpts, and precedent citations for a claim.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `Array<ClinicalEvidence>`

### `mutations.clinicalEvidences.insertBatch`
Stores multiple extracted clinical evidence citations for a claim.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `evidences`: `v.array(...)`
- **Returns**: `Array<Id<"clinicalEvidences">>`

---

## 3. Appeals API (`convex/appeals.ts`)

### `queries.appeals.getLatestByClaim`
Fetches the most recent appeal brief draft for a given claim.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `Appeal | null`

### `mutations.appeals.saveDraft`
Saves edits and updates to an appeal brief draft with version increment.
- **Arguments**:
  - `appealId`: `v.id("appeals")`
  - `fullAppealMarkdown`: `v.string()`
  - `medicalNecessityArguments`: `v.string()`
  - `legalCitations`: `v.string()`
  - `executiveSummary`: `v.string()`
- **Returns**: `void`

---

## 4. Asynchronous Actions (`convex/actions/`)

### `actions.opticalParser.parseDenialDocument`
Calls OpenAI Vision & Structured JSON (`gpt-5.4-nano`) to parse an uploaded denial PDF / image or raw text, and persists the patient and claim to Convex DB.
- **Arguments**:
  - `storageId`: `v.optional(v.id("_storage"))`
  - `rawDocumentText`: `v.optional(v.string())`
  - `patientState`: `v.optional(v.string())`
- **Returns**: `DenialExtractionResult & { claimId: string }`

### `actions.policyCrawler.crawlInsurerPolicy`
Calls Firecrawl API to scrape relevant Clinical Policy Bulletins for the payer and procedure code.
- **Arguments**:
  - `claimId`: `v.id("claims")`
  - `payer`: `v.string()`
  - `cptCodes`: `v.array(v.string())`
  - `icd10Codes`: `v.array(v.string())`
- **Returns**: `{ clausesExtracted: number, topSources: Array<string> }`

### `actions.precedentMatcher.computeOverturnScore`
Uses `gpt-5.4-nano` to cross-examine insurer CPB criteria against patient clinical records to compute win probability.
- **Arguments**:
  - `claimId`: `v.id("claims")`
- **Returns**: `{ score: number, riskLevel: string, matchedPrecedents: number }`

### `actions.appealSynthesizer.generateAppealBrief`
Synthesizes a cited medical and ERISA appeal brief using `gpt-5.4-nano`.
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

---

## 5. Crons & Scheduled Background Tasks

### `crons.ts: dailyDeadlineSweep`
- **Schedule**: Every 24 hours (`0 0 * * *`)
- **Behavior**: Iterates over all active claims, recomputes `daysRemaining = Math.max(0, Math.ceil((statutoryDeadline - Date.now()) / 86400000))`, and triggers alert notifications for claims with `< 15` days remaining.
