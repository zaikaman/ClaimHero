# ClaimHero Demo Script

**Target runtime:** 2 minutes 55 seconds

**Primary demo path:** Google sign-in → Case Radar → Ingest Denial → Confirm Case Context & Records → live Sentinel Pipeline → Evidence & CPB → Appeal Brief → Payer Dispatch.

## Recording preparation

- Use a Google account created for the demo and click **Continue with Google**.
- Switch the interface toggle from **Simple** to **Details on** so judges can see CPT, CPB, ERISA, and pipeline terminology.
- In the intake modal, use the **Try demo case (synthetic)** tab and choose one of the three fixtures. These synthetic cases still run live extraction, crawling, and scoring; do not use real patient data.
- Stop at the human approval gate unless you are using a controlled test recipient. The button is **Approve & Transmit to Official Gateway**.
- Keep the anonymous seeded workspace as the fallback: **Explore as Anonymous Advocate** → an existing synthetic case.

## 0:00–0:25 — Start with the human problem

**On screen:** Begin on the ClaimHero landing page, then briefly show a synthetic denial notice or the login surface.

**Voiceover:**

“Imagine a family opening the mail and finding a denial for an important medical procedure. The insurer says the care was not medically necessary, but the letter does not make the next steps easy. The family has to find the rule behind the decision, prove what the medical records already show, identify what is missing, find the right appeal destination, and beat a filing deadline that is already running. That is the moment ClaimHero is built for.”

## 0:25–0:38 — Sign in and frame the product

**On screen:** ClaimHero login page. Click **Continue with Google**, then land on **Case Radar**.

**Voiceover:**

“ClaimHero gives denial teams one authenticated workspace to turn that denial into a sourced appeal and keep the case moving until a human approves the response.”

## 0:38–0:58 — Start a controlled live case

**On screen:** On Case Radar, click **Ingest Denial**. In the modal, open **Try demo case (synthetic)** and select one of the three demo presets.

**Voiceover:**

“I’ll use one of ClaimHero’s synthetic demo presets so the case is safe to show on camera and repeatable for judges. These fixtures are not mocked results: ClaimHero still runs the extraction, policy crawl, evidence scoring, and appeal drafting pipeline on the selected denial.”

## 0:58–1:18 — Confirm the facts

**On screen:** Review **Confirm Case Context & Records**. Show the extracted case facts and clinical context, then click **Save Context & Open Workspace**.

**Voiceover:**

“Before analysis begins, ClaimHero gives me a chance to check the extracted facts and the clinical context. I confirm that these details come from the available records, then move into the case workspace.”

## 1:18–1:48 — Watch the live pipeline

**On screen:** After saving, the modal closes and the app opens **Evidence & CPB**. Show the **Live agent activity** card as events arrive.

**Voiceover:**

“Saving the context activates the Sentinel Pipeline automatically. This is live work on the new case, not a prewritten result. The activity feed shows the stages as they happen: review, policy search, win scoring, past-case retrieval, and brief drafting. Firecrawl discovers the insurer’s policy sources, OpenAI handles structured extraction and drafting, and Convex keeps the workflow and results reactive.”

## 1:48–2:13 — Evidence & CPB

**On screen:** Stay on **1. Evidence & CPB**. Show the denial language, insurer policy clause, clinical evidence, missing proof, citations, and readiness score.

**Voiceover:**

“The first case step is **Evidence & CPB**. ClaimHero places the denial beside the insurer’s own policy requirements, supporting clinical evidence, missing proof, and retrieved precedents. The readiness score explains how complete the evidence package is; it is not a prediction that the appeal will win.”

## 2:13–2:38 — Appeal Brief

**On screen:** Click **2. Appeal Brief**. Show the generated brief, **Markdown source**, formatted preview, and citation sidebar.

**Voiceover:**

“Next is the **Appeal Brief**. The generated document is editable, versioned, and tied to inspectable sources. I can review the Markdown source, preview the formatted brief, and open the citation sidebar instead of accepting unsupported model output.”

## 2:38–2:50 — Payer Dispatch and the human gate

**On screen:** Click **3. Payer Dispatch**. Show **Payer Communications Inbox**, recipient, exhibits, delivery channel, and **Human Review Mandatory**.

**Voiceover:**

“The final step is **Payer Dispatch**. The communications inbox keeps the recipient, appeal packet, exhibits, delivery evidence, and future replies with the same case. Nothing goes out automatically: the authorized advocate must review the recipient and message before choosing **Approve & Transmit to Official Gateway**.”

## 2:50–2:58 — Show the system around the letter

**On screen:** Open **Audit Trail** or **History** and briefly show the deadline clock, pipeline history, and case events.

**Voiceover:**

“The letter is only one part of the case. ClaimHero keeps the deadline, pipeline history, source trail, and tamper-proof case log together, so the team can see what happened and what still needs attention.”

## 2:58–3:00 — Close

**On screen:** Return to Case Radar with the case status visible.

**Voiceover:**

“That is ClaimHero: a live, reviewable appeal workflow built on Convex, Firecrawl, OpenAI, and AgentMail.”
