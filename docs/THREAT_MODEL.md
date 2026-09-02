# AgentMail Intake & Webhook Threat Model

This document outlines the threat model, asset inventory, risk vectors, and implemented security controls for ClaimHero's AgentMail inbound communication stream and webhook ingestion gateway (`/agentmail-webhook`).

---

## 1. Scope & System Architecture

ClaimHero operates an autonomous appeal processing pipeline that receives inbound electronic mail and adjudication determinations from health plans, third-party administrators (TPAs), clinics, and patients via AgentMail.

```
[ External Senders / Payers ]
             │
             ▼ (Inbound SMTP / TLS)
   [ AgentMail Inboxes ]
             │
             ▼ (Svix Webhook Delivery: HMAC-SHA256 Signed POST)
  [ Convex HTTP Router: /agentmail-webhook ]
             │
             ├── Cryptographic Verification (Svix v1 HMAC, 300s drift window)
             ├── Payload Normalization & Strict Validation
             │
             ▼ (Internal Scheduled Actions)
  [ Inbound Intake Action / Claim Reply Processor ]
             │
             ├── Direct API Re-Fetch from AgentMail (Zero-Trust Message Verification)
             ├── 15MB MIME & Magic-Byte Filter
             ├── Optical / Clinical Reasoning Pipeline (gpt-5.4-nano)
             └── HIPAA PII Redaction & Case Persistence
```

---

## 2. Asset Inventory

| Asset ID | Asset Name | Description | Sensitivity |
| :--- | :--- | :--- | :--- |
| **AST-01** | Protected Health Information (PHI) & PII | Patient identity, medical history, CPT codes, diagnosis codes, and denial letters. | Critical / Statutory (HIPAA, ERISA) |
| **AST-02** | Appellate Briefs & Case Strategy | Synthesized legal and clinical arguments, citations, and evidence binders. | High / Confidential |
| **AST-03** | Webhook Cryptographic Secret (`AGENTMAIL_WEBHOOK_SECRET`) | Shared HMAC-SHA256 secret (`whsec_...`) used to authenticate Svix webhook transmissions. | Critical / Secret |
| **AST-04** | AgentMail API Credentials (`AGENTMAIL_API_KEY`) | REST API token granting access to read inboxes and send messages. | Critical / Secret |
| **AST-05** | Claim State & Audit Ledger | Immutable case timeline, adjudication history, and ERISA compliance logs. | High / Integrity |
| **AST-06** | Compute & LLM Quotas | Convex action compute time, OpenAI tokens, and Firecrawl crawl limits. | Medium / Availability |

---

## 3. Threat Classification & Implemented Controls

### Matrix: Assets, Threats, and Controls

| Threat ID | Category (STRIDE) | Target Asset | Threat Description | Implemented Control | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **THR-01** | **Spoofing / Tampering** | AST-01, AST-05, AST-06 | Attacker sends forged POST requests to `/agentmail-webhook` to inject fake claims or fake favorable determinations. | **Svix HMAC-SHA256 Signature Verification**: Mandatory `AGENTMAIL_WEBHOOK_SECRET` configuration in `convex.config.ts` (`v.string()`). HTTP endpoint returns `401 Unauthorized` immediately if secret is unset or if Svix signature header validation fails. | Enforced |
| **THR-02** | **Replay Attacks** | AST-05, AST-06 | Intercepted valid webhook payloads are replayed to trigger duplicate claim creations or repeated LLM invocations. | **Timestamp Tolerance Window**: Webhook timestamp header (`svix-timestamp`) is verified with strict +-300 seconds maximum drift tolerance. Expired or future-dated payloads are rejected with `401 Unauthorized`. | Enforced |
| **THR-03** | **Timing Attacks (Side-Channel)** | AST-03 | Attacker measures execution timing of signature comparisons to iteratively deduce secret key bytes. | **Constant-Time Comparison**: Webhook signatures are verified using constant-time string comparison (`timingSafeEqual`) across all payload iterations. | Enforced |
| **THR-04** | **Unconfigured Secret Bypass** | AST-01, AST-05 | Incomplete deployment configuration permits unauthenticated intake when `AGENTMAIL_WEBHOOK_SECRET` is unset. | **Fail-Closed Configuration Schema**: `convex.config.ts` enforces `AGENTMAIL_WEBHOOK_SECRET: v.string()` at build/deploy time. `convex/http.ts` rejects any request with `401 Unauthorized` if secret is missing or empty. | Enforced |
| **THR-05** | **Webhook Payload Tampering / Injection** | AST-01, AST-05 | Manipulated webhook JSON modifies message metadata (sender, inbox ID, subject) to hijack existing claims. | **Zero-Trust Message Re-Fetch**: While webhook headers trigger the event, background actions (`processInboundClaimReply`) re-fetch the authentic message directly from AgentMail's authenticated REST API using `AGENTMAIL_API_KEY`. | Enforced |
| **THR-06** | **Denial-of-Service / Resource Exhaustion** | AST-06 | Flooding the webhook endpoint with oversized payloads or invalid JSON to crash runtime or exhaust compute. | **Early Request Termination**: Payload text parsing is bounded, JSON syntax is validated before normalization, non-matching events (`message.received` only) return `204 No Content` without triggering background tasks. | Enforced |
| **THR-07** | **Malicious Binary Ingestion / File Bombs** | AST-01, AST-06 | Inbound attachments contain zip bombs, executable binaries, or oversized files targeting optical OCR. | **MIME & Magic-Byte Verification**: Inbound attachments undergo strict 15MB file size gating (`MAX_DOCUMENT_BYTES`) and MIME type validation before processing. | Enforced |
| **THR-08** | **Cross-Tenant Data Exposure** | AST-01, AST-02 | Unassigned inbound emails are viewed by unauthorized users across multi-tenant workspaces. | **Tenant Isolation & Auth Scoping**: Claims derived from general intake are held in isolated state until claimed or routed. Authenticated queries (`claims.list`, `claims.search`) enforce caller `userId` isolation via `getAuthUserId`. | Enforced |

---

## 4. Cryptographic Implementation Verification

Svix cryptographic signatures are verified using standard HMAC-SHA256:

1. **Secret Key Decoding**: The secret key (stripped of any `whsec_` prefix) is decoded from Base64 to raw bytes.
2. **Signed Content Construction**:
   ```
   content_to_sign = "${svix_id}.${svix_timestamp}.${raw_payload_string}"
   ```
3. **HMAC Calculation**: Web Crypto API computes HMAC-SHA256 over `content_to_sign`.
4. **Tolerance Validation**:
   ```
   | current_timestamp_sec - svix_timestamp | <= 300 seconds
   ```
5. **Constant-Time Verification**: `timingSafeEqual(computed_signature_base64, header_signature_v1)` is evaluated.

---

## 5. Deployment & Operational Checklist

- [x] `AGENTMAIL_WEBHOOK_SECRET` defined as mandatory `v.string()` in `convex/convex.config.ts`.
- [x] Fail-closed authentication enforced in `convex/http.ts` returning `401 Unauthorized` when secret is missing or signature check fails.
- [x] Cryptographic verification suite validated with unit tests in `tests/agentMail.test.ts`.
- [x] Zero-trust re-fetch pattern implemented across asynchronous message ingestion handlers.
