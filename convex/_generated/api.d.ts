/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_agentMail from "../actions/agentMail.js";
import type * as actions_appealSynthesizer from "../actions/appealSynthesizer.js";
import type * as actions_clinicalIntake from "../actions/clinicalIntake.js";
import type * as actions_mailDispatcher from "../actions/mailDispatcher.js";
import type * as actions_opticalParser from "../actions/opticalParser.js";
import type * as actions_p2pDefenseGenerator from "../actions/p2pDefenseGenerator.js";
import type * as actions_p2pLiveCopilot from "../actions/p2pLiveCopilot.js";
import type * as actions_payerContactResolver from "../actions/payerContactResolver.js";
import type * as actions_policyCrawler from "../actions/policyCrawler.js";
import type * as actions_precedentArchive from "../actions/precedentArchive.js";
import type * as actions_precedentMatcher from "../actions/precedentMatcher.js";
import type * as actions_sentinelAgent from "../actions/sentinelAgent.js";
import type * as actions_sentinelChatbot from "../actions/sentinelChatbot.js";
import type * as actions_sentinelPipeline from "../actions/sentinelPipeline.js";
import type * as appeals from "../appeals.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as chatbot from "../chatbot.js";
import type * as claims from "../claims.js";
import type * as clinicalEvidences from "../clinicalEvidences.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as lib_adversaryNegotiation from "../lib/adversaryNegotiation.js";
import type * as lib_agentMail from "../lib/agentMail.js";
import type * as lib_agentMailWebhook from "../lib/agentMailWebhook.js";
import type * as lib_aggregates from "../lib/aggregates.js";
import type * as lib_aiAdjudicator from "../lib/aiAdjudicator.js";
import type * as lib_appealEmail from "../lib/appealEmail.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_openai from "../lib/openai.js";
import type * as lib_pdfGenerator from "../lib/pdfGenerator.js";
import type * as lib_precedentCorpus from "../lib/precedentCorpus.js";
import type * as lib_precedentValidators from "../lib/precedentValidators.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_redactionEngine from "../lib/redactionEngine.js";
import type * as model_auth from "../model/auth.js";
import type * as p2pCallSessions from "../p2pCallSessions.js";
import type * as p2pScripts from "../p2pScripts.js";
import type * as precedents from "../precedents.js";
import type * as sentinelAgentQueries from "../sentinelAgentQueries.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/agentMail": typeof actions_agentMail;
  "actions/appealSynthesizer": typeof actions_appealSynthesizer;
  "actions/clinicalIntake": typeof actions_clinicalIntake;
  "actions/mailDispatcher": typeof actions_mailDispatcher;
  "actions/opticalParser": typeof actions_opticalParser;
  "actions/p2pDefenseGenerator": typeof actions_p2pDefenseGenerator;
  "actions/p2pLiveCopilot": typeof actions_p2pLiveCopilot;
  "actions/payerContactResolver": typeof actions_payerContactResolver;
  "actions/policyCrawler": typeof actions_policyCrawler;
  "actions/precedentArchive": typeof actions_precedentArchive;
  "actions/precedentMatcher": typeof actions_precedentMatcher;
  "actions/sentinelAgent": typeof actions_sentinelAgent;
  "actions/sentinelChatbot": typeof actions_sentinelChatbot;
  "actions/sentinelPipeline": typeof actions_sentinelPipeline;
  appeals: typeof appeals;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  chatbot: typeof chatbot;
  claims: typeof claims;
  clinicalEvidences: typeof clinicalEvidences;
  crons: typeof crons;
  emails: typeof emails;
  http: typeof http;
  "lib/adversaryNegotiation": typeof lib_adversaryNegotiation;
  "lib/agentMail": typeof lib_agentMail;
  "lib/agentMailWebhook": typeof lib_agentMailWebhook;
  "lib/aggregates": typeof lib_aggregates;
  "lib/aiAdjudicator": typeof lib_aiAdjudicator;
  "lib/appealEmail": typeof lib_appealEmail;
  "lib/auth": typeof lib_auth;
  "lib/embeddings": typeof lib_embeddings;
  "lib/openai": typeof lib_openai;
  "lib/pdfGenerator": typeof lib_pdfGenerator;
  "lib/precedentCorpus": typeof lib_precedentCorpus;
  "lib/precedentValidators": typeof lib_precedentValidators;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/redactionEngine": typeof lib_redactionEngine;
  "model/auth": typeof model_auth;
  p2pCallSessions: typeof p2pCallSessions;
  p2pScripts: typeof p2pScripts;
  precedents: typeof precedents;
  sentinelAgentQueries: typeof sentinelAgentQueries;
  settings: typeof settings;
  users: typeof users;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  aggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregate">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  authUsername: import("@convex-dev/auth/username/_generated/component.js").ComponentApi<"authUsername">;
  authPasswordProvider: import("@convex-dev/auth/providers/password/_generated/component.js").ComponentApi<"authPasswordProvider">;
  oauthGoogle: import("@convex-dev/auth/providers/oauth/_generated/component.js").ComponentApi<"oauthGoogle">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
