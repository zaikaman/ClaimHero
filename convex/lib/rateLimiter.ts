import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Master multi-stage AI reasoning, crawling & briefing pipeline (burst: 5, rate: 5/min)
  sentinelPipeline: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },
  // Optical vision denial extraction (burst: 10, rate: 10/min)
  opticalParser: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Firecrawl clinical policy bulletin scraping & web search (burst: 10, rate: 10/min)
  policyCrawler: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Legal memorandum AI synthesis (burst: 10, rate: 10/min)
  appealSynthesizer: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Physician Peer-to-Peer tele-script generator (burst: 10, rate: 10/min)
  p2pGenerator: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Outbound AgentMail transmission (burst: 10, rate: 10/min)
  mailDispatcher: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Sentinel Chatbot conversational assistant (burst: 20, rate: 20/min)
  sentinelChatbot: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 20,
  },
  // AgentMail inbound webhook rate limiter (burst: 30, rate: 30/min)
  agentMailWebhook: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  // Precedent matcher & scoring engine (burst: 10, rate: 10/min)
  precedentMatcher: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Clinical intake questions generator (burst: 10, rate: 10/min)
  clinicalIntake: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Precedent vector & hybrid search (burst: 20, rate: 20/min)
  precedentSearch: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 20,
  },
  // Chatbot conversation messages (burst: 30, rate: 30/min)
  chatMessage: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  // Hot claim mutations such as audit logging and draft dismissals (burst: 40, rate: 40/min)
  claimWrite: {
    kind: "token bucket",
    rate: 40,
    period: MINUTE,
    capacity: 40,
  },
  // Denial document attachment upload URL generation (burst: 10, rate: 10/min)
  fileUpload: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // AgentMail inbound inbox sync distributed cooldown (1 call/minute, capacity: 1)
  inboxSync: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE,
    capacity: 1,
  },
  // Case collaboration invites (burst: 10, rate: 10/min per owner)
  collabInvite: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  // Danger Zone portfolio wipe rate limit (strict: 1 reset per 15 minutes, capacity: 1)
  resetPortfolio: {
    kind: "token bucket",
    rate: 1,
    period: 15 * MINUTE,
    capacity: 1,
  },
});

