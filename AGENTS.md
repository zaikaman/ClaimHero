<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
constitution principles, and architectural requirements, read the current plan:
specs/001-appeal-sentinel/plan.md
<!-- SPECKIT END -->

# Agent Behavior & Project Guidelines

## 1. Language Policy (Quy Định Ngôn Ngữ)
- **Communication (Giao tiếp)**: Luôn trao đổi, giải thích, báo cáo và trả lời người dùng bằng **Tiếng Việt**.
- **Code & Technical Assets**: Write all source code, identifiers, types, schemas, comments, commit messages, PR descriptions, test cases, and technical specifications exclusively in **English**.
- **UI Content**: Default application UI copy, labels, and data must be in **English** (tailored for the international hackathon judges).

## 2. Project Architecture & Standards
- **Project**: ClaimHero (Autonomous Medical & Health Insurance Appeal Sentinel)
- **Core Stack**:
  - Backend: Convex (Real-time DB, Queries, Mutations, Actions, Crons, Vector Search)
  - Data Ingestion: Firecrawl (Insurer Clinical Policy Bulletins & Medical Guidelines Crawling)
  - Communications: AgentMail (Autonomous Dedicated Appeal Inboxes & Payer Transmissions)
  - Intelligence: OpenAI (Clinical Reason Extraction & Cited Appeal Brief Generation)
  - Frontend: React / TypeScript / Vite / TailwindCSS with Precision Medical Dark-Mode Theme
- **Build Log**: Keep `hackathon.md` updated after meaningful build sessions using the `/hackathon` skill.
- **Frontend Host**: Convex static hosting (`convex.site`).

## 3. Git & Branching Strategy
- **Single Branch Workflow**: All development, specifications, plans, and commits MUST be done directly on the `main` branch. Never create or switch to feature branches.

## 4. Coding Rules
- Use the find-docs skill when you need up-to-date documentation.
- When coding, always use the convex-hackathon-skill.
- Do not write mock or fake code, or hardcode anything, everything must be production-ready and real.
- Use the impeccable skill when you're working with UI tasks, and make sure your UI work stays consistent with the rest of the app's design.
- All relevant docs should be available in the docs folder, use the find-docs skill if you need anything else.
- When you're done with your tasks, remember to run npm run verify to make sure everything is clean, and only run this when it's actually necessary, like large refactors, big code work, don't run it when you only updated docs for example.
- Do not use the browser agent to verify the UI, the user will do that himself.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
