/**
 * Onboarding completion flag — Slice 3B-3C decision.
 *
 * Per-Firebase-UID localStorage key: `ag-onboarding-done:<firebaseUid>`.
 * No global unscoped key is used, so signing out never leaks one user's
 * flag to another user. No backend field or migration.
 */

const KEY_PREFIX = "ag-onboarding-done:";

export function onboardingKeyFor(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

export function isOnboardingDone(uid: string | null | undefined): boolean {
  if (!uid || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(onboardingKeyFor(uid)) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingDone(uid: string): void {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(onboardingKeyFor(uid), "1");
  } catch {
    // Storage full/blocked: onboarding simply shows again next time.
  }
}
