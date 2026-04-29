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
import type * as b2cAdoptionChecklist from "../b2cAdoptionChecklist.js";
import type * as b2cAuth from "../b2cAuth.js";
import type * as b2cBilling from "../b2cBilling.js";
import type * as b2cBugReports from "../b2cBugReports.js";
import type * as b2cCalendars from "../b2cCalendars.js";
import type * as b2cCoachingCalls from "../b2cCoachingCalls.js";
import type * as b2cCoachingCallsDaily from "../b2cCoachingCallsDaily.js";
import type * as b2cCoachingReplayWatched from "../b2cCoachingReplayWatched.js";
import type * as b2cCommunity from "../b2cCommunity.js";
import type * as b2cCommunityReactions from "../b2cCommunityReactions.js";
import type * as b2cContentSubmissions from "../b2cContentSubmissions.js";
import type * as b2cDirectMessages from "../b2cDirectMessages.js";
import type * as b2cEmailVerification from "../b2cEmailVerification.js";
import type * as b2cFeatureRequests from "../b2cFeatureRequests.js";
import type * as b2cFriendships from "../b2cFriendships.js";
import type * as b2cGhl from "../b2cGhl.js";
import type * as b2cGhlInternal from "../b2cGhlInternal.js";
import type * as b2cHighlightClips from "../b2cHighlightClips.js";
import type * as b2cHighlightShares from "../b2cHighlightShares.js";
import type * as b2cJobBoard from "../b2cJobBoard.js";
import type * as b2cLeads from "../b2cLeads.js";
import type * as b2cMoneyBells from "../b2cMoneyBells.js";
import type * as b2cObjectionPlaybook from "../b2cObjectionPlaybook.js";
import type * as b2cPersonalGoals from "../b2cPersonalGoals.js";
import type * as b2cPresence from "../b2cPresence.js";
import type * as b2cProfiles from "../b2cProfiles.js";
import type * as b2cPublicJobs from "../b2cPublicJobs.js";
import type * as b2cResources from "../b2cResources.js";
import type * as b2cStatsVerification from "../b2cStatsVerification.js";
import type * as b2cStripe from "../b2cStripe.js";
import type * as b2cTeamNotifications from "../b2cTeamNotifications.js";
import type * as b2cTraining from "../b2cTraining.js";
import type * as b2cWeeklyContest from "../b2cWeeklyContest.js";
import type * as billing from "../billing.js";
import type * as botAvatar from "../botAvatar.js";
import type * as calendar from "../calendar.js";
import type * as calendarOAuth from "../calendarOAuth.js";
import type * as calendly from "../calendly.js";
import type * as callReviews from "../callReviews.js";
import type * as calls from "../calls.js";
import type * as clientErrors from "../clientErrors.js";
import type * as closers from "../closers.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as discord from "../discord.js";
import type * as ghl from "../ghl.js";
import type * as ghlActions from "../ghlActions.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as highlights from "../highlights.js";
import type * as http from "../http.js";
import type * as hyros from "../hyros.js";
import type * as hyrosActions from "../hyrosActions.js";
import type * as lib_encrypt from "../lib/encrypt.js";
import type * as liveMessages from "../liveMessages.js";
import type * as liveStreams from "../liveStreams.js";
import type * as meetingBot from "../meetingBot.js";
import type * as reinforcements from "../reinforcements.js";
import type * as resources from "../resources.js";
import type * as rolePlayRoom from "../rolePlayRoom.js";
import type * as sharedLinks from "../sharedLinks.js";
import type * as slack from "../slack.js";
import type * as stream from "../stream.js";
import type * as streamActions from "../streamActions.js";
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
  b2cAdoptionChecklist: typeof b2cAdoptionChecklist;
  b2cAuth: typeof b2cAuth;
  b2cBilling: typeof b2cBilling;
  b2cBugReports: typeof b2cBugReports;
  b2cCalendars: typeof b2cCalendars;
  b2cCoachingCalls: typeof b2cCoachingCalls;
  b2cCoachingCallsDaily: typeof b2cCoachingCallsDaily;
  b2cCoachingReplayWatched: typeof b2cCoachingReplayWatched;
  b2cCommunity: typeof b2cCommunity;
  b2cCommunityReactions: typeof b2cCommunityReactions;
  b2cContentSubmissions: typeof b2cContentSubmissions;
  b2cDirectMessages: typeof b2cDirectMessages;
  b2cEmailVerification: typeof b2cEmailVerification;
  b2cFeatureRequests: typeof b2cFeatureRequests;
  b2cFriendships: typeof b2cFriendships;
  b2cGhl: typeof b2cGhl;
  b2cGhlInternal: typeof b2cGhlInternal;
  b2cHighlightClips: typeof b2cHighlightClips;
  b2cHighlightShares: typeof b2cHighlightShares;
  b2cJobBoard: typeof b2cJobBoard;
  b2cLeads: typeof b2cLeads;
  b2cMoneyBells: typeof b2cMoneyBells;
  b2cObjectionPlaybook: typeof b2cObjectionPlaybook;
  b2cPersonalGoals: typeof b2cPersonalGoals;
  b2cPresence: typeof b2cPresence;
  b2cProfiles: typeof b2cProfiles;
  b2cPublicJobs: typeof b2cPublicJobs;
  b2cResources: typeof b2cResources;
  b2cStatsVerification: typeof b2cStatsVerification;
  b2cStripe: typeof b2cStripe;
  b2cTeamNotifications: typeof b2cTeamNotifications;
  b2cTraining: typeof b2cTraining;
  b2cWeeklyContest: typeof b2cWeeklyContest;
  billing: typeof billing;
  botAvatar: typeof botAvatar;
  calendar: typeof calendar;
  calendarOAuth: typeof calendarOAuth;
  calendly: typeof calendly;
  callReviews: typeof callReviews;
  calls: typeof calls;
  clientErrors: typeof clientErrors;
  closers: typeof closers;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  discord: typeof discord;
  ghl: typeof ghl;
  ghlActions: typeof ghlActions;
  googleCalendar: typeof googleCalendar;
  highlights: typeof highlights;
  http: typeof http;
  hyros: typeof hyros;
  hyrosActions: typeof hyrosActions;
  "lib/encrypt": typeof lib_encrypt;
  liveMessages: typeof liveMessages;
  liveStreams: typeof liveStreams;
  meetingBot: typeof meetingBot;
  reinforcements: typeof reinforcements;
  resources: typeof resources;
  rolePlayRoom: typeof rolePlayRoom;
  sharedLinks: typeof sharedLinks;
  slack: typeof slack;
  stream: typeof stream;
  streamActions: typeof streamActions;
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
