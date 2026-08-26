/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_appealSynthesizer from "../actions/appealSynthesizer.js";
import type * as actions_mailDispatcher from "../actions/mailDispatcher.js";
import type * as actions_opticalParser from "../actions/opticalParser.js";
import type * as actions_policyCrawler from "../actions/policyCrawler.js";
import type * as actions_precedentMatcher from "../actions/precedentMatcher.js";
import type * as appeals from "../appeals.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as claims from "../claims.js";
import type * as clinicalEvidences from "../clinicalEvidences.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as lib_openai from "../lib/openai.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/appealSynthesizer": typeof actions_appealSynthesizer;
  "actions/mailDispatcher": typeof actions_mailDispatcher;
  "actions/opticalParser": typeof actions_opticalParser;
  "actions/policyCrawler": typeof actions_policyCrawler;
  "actions/precedentMatcher": typeof actions_precedentMatcher;
  appeals: typeof appeals;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  claims: typeof claims;
  clinicalEvidences: typeof clinicalEvidences;
  crons: typeof crons;
  emails: typeof emails;
  http: typeof http;
  "lib/openai": typeof lib_openai;
  users: typeof users;
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

export declare const components: {};
