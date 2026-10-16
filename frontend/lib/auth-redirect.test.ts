import { describe, expect, it } from "vitest";
import { homeDestination, postAuthDestination } from "./auth-redirect";

describe("postAuthDestination", () => {
  it("sends owners to Owner Studio regardless of onboarding state", () => {
    expect(
      postAuthDestination({ role: "OWNER", onboardingDone: false })
    ).toBe("/owner/dashboard");
    expect(
      postAuthDestination({ role: "OWNER", onboardingDone: true })
    ).toBe("/owner/dashboard");
  });

  it("sends renters with completed onboarding straight to the marketplace", () => {
    expect(postAuthDestination({ role: "USER", onboardingDone: true })).toBe(
      "/listings"
    );
    // ADMIN keeps renter behavior, matching the existing pages.
    expect(postAuthDestination({ role: "ADMIN", onboardingDone: true })).toBe(
      "/listings"
    );
  });

  it("keeps required onboarding for users who have not completed it", () => {
    expect(postAuthDestination({ role: "USER", onboardingDone: false })).toBe(
      "/onboarding"
    );
  });

  it("falls through to renter routing when the role lookup fails", () => {
    // A failed getMe() must never invent an owner session…
    expect(postAuthDestination({ role: null, onboardingDone: true })).toBe(
      "/listings"
    );
    // …nor skip onboarding for a genuinely new user.
    expect(postAuthDestination({ role: null, onboardingDone: false })).toBe(
      "/onboarding"
    );
  });
});

describe("homeDestination", () => {
  it("sends completed, signed-in users to the marketplace", () => {
    expect(
      homeDestination({ signedIn: true, onboardingDone: true })
    ).toBe("/listings");
  });

  it("keeps the landing page for signed-out visitors", () => {
    expect(
      homeDestination({ signedIn: false, onboardingDone: false })
    ).toBe("/");
    // A stale onboarding flag must never leak the marketplace to a
    // signed-out visitor: signedIn gates the decision.
    expect(
      homeDestination({ signedIn: false, onboardingDone: true })
    ).toBe("/");
  });

  it("keeps the landing page for signed-in users still onboarding", () => {
    expect(
      homeDestination({ signedIn: true, onboardingDone: false })
    ).toBe("/");
  });
});
