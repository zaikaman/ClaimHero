# Tasks: Autonomous Medical Appeal Sentinel

**Input**: Design documents from `/specs/001-appeal-sentinel/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`  

---

## Phase 1: Setup & Environment Initialization

**Purpose**: Initialize project repositories, build configurations, and styling design tokens.

- [X] T001 Initialize Vite React TypeScript project and configure dependencies (`convex`, `openai`, `@mendable/firecrawl-js`, `lucide-react`, `clsx`, `tailwind-merge`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `canvas-confetti`) in `package.json`
- [X] T002 Configure Tailwind CSS with Precision Medical Dark-Mode theme tokens (`#0b0f17` canvas, `#00e5ff` cyan, `#10b981` emerald, `#f43f5e` crimson, `#f59e0b` amber) in `tailwind.config.js` and `src/index.css`
- [X] T003 [P] Configure TypeScript compiler options for strict end-to-end type safety in `tsconfig.json` and `tsconfig.node.json`
- [X] T004 [P] Configure Vite build settings, server proxy, and path aliases in `vite.config.ts`
- [X] T005 [P] Create environment variable configuration template and constants in `.env.example` and `src/lib/constants.ts`

---

## Phase 2: Foundational Infrastructure (Blocking Prerequisites)

**Purpose**: Core Convex database schema, unified OpenAI client, type definitions, and application layout shell.

- [X] T006 Define complete Convex database schema with tables (`patients`, `claims`, `clinicalEvidences`, `appeals`, `emailThreads`, `emailMessages`, `appealAuditLogs`) and relational indexes in `convex/schema.ts`
- [X] T007 Implement OpenAI client wrapper supporting `OPENAI_API_KEY`, `OPENAI_MODEL` (`gpt-5-nano`), and `OPENAI_BASE_URL` with structured output helpers in `convex/lib/openai.ts`
- [X] T008 [P] Implement core domain TypeScript interfaces and type definitions in `src/types/index.ts`
- [X] T009 [P] Implement UI styling utilities, badge helpers, and currency/date formatters in `src/lib/utils.ts`
- [X] T010 [P] Implement audit logging mutations and query helpers in `convex/auditLogs.ts`
- [X] T011 Setup React application root with `ConvexProvider` and base shell layout in `src/main.tsx` and `src/components/layout/Shell.tsx`
- [X] T012 [P] Implement Top Navigation Header with live statistics and simulation trigger button in `src/components/layout/Header.tsx`
- [X] T013 [P] Implement Sidebar Navigation with status filtering in `src/components/layout/Sidebar.tsx`

**Checkpoint**: Foundational database schema and UI shell ready. User story implementation can proceed.

---

## Phase 3: User Story 1 - Denial Document Ingestion & Optical Extraction (Priority: P1) 🎯 MVP

**Goal**: Ingest denial letters/EOBs via direct upload or email, extract metadata using `gpt-5-nano` Vision/Structured Outputs, and create reactive claim cases.

**Independent Test**: Upload a sample denial letter PDF and verify that a new claim is created in the dashboard with extracted CPT code (27447), denial reason code (CO-50), denied amount ($24,500), and patient liability ($24,500).

- [ ] T014 [P] [US1] Implement patient & claim creation and query mutations in `convex/claims.ts`
- [ ] T015 [US1] Implement optical extraction action using `gpt-5-nano` with `DenialExtractionResult` schema in `convex/actions/opticalParser.ts`
- [ ] T016 [P] [US1] Implement real-time claim subscription hook in `src/hooks/useClaims.ts`
- [ ] T017 [P] [US1] Implement Live Case Ingestion Radar feed showing incoming claim status in `src/components/radar/CaseRadar.tsx`
- [ ] T018 [US1] Implement Drag-and-Drop Denial Upload & Email Forwarding modal in `src/components/radar/IngestionModal.tsx`
- [ ] T019 [US1] Integrate IngestionModal with Convex File Storage and `opticalParser` action in `src/App.tsx`

**Checkpoint**: User Story 1 functional — users can upload denial documents and see parsed claims appear in real time.

---

## Phase 4: User Story 2 - Clinical Policy Bulletin (CPB) Evidence Crawling & Precedent Matching (Priority: P2)

**Goal**: Crawl insurer CPBs via Firecrawl (with fallback guideline database) and use `gpt-5-nano` to cross-examine criteria and compute Overturn Probability Score.

**Independent Test**: Trigger policy analysis on an ingested claim; verify that matching insurer policy clauses and clinical citations are displayed in a side-by-side policy matrix alongside an Overturn Probability Score.

- [ ] T020 [P] [US2] Implement evidence persistence queries and mutations in `convex/clinicalEvidences.ts`
- [ ] T021 [US2] Implement Firecrawl scraper action with resilient clinical guideline fallback in `convex/actions/policyCrawler.ts`
- [ ] T022 [US2] Implement clinical precedent evaluation and Overturn Probability scoring action using `gpt-5-nano` in `convex/actions/precedentMatcher.ts`
- [ ] T023 [P] [US2] Implement side-by-side Denial vs Insurer CPB inspector in `src/components/evidence/EvidenceMatrix.tsx`
- [ ] T024 [P] [US2] Implement CPB Clause & Medical Criteria Viewer with highlighted contradictions in `src/components/evidence/PolicyViewer.tsx`
- [ ] T025 [US2] Implement Precedent Feed displaying historical winning cases in `src/components/evidence/PrecedentFeed.tsx`

**Checkpoint**: User Stories 1 and 2 functional — claims now have automated clinical policy evidence and win scoring.

---

## Phase 5: User Story 3 - Cited Appeal Brief Synthesis & Collaborative Appeal Studio (Priority: P3)

**Goal**: Synthesize multi-page medical appeal briefs citing ERISA 29 CFR § 2560.503-1 and CPB clauses using `gpt-5-nano`, and provide a real-time collaborative Appeal Studio.

**Independent Test**: Open an assembled appeal brief in the studio, insert an additional clinical study reference or physician note, and verify that the formatted document updates in real time with intact legal citations.

- [ ] T026 [P] [US3] Implement appeal brief queries and draft auto-save mutations in `convex/appeals.ts`
- [ ] T027 [US3] Implement cited appeal brief generation action using `gpt-5-nano` in `convex/actions/appealSynthesizer.ts`
- [ ] T028 [P] [US3] Implement live studio state management hook in `src/hooks/useAppealStudio.ts`
- [ ] T029 [US3] Implement Collaborative Live Appeal Studio document editor in `src/components/studio/AppealStudio.tsx`
- [ ] T030 [P] [US3] Implement Citation & Evidence Footnote Sidebar in `src/components/studio/CitationSidebar.tsx`
- [ ] T031 [US3] Implement PDF Dossier Preview & Export Drawer in `src/components/studio/ExportDrawer.tsx`

**Checkpoint**: User Stories 1, 2, and 3 functional — complete appeal dossier generation and live editing enabled.

---

## Phase 6: User Story 4 - Statutory Deadline Countdown & Autonomous Dispatch Engine (Priority: P4)

**Goal**: Track ERISA/state statutory appeal deadlines with countdown alarms and autonomously transmit appeal dossiers via AgentMail with complete audit logs.

**Independent Test**: Finalize an appeal brief, confirm dispatch, verify transmission to payer grievance address, check active countdown dial, and inspect the audit trail.

- [ ] T032 [P] [US4] Implement scheduled statutory deadline daily sweep cron in `convex/crons.ts`
- [ ] T033 [US4] Implement AgentMail outbound dispatch action with attachment bundling in `convex/actions/mailDispatcher.ts`
- [ ] T034 [P] [US4] Implement email thread and message query/mutation handlers in `convex/emails.ts`
- [ ] T035 [US4] Implement Convex HTTP webhook endpoint for inbound AgentMail events in `convex/http.ts`
- [ ] T036 [P] [US4] Implement Dynamic Statutory Deadline Countdown dial in `src/components/radar/DeadlineCountdown.tsx`
- [ ] T037 [P] [US4] Implement Dedicated Claim Inbox & Message Drawer in `src/components/communications/AgentMailDrawer.tsx`
- [ ] T038 [US4] Implement Chronological Case Audit Timeline in `src/components/communications/AuditTimeline.tsx`

**Checkpoint**: User Stories 1-4 functional — automated statutory countdowns, two-way email communications, and dispatch active.

---

## Phase 7: User Story 5 - 1-Click Interactive Live Judge Simulation Mode (Priority: P5)

**Goal**: Enable hackathon judges to trigger an end-to-end simulated appeal journey ($24,500 Knee Replacement denial -> policy crawl -> score calculation -> appeal brief synthesis -> test dispatch) in under 15 seconds with animated stage transitions.

**Independent Test**: Click "Run Live Simulation" and verify all 5 stages execute with real-time visual progress and load the finalized case dossier.

- [ ] T039 [US5] Implement seed simulation scenario data and 15-second orchestrator action in `convex/actions/simulationRunner.ts`
- [ ] T040 [US5] Implement animated multi-stage simulation overlay with stage progression in `src/components/simulation/SimulationOverlay.tsx`
- [ ] T041 [US5] Connect 1-Click Simulation CTA in Header to SimulationOverlay and workspace in `src/App.tsx`

**Checkpoint**: All 5 user stories complete — application features a frictionless 1-Click demonstration flow.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, initial seeding, and final aesthetic refinement.

- [ ] T042 [P] Implement end-to-end integration and simulation test suite in `tests/simulation.test.ts`
- [ ] T043 [P] Perform static typechecking validation across full codebase (`tsc --noEmit`)
- [ ] T044 Optimize responsive UI layout, keyboard navigation, and transitions in `src/index.css` and `src/App.tsx`
- [ ] T045 Seed initial curated clinical policy bulletins and overturned precedents for immediate out-of-the-box evaluation in `convex/seed.ts`
- [ ] T046 Validate complete setup and execution against `specs/001-appeal-sentinel/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — executes immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Phase 2 completion.
- **User Story 2 (Phase 4 - P2)**: Depends on Phase 3 completion (requires claim data from US1).
- **User Story 3 (Phase 5 - P3)**: Depends on Phase 4 completion (requires clinical evidence from US2).
- **User Story 4 (Phase 6 - P4)**: Depends on Phase 5 completion (requires appeal draft from US3).
- **User Story 5 (Phase 7 - P5)**: Integrates all preceding pipeline actions into an orchestrated simulation flow.
- **Polish (Phase 8)**: Depends on all user stories being complete.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational Schema & Shell
3. Complete Phase 3: User Story 1 (Denial Ingestion & Extraction)
4. Validate User Story 1 independently with sample PDF upload

### Incremental Feature Delivery
1. Add User Story 2 &rarr; CPB policy crawler & Overturn Probability score calculation
2. Add User Story 3 &rarr; Cited appeal brief synthesis & live collaborative studio
3. Add User Story 4 &rarr; Statutory deadline alarm cron & AgentMail dispatch
4. Add User Story 5 &rarr; 1-Click Live Judge Simulation mode
5. Execute Polish & Testing &rarr; Submission-ready demo
