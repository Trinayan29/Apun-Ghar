// @vitest-environment jsdom
/**
 * Regression tests for the profile page navigation fixes.
 *
 * The API calls are injected as props (matching the listings pages); the
 * auth slot is a hand-made AuthContext value, so no Firebase, provider
 * tree, or module mocking is needed. Only next/navigation is stubbed, as
 * framework infrastructure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { ReactNode } from "react";
import { AuthContext } from "@/components/AuthProvider";
import { onboardingKeyFor } from "@/lib/onboarding-storage";
import type { AppUser, ProfilePatch, UserProfile } from "@/lib/api";
import ProfilePage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const USER: AppUser = {
  id: 1,
  firebase_uid: "renter-1",
  email: "renter@example.com",
  email_verified: true,
  role: "USER",
  display_name: null,
  phone_number: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const PROFILE: UserProfile = {
  college_location_id: null,
  college_location: null,
  workplace_location_id: null,
  workplace_location: null,
  budget_min: null,
  budget_max: null,
  move_in_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function authValue(overrides: Partial<{ signOut: () => Promise<void> }> = {}) {
  return {
    firebaseUser: { uid: "renter-1", email: "renter@example.com" } as User,
    loading: false,
    signOut: overrides.signOut ?? (async () => {}),
    getIdToken: async () => null,
  };
}

function renderProfile(props: {
  loadMe?: () => Promise<AppUser>;
  loadProfile?: () => Promise<UserProfile>;
  saveProfile?: (patch: ProfilePatch) => Promise<UserProfile>;
  signOut?: () => Promise<void>;
} = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={authValue({ signOut: props.signOut })}>
      {children}
    </AuthContext.Provider>
  );
  return render(
    <ProfilePage
      loadMe={props.loadMe ?? (async () => USER)}
      loadProfile={props.loadProfile ?? (async () => PROFILE)}
      saveProfile={props.saveProfile ?? (async () => PROFILE)}
    />,
    { wrapper }
  );
}

describe("profile page navigation", () => {
  it("points Back home at the marketplace for a signed-in renter", async () => {
    window.localStorage.setItem(onboardingKeyFor("renter-1"), "1");
    renderProfile();
    expect(await screen.findByText("Your profile")).toBeDefined();
    expect(screen.getByText("Back home").getAttribute("href")).toBe(
      "/listings"
    );
  });

  it("sends the logo to the marketplace once onboarding is done", async () => {
    window.localStorage.setItem(onboardingKeyFor("renter-1"), "1");
    renderProfile();
    expect(await screen.findByText("Your profile")).toBeDefined();
    expect(screen.getByText("Apun-Ghar").getAttribute("href")).toBe(
      "/listings"
    );
  });

  it("keeps the logo on the home landing page while onboarding is unfinished", async () => {
    renderProfile();
    expect(await screen.findByText("Your profile")).toBeDefined();
    expect(screen.getByText("Apun-Ghar").getAttribute("href")).toBe("/");
    // Back home is unconditional: the renter can always reach listings.
    expect(screen.getByText("Back home").getAttribute("href")).toBe(
      "/listings"
    );
  });

  it("returns to the marketplace after saving preferences", async () => {
    const saveProfile = vi.fn(async () => PROFILE);
    renderProfile({ saveProfile });
    expect(await screen.findByText("Your profile")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    await vi.waitFor(() => {
      expect(saveProfile).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/listings");
    });
  });

  it("keeps owners in Owner Studio", async () => {
    renderProfile({
      loadMe: async () => ({ ...USER, role: "OWNER" }),
    });
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/owner/dashboard");
    });
  });

  it("signs out to /login from the profile header", async () => {
    const signOut = vi.fn(async () => {});
    renderProfile({ signOut });
    expect(await screen.findByText("Your profile")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await vi.waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });
});
