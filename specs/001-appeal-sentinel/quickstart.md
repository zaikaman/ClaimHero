# Quickstart: ClaimHero (Autonomous Medical Appeal Sentinel)

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Ready for Implementation  

---

## 1. Prerequisites & Environment Setup

### Required Tools
- Node.js 20+ / npm 10+
- Git

### Environment Variables
Configure the following in `.env.local` for the Vite frontend and Convex backend:

```env
# 1. Convex Backend Deployment
CONVEX_DEPLOYMENT=dev:your-convex-deployment-url
VITE_CONVEX_URL=https://your-convex-deployment-url.convex.cloud

# 2. OpenAI AI Client (3 Core Variables)
OPENAI_API_KEY=sk-proj-your-openai-api-key
OPENAI_MODEL=gpt-5-nano
OPENAI_BASE_URL=https://api.openai.com/v1

# 3. Firecrawl (Insurer Policy Crawler)
FIRECRAWL_API_KEY=fc-your-firecrawl-api-key

# 4. AgentMail (Autonomous Claim Inboxes & Dispatches)
AGENTMAIL_API_KEY=am_your_agentmail_api_key
```

---

## 2. Installation & Running Locally

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Launch Convex Development Server
In your first terminal:
```bash
npx convex dev
```

### Step 3: Launch Vite React Frontend
In your second terminal:
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 3. Running the 1-Click Live Judge Simulation

1. Open the ClaimHero dashboard.
2. In the top navigation bar, click **"✨ Run Live Simulation"**.
3. Watch the autonomous pipeline execute across 5 sequential stages in under 15 seconds:
   - **Stage 1 (0-3s)**: Ingests a simulated **$24,500 Knee Replacement Surgery Denial (CPT 27447, Code CO-50)** from UnitedHealthcare.
   - **Stage 2 (3-6s)**: Firecrawl crawls UnitedHealthcare Policy 2024T001 and detects a medical necessity contradiction.
   - **Stage 3 (6-9s)**: Convex vector search matches 3 winning precedents, calculating a **91% Overturn Probability Score**.
   - **Stage 4 (9-12s)**: OpenAI synthesizes a cited 4-page medical appeal brief citing ERISA 29 CFR § 2560.503-1.
   - **Stage 5 (12-15s)**: AgentMail transmits the appeal packet and initiates the 30-day statutory response clock.
4. The finalized case dossier opens automatically in the **Collaborative Appeal Studio**.

---

## 4. Verification & Testing

```bash
# Type check TypeScript codebase
npm run typecheck   # or npx tsc --noEmit

# Run unit & contract tests
npm run test
```
