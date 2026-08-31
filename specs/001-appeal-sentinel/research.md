# Implementation Research: ClaimHero (Autonomous Medical Appeal Sentinel)

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Completed  

---

## 1. Executive Technology Decisions

### Decision 1: Single-Model AI / LLM Reasoning Architecture (OpenAI SDK with `gpt-5.4-nano`)
- **Decision**: Configure a unified OpenAI SDK (`openai`) client within Convex Node.js actions powered by 3 explicit environment variables:
  - `OPENAI_API_KEY`: API authentication key.
  - `OPENAI_MODEL`: Active reasoning model (default: `gpt-5.4-nano`, fully configurable to any OpenAI-compatible model).
  - `OPENAI_BASE_URL`: Custom base endpoint (e.g. `https://api.openai.com/v1` or custom proxy).
- **Rationale**: 
  - **Single-Model Simplicity & 100% Proxy Compatibility**: Eliminates the need for a secondary `text-embedding-3-small` model. Custom proxies or local endpoints (vLLM, Ollama, OpenRouter, LiteLLM) often only support `/v1/chat/completions` and fail on `/v1/embeddings`.
  - **Clinical Reasoning Over Naive Vector Search**: `gpt-5.4-nano` directly performs semantic matching, medical necessity evaluation, CPT/ICD-10 code cross-referencing against insurer Clinical Policy Bulletins (CPBs), and calculates the Overturn Probability Score with clinical context rather than simple cosine word similarity.
  - **Structured Outputs**: OpenAI's JSON Schema enforcement (`response_format: { type: "json_schema", ... }`) guarantees 100% deterministic parsing of medical Explanation of Benefits (EOBs), code mappings, and multi-page appeal briefs.
- **Alternatives Considered**:
  - *LangChain / LlamaIndex*: Rejected due to unnecessary abstraction overhead, heavy bundle size, and lower determinism compared to direct Convex actions calling OpenAI SDK.
  - *Client-side AI calls*: Rejected due to API key exposure security risks and HIPAA privacy constraints.

---

### Decision 2: Insurer Clinical Policy Ingestion (Firecrawl)
- **Decision**: Orchestrate Clinical Policy Bulletin (CPB) and medical guideline crawling via Firecrawl API (`https://api.firecrawl.dev/v1/scrape` and `@mendable/firecrawl-js`), supplemented with a pre-indexed curated library of major insurer policies (Aetna, UnitedHealthcare, Cigna, BCBS) and standard-of-care precedents (NCCN, FDA package inserts).
- **Rationale**:
  - Insurer CPBs are frequently updated, JavaScript-heavy, or published as complex multi-page PDFs. Firecrawl's markdown conversion with `mode: "auto"` / `mode: "ocr"` cleanly extracts relevant criteria sections while stripping navigational web boilerplate.
  - Having a resilient fallback mechanism with pre-indexed clinical guidelines guarantees zero downtime during live judge evaluations even if an external insurer website is temporarily unreachable or rate-limited.
- **Alternatives Considered**:
  - *Standard `fetch()` + Cheerio*: Fails on JavaScript-rendered single-page insurer portals and PDF policy documents.
  - *Puppeteer/Playwright in Lambda*: High infrastructure latency and maintenance complexity compared to Firecrawl's unified scrape API.

---

### Decision 3: Autonomous Inboxes & Payer Communications (AgentMail)
- **Decision**: Integrate AgentMail REST API (`https://api.agentmail.to/v0`) to provision dedicated, HIPAA-isolated claim email inboxes (e.g. `appeal-claim-9402@claimhero.agentmail.com`) and process inbound patient forwards and outbound payer dispatches via Convex HTTP webhooks (`/http/agentmail-webhook`).
- **Rationale**:
  - Insurers demand verifiable written submission channels (fax/email to grievances). AgentMail provides dedicated, persistent email threads with full attachment support, webhook delivery notifications, and automatic spam/virus filtering.
  - Decoupling inbox management from consumer email accounts preserves patient privacy and creates a verifiable audit trail.
- **Alternatives Considered**:
  - *SendGrid / Resend Inbound Parse*: Requires complex DNS configuration per user and lacks autonomous thread/inbox isolation concepts native to AI agents.
  - *IMAP/SMTP polling*: Inefficient, high-latency polling loops that violate Convex reactive event-driven architecture.

---

### Decision 4: Reactive Database, Cron Alarms & Document Storage (Convex)
- **Decision**: Utilize Convex as the single, real-time backend source of truth:
  - **Reactivity (`useQuery`)**: Instant, zero-latency UI synchronizations as claims transition across analysis, evidence assembly, and dispatch states.
  - **Relational Matching & Indexing**: High-performance indexes on `cptCodes`, `denialReasonCode`, `status`, and `patientId` enabling instant filtering and retrieval of relevant clinical policies and overturned precedents.
  - **Scheduled Actions & Crons (`crons.ts`)**: Automated daily/hourly statutory deadline sweeps calculating exact days remaining until the ERISA 180-day or state external review clocks expire.
  - **Convex File Storage**: Secure, encrypted cloud storage for incoming denial PDFs, insurer EOBs, and generated legal appeal packets.
- **Rationale**: 
  - Convex eliminates backend API glue code, provides atomic transaction consistency, and integrates seamlessly with Node.js actions for AI and scraping orchestration without managing complex server infrastructure.
- **Alternatives Considered**:
  - *PostgreSQL + Redis*: High DevOps maintenance, manual WebSocket wiring, and non-reactive client polling.

---

### Decision 5: Frontend Experience & Precision Medical Dark-Mode (React + Tailwind CSS)
- **Decision**: Build a high-performance single-page web application using Vite, React 18+, TypeScript, Tailwind CSS, Lucide React icons, and Radix UI primitives, styled with the "Precision Medical Dark-Mode" design system.
- **Palette**: Deep slate-charcoal canvas (`#0b0f17`), Cyber Cyan accents (`#00e5ff`), Medical Emerald victory highlights (`#10b981`), Statutory Crimson countdowns (`#f43f5e`), and Amber badges (`#f59e0b`).
- **Interactive UI**: Real-time **Case Ingestion Radar**, drag-and-drop PDF/image optical parser with OpenAI `gpt-5.4-nano`, and live ERISA deadline countdown dials.
- **Rationale**:
  - Meets hackathon judging criteria for visual excellence, cognitive clarity, and immediate responsiveness.
