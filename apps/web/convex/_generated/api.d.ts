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
import type * as calendar from "../calendar.js";
import type * as calendarOAuth from "../calendarOAuth.js";
import type * as calendly from "../calendly.js";
import type * as calls from "../calls.js";
import type * as clientErrors from "../clientErrors.js";
import type * as closers from "../closers.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as discord from "../discord.js";
import type * as highlights from "../highlights.js";
import type * as http from "../http.js";
import type * as liveMessages from "../liveMessages.js";
import type * as liveStreams from "../liveStreams.js";
import type * as meetingBot from "../meetingBot.js";
import type * as reinforcements from "../reinforcements.js";
import type * as resources from "../resources.js";
import type * as rolePlayRoom from "../rolePlayRoom.js";
import type * as slack from "../slack.js";
import type * as teams from "../teams.js";
import type * as trainingPlaylists from "../trainingPlaylists.js";
import type * as zoomOAuth from "../zoomOAuth.js";

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
  calendar: typeof calendar;
  calendarOAuth: typeof calendarOAuth;
  calendly: typeof calendly;
  calls: typeof calls;
  clientErrors: typeof clientErrors;
  closers: typeof closers;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  discord: typeof discord;
  highlights: typeof highlights;
  http: typeof http;
  liveMessages: typeof liveMessages;
  liveStreams: typeof liveStreams;
  meetingBot: typeof meetingBot;
  reinforcements: typeof reinforcements;
  resources: typeof resources;
  rolePlayRoom: typeof rolePlayRoom;
  slack: typeof slack;
  teams: typeof teams;
  trainingPlaylists: typeof trainingPlaylists;
  zoomOAuth: typeof zoomOAuth;
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
