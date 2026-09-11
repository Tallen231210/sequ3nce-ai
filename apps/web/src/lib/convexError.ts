import { ConvexError } from "convex/values";

/**
 * The human-readable half of a Convex failure.
 *
 * A plain Error thrown in a Convex function is stripped to "Server Error" by
 * the time it reaches the browser; only ConvexError carries its message
 * across. This reads that message when there is one and falls back otherwise,
 * so a validation rule can actually tell someone what they did wrong instead
 * of the screen saying "Server Error" or, worse, swallowing it.
 */
export function readableError(e: unknown, fallback: string): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  if (e instanceof Error && e.message && e.message !== "Server Error") return e.message;
  return fallback;
}
