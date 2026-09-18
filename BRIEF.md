# Convex All Gas Hackathon - Brief

> Source: [convex.dev/hackathons/all-gas](https://www.convex.dev/hackathons/all-gas) and [Luma registration page](https://luma.com/convex-allgas-hackathon), verified 2026-09-18. Wording below tracks the official site. Interpretive notes for ClaimHero are marked as such.

## 1. Executive Overview

- **Event Name:** Convex All Gas Hackathon
- **Official URL:** [convex.dev/hackathons/all-gas](https://www.convex.dev/hackathons/all-gas)
- **Tagline:** Build a new full-stack app: Convex runs it, Firecrawl feeds it data, AgentMail gives it an inbox. Use Codex or any agent with the Convex plugin. Three weeks to ship something people can use.
- **Registration:** [luma.com/convex-allgas-hackathon](https://luma.com/convex-allgas-hackathon)
- **Submission:** [vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit) (repo + live app URL + three-minute video)
- **Core Sponsors:** Convex, OpenAI (Codex), Firecrawl, AgentMail.

## 2. Important Dates

| Milestone | Date & Time | Source |
| :--- | :--- | :--- |
| **Kickoff** | August 25 | Official site |
| **Submissions due** | September 22 at 12:00 PM PT | Official site |
| **Winners announced** | September 25 | Official site |

Note: the official site does not publish a judging-period window. Any judging-period dates used elsewhere are interpretive, not official.

## 3. How to Participate (official six steps)

1. **Register on Luma** — confirm participation at [luma.com/convex-allgas-hackathon](https://luma.com/convex-allgas-hackathon).
2. **Copy the hackathon setup prompt** — paste it into the coding agent. It installs the Convex integration, the hackathon skill, and starts the build log.
3. **Build with Convex** — anything goes, as long as Convex is the backend. Run `/hackathon` while building to keep the build log current.
4. **Deploy a public app** — must be a `convex.site` or `chatgpt.site` URL that judges or an agent can open without an invite.
5. **Share the app** — tag `@convex`, `@OpenAI`, `@firecrawl`, and `@agentmail` on X or LinkedIn.
6. **Submit repo, live app URL, and three-minute video** — before September 22 at 12:00 PM PT at the vibeapps submission link above.

## 4. Technology Expectations (official + ClaimHero interpretation)

Official requirement: each submission must include Convex and use hackathon cohost or partner integrations. Codex is ideal and required for `chatgpt.site`; other IDEs (Claude, Cursor, GitHub Copilot, or any other IDE) are allowed.

ClaimHero interpretation (not official wording):

1. **Convex:** database, functions, realtime sync, plus queries, mutations, live updates, auth, components, storage, crons, HTTP actions, search/vector indexes, workflows.
2. **Firecrawl:** live crawling/scraping feeding structured data into Convex.
3. **AgentMail:** programmatic inboxes, two-way correspondence, inbound webhooks.
4. **OpenAI / Codex / agent ecosystem:** agent-assisted build plus model reasoning/generation in the product.

## 5. Prize Pool

- **Overall winner:** $10,000 cash, $5,000 in Codex credits, 3 months Firecrawl Growth plan, 6 months AgentMail Startup plan, Codex/Firecrawl/Convex swag.
- **Second place:** $5,000 cash, $2,500 in Codex credits, 3 months Firecrawl Growth plan, 3 months AgentMail Startup plan, Codex and Convex swag.
- **Third place:** $1,500 cash, $1,000 in Codex credits, 3 months Firecrawl Growth plan, 3 months AgentMail Startup plan.
- **Build credits:** 20,000 Firecrawl credits for every participant after registering on Luma. No OpenAI API credits or Convex credits are provided as credits during the hackathon.

## 6. Submission Requirements (official)

- Submit before 12:00 PM PT on September 22 at the exact vibeapps link above. No localhost submissions.
- All GitHub repos must be public to qualify.
- Only new apps started on or after August 25 at 12 PM PT qualify.
- Projects should be original and must not violate intellectual property rights.
- Each submission must include Convex and use hackathon cohost or partner integrations.
- Multiple submissions per builder/team are allowed.
- Frontend must run on Convex static hosting (`convex.site`) or ChatGPT Sites (`chatgpt.site`).

What the official rules do **not** require:

- There is **no official “free of mock, stubbed, or hardcoded mock data” rule**. Labelled synthetic demo/seed data used to demonstrate real workflows is not listed as a disqualifier. Prior versions of this file stated that rule in error; it has been removed.
- There is **no official standalone `hackathon.md` submission requirement**. The official judging criterion says the build log is what judges read (`include what you built, the stack, the live URL, and your demo link`), so ClaimHero maintains `hackathon.md` as supporting evidence, not as an official checklist item.
- Per the Luma FAQ, Convex Auth v1 alpha is not a requirement; apps with no auth are still valid. ClaimHero implements auth anyway for case ownership.

## 7. Qualification and Judging Criteria (official wording)

1. **Everyday apps, not developer tools:** We score what you ship on Convex, OpenAI, Firecrawl, and AgentMail. Your hackathon build log is what judges read, so include what you built, the stack, the live URL, and your demo link.
2. **Creativity and usefulness:** Build something a real person would use this week: law, hospitality, health, construction, whatever you know. Copycats and developer-only tools score low.
3. **Convex depth:** Real use of queries, mutations, live updates, auth, and components. A thin frontend on a hosted page does not count.
4. **Sponsor stack:** OpenAI, Firecrawl, and AgentMail do real work in your product. They generate, crawl, or send, not just sit in the README.
5. **Live URL:** Judges can open what you built. Publish on `convex.site` or `chatgpt.site`. No localhost demos.
6. **Social proof:** You posted your build on X or LinkedIn. Engagement counts.
7. **Video demo:** Under 3 minutes. Talk less, click through the real product.

## 8. Judging Panel (official listing)

- **Convex:**
  - Jamie Turner (Co-Founder and CEO)
  - Wayne Sutton (Head of Community and Startup Programs)
  - Shawn Erquhart (FDE)
  - Michael Cann (DevX Engineer)
  - Nicolas Ettlin (Software Engineer)

- **OpenAI:**
  - Moustafa Elhadary (ChatGPT / Codex)
  - Ansh Gupta (Applied AI, Startups)
  - Apoorv Jha (Applied AI)
  - Cole Lin (Member of Technical Staff)

- **Firecrawl:**
  - Max Kelly (Forward Deployed Engineer)

- **AgentMail:**
  - Haakam Aujla (Co-Founder and CEO)
  - Binoy Perera (Founding GTM/Ops)
  - Harry Du (Founding Engineer)

- **Industry and Domain Experts:**
  - Simon Lefort (Platform Lead at ClarityCare AI)
  - Nicole Grossmann (Founding Team at Vigil Labs)

## 9. Eligibility and Rules (official)

- Participants must be at least 18 years old.
- Employees of Convex, hackathon sponsors or cohosts, and their immediate family members are not eligible to participate.
- The hackathon is not open to individuals resident in, or organizations domiciled in, a country, state, province, or territory where United States or local law prohibits participation or receiving a prize (including Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria, and any other country designated by the United States Treasury Office of Foreign Assets Control).
- Prizes are non-transferable and cannot be exchanged for other items; cash/credits/swag form is determined by the hackathon cohost.
- Unlimited individuals/teams; teams max four people; only one team member needs to register on Luma.
