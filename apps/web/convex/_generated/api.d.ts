/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as analytics from "../analytics.js";
import type * as billing from "../billing.js";
import type * as calendly from "../calendly.js";
import type * as calls from "../calls.js";
import type * as closers from "../closers.js";
import type * as highlights from "../highlights.js";
import type * as http from "../http.js";
import type * as teams from "../teams.js";
import type * as trainingPlaylists from "../trainingPlaylists.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  ai: typeof ai;
  analytics: typeof analytics;
  billing: typeof billing;
  calendly: typeof calendly;
  calls: typeof calls;
  closers: typeof closers;
  highlights: typeof highlights;
  http: typeof http;
  teams: typeof teams;
  trainingPlaylists: typeof trainingPlaylists;
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
