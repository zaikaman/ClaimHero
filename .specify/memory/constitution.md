<!--
Sync Impact Report:
- Version change: Initial Template -> 1.0.0
- Modified principles: None (initial ratification)
- Added sections:
  - I. Production-Grade Code Quality & Strict Type Safety
  - II. Rigorous Multi-Tier Testing & Verification Standards
  - III. Impeccable User Experience & Visual Consistency
  - IV. High-Throughput & Low-Latency Performance Requirements
  - V. Security, Data Privacy & Medical Compliance Guardrails
  - VI. Development Workflow & Operational Quality Gates
  - Governance & Enforcement
- Removed sections: None (template placeholders replaced)
- Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ aligned
  - .specify/templates/spec-template.md: ✅ aligned
  - .specify/templates/tasks-template.md: ✅ aligned
  - AGENTS.md: ✅ aligned
- Follow-up TODOs: None
-->

# ClaimHero Constitution

## Core Principles

### I. Production-Grade Code Quality & Strict Type Safety
- **Strict End-to-End Type Safety**: All layers (Convex schema validators, mutation/query argument validators, Firecrawl payload schemas, AgentMail Webhook contracts, OpenAI structured JSON outputs, and React TypeScript interfaces) MUST maintain 100% type coverage without `any` escapes.
- **Zero Mock & Zero Dead Code Policy**: Every function, database table, scraper, and webhook handler MUST be real and production-ready. Hardcoded mock responses or placeholder stub implementations are strictly prohibited in core workflows.
- **Clean Architecture & Separation of Concerns**: Backend logic MUST reside within appropriate Convex constructs (`queries` for deterministic reads, `mutations` for atomic state changes, `actions` for external API orchestration like Firecrawl/OpenAI/AgentMail, `crons` for statutory deadline sweeps). UI components MUST remain purely presentational or state-reactive.
- **Resilient Error & Failure Handling**: All external integrations (LLM completions, clinical policy web scraping, email delivery) MUST include robust fallback strategies, exponential backoff, structured exception handling, and actionable error states presented to the user.

### II. Rigorous Multi-Tier Testing & Verification Standards
- **Multi-Tier Testing Hierarchy**: The codebase MUST implement three distinct verification layers:
  1. *Unit Tests*: Pure clinical rule evaluation, ICD-10 / CPT code mapping, ERISA deadline calculation, and data transform utilities.
  2. *Contract Tests*: Firecrawl schema ingestion stability, AgentMail webhook payload integrity, and OpenAI structured output validation.
  3. *End-to-End Integration & Simulation Flows*: Full pipeline verification from incoming denial PDF ingestion -> policy scraping -> vector precedent matching -> appeal brief synthesis -> mock/live dispatch.
- **Deterministic LLM Output Validation**: All AI-generated clinical arguments, policy citations, and overturn probability scores MUST be validated against structured schema guards (Zod/Convex validators) before persistence to prevent hallucinations or broken markdown structures.
- **Automated Quality Gates**: No code may be committed or merged without passing static type checking (`tsc --noEmit`), linting rules, and automated test suites.

### III. Impeccable User Experience & Visual Consistency
- **"Precision Medical Dark-Mode" Design System**: The UI MUST adhere strictly to the established aesthetic tokens: Slate-Charcoal canvas (`#0b0f17`), Cyber Cyan accents (`#00e5ff`), Medical Emerald victory highlights (`#10b981`), Statutory Crimson critical countdowns (`#f43f5e`), and Amber warning badges (`#f59e0b`).
- **Zero-Latency Reactive Feedback**: The interface MUST leverage Convex real-time subscriptions (`useQuery`) and optimistic UI mutations to guarantee immediate visual response. Long-running asynchronous tasks (scraping, AI synthesis) MUST provide real-time progress indicators, streaming text, or contextual skeleton loaders.
- **Cognitive Clarity & Information Hierarchy**: Complex healthcare reimbursement data (CPB clauses, statutory deadlines, medical necessity criteria) MUST be presented with clear visual hierarchy, scannable data badges, and interactive side-by-side comparison inspectors.
- **Interactive 1-Click Live Judge Simulation Mode**: A prominent, frictionless demo flow MUST be maintained to allow hackathon judges and stakeholders to simulate an end-to-end appeal lifecycle in seconds.

### IV. High-Throughput & Low-Latency Performance Requirements
- **Sub-50ms Reactive UI Updates**: State changes driven by Convex reactive queries MUST reflect on client interfaces within 50ms of database commitment.
- **Asynchronous Task Decoupling**: Heavy external computations (e.g. Firecrawl web crawling, OpenAI GPT-4o synthesis) MUST NEVER block the main database transaction or UI thread; they MUST execute within non-blocking Convex actions with reactive status tracking.
- **Sub-1s Vector Retrieval**: Precedent search across past overturned appeals and clinical policy embeddings MUST return top-k matches in under 1 second.
- **Bundle & Asset Optimization**: Production frontend assets MUST be code-split and optimized for rapid first-contentful paint (<1.2s) when deployed via Convex static hosting.

## Security, Data Privacy & Medical Compliance Guardrails

- **Confidentiality & Data Protection**: Patient health data, claim identifiers, and insurance policy documents MUST be protected using encrypted storage (Convex File Storage) and sanitized during external logging.
- **Zero Credential Leakage**: API credentials (OpenAI, Firecrawl, AgentMail, Convex deployment keys) MUST strictly reside in environment variables and never be exposed to the client or committed to the repository.
- **Immutable Audit Trail**: All case actions (denial ingestion, policy crawling, AI brief generation, outbound dispatch) MUST produce timestamped audit log entries in the `appealAuditLogs` table for total transparency.

## Development Workflow & Quality Gates

- **Single Branch Development**: All active development, specifications, and commits MUST occur directly on the `main` branch.
- **Evidence-Based Hackathon Logging**: `hackathon.md` MUST be continuously maintained and updated after every meaningful milestone in compliance with the `convex-hackathon-skill`.
- **Language Policy**:
  - *Agent-User Communication*: Exclusively in Vietnamese (Tiếng Việt).
  - *Technical Artifacts & Source Code*: Exclusively in English (types, schemas, comments, UI text, specs, plans, commit messages).

## Governance

- **Supremacy & Precedence**: This Constitution defines the non-negotiable engineering and product standards for ClaimHero. All feature specifications (`spec.md`), implementation plans (`plan.md`), and task breakdowns (`tasks.md`) MUST explicitly verify compliance against these principles.
- **Amendment Procedure**: Amendments to this Constitution require documenting the rationale, performing an impact analysis across existing templates and code, updating the version number according to semantic versioning rules, and recording the change in `hackathon.md`.
- **Versioning Policy**:
  - `MAJOR` version bump: Structural changes or removal of core principles.
  - `MINOR` version bump: Addition of new principles or expanded governance sections.
  - `PATCH` version bump: Non-semantic clarifications, typographical corrections, or formatting refinements.

**Version**: 1.0.0 | **Ratified**: 2026-08-26 | **Last Amended**: 2026-08-26
