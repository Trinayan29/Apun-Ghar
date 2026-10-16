import type { AppRole } from "./api";

/* ------------------------------------------------------------------ */
/* Post-authentication destinations                                     */
/* ------------------------------------------------------------------ */

export type PostAuthDestination = "/owner/dashboard" | "/onboarding" | "/listings";

/**
 * Single decision point for where an authenticated user goes next.
 *
 * OWNER accounts live in Owner Studio and never enter renter onboarding.
 * Renters with completed onboarding go straight to the marketplace;
 * everyone else must still pass through (optional) onboarding first.
 * A null role means the role lookup failed (network/401 hiccup): fall
 * through to renter routing exactly as the pages did before — never
 * invent an owner session, never skip onboarding for a new user.
 */
export function postAuthDestination(args: {
  role: AppRole | null;
  onboardingDone: boolean;
}): PostAuthDestination {
  if (args.role === "OWNER") return "/owner/dashboard";
  return args.onboardingDone ? "/listings" : "/onboarding";
}

/* ------------------------------------------------------------------ */
/* Brand / logo destinations                                            */
/* ------------------------------------------------------------------ */

export type HomeDestination = "/" | "/listings";

/**
 * Where the Apun-Ghar brand link should point.
 *
 * Signed-in users who finished onboarding have no reason to land on the
 * marketing / "welcome back" home screen — they belong in the
 * marketplace. Everyone else keeps the landing page: signed-out visitors
 * get the marketing page, and signed-in-but-incomplete users get the
 * "finish setting up" screen.
 */
export function homeDestination(args: {
  signedIn: boolean;
  onboardingDone: boolean;
}): HomeDestination {
  return args.signedIn && args.onboardingDone ? "/listings" : "/";
}
