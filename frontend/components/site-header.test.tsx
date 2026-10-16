// @vitest-environment jsdom
/**
 * Tests for the shared public SiteHeader (marketplace navigation fix).
 * The header is fully prop-driven: no Firebase, provider, or router.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SiteHeader from "./site-header";

afterEach(() => {
  cleanup();
});

function renderHeader(overrides: {
  loading?: boolean;
  signedIn?: boolean;
  onboardingDone?: boolean;
  onSignOut?: () => Promise<void>;
  onSignedOut?: () => void;
  children?: React.ReactNode;
} = {}) {
  const onSignOut = overrides.onSignOut ?? (async () => {});
  const onSignedOut = overrides.onSignedOut ?? vi.fn();
  render(
    <SiteHeader
      loading={overrides.loading ?? false}
      signedIn={overrides.signedIn ?? false}
      onboardingDone={overrides.onboardingDone ?? false}
      onSignOut={onSignOut}
      onSignedOut={onSignedOut}
    >
      {overrides.children}
    </SiteHeader>
  );
  return { onSignedOut };
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
}

describe("SiteHeader auth states", () => {
  it("renders a neutral placeholder while auth initializes", () => {
    renderHeader({ loading: true, signedIn: false });
    expect(screen.getByLabelText("Apun-Ghar home")).toBeDefined();
    // No account action of either kind may flash during init.
    expect(screen.queryByText("Create a renter account")).toBeNull();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
  });

  it("shows the signup action and no profile menu when signed out", () => {
    renderHeader({ signedIn: false });
    const signup = screen.getByText("Create a renter account");
    expect(signup.getAttribute("href")).toBe("/signup");
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows a profile button instead of a standalone Sign out when signed in", () => {
    renderHeader({ signedIn: true });
    expect(
      screen.getByRole("button", { name: "Account menu" })
    ).toBeDefined();
    expect(screen.queryByText("Create a renter account")).toBeNull();
    expect(screen.queryByText("View your profile")).toBeNull();
    expect(screen.queryByText("Owner dashboard")).toBeNull();
    // Menu starts closed.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders extra actions such as Back to browse", () => {
    renderHeader({ signedIn: false, children: <span>Back to browse</span> });
    expect(screen.getByText("Back to browse")).toBeDefined();
    expect(screen.getByText("Create a renter account")).toBeDefined();
  });
});

describe("SiteHeader brand link", () => {
  it("sends completed, signed-in users to the marketplace", () => {
    renderHeader({ signedIn: true, onboardingDone: true });
    expect(
      screen.getByLabelText("Apun-Ghar home").getAttribute("href")
    ).toBe("/listings");
  });

  it("keeps the landing page for signed-in users still onboarding", () => {
    renderHeader({ signedIn: true, onboardingDone: false });
    expect(
      screen.getByLabelText("Apun-Ghar home").getAttribute("href")
    ).toBe("/");
  });

  it("keeps the landing page for signed-out visitors", () => {
    renderHeader({ signedIn: false });
    expect(
      screen.getByLabelText("Apun-Ghar home").getAttribute("href")
    ).toBe("/");
  });
});

describe("SiteHeader account menu", () => {
  it("opens the menu with My Profile and Sign out", () => {
    renderHeader({ signedIn: true });
    openMenu();
    expect(screen.getByRole("menu", { name: "Account" })).toBeDefined();
    const profile = screen.getByRole("menuitem", { name: "My Profile" });
    expect(profile.getAttribute("href")).toBe("/profile");
    expect(
      screen.getByRole("menuitem", { name: "Sign out" })
    ).toBeDefined();
  });

  it("redirects only after sign-out succeeds and closes the menu", async () => {
    const onSignedOut = vi.fn();
    renderHeader({ signedIn: true, onSignedOut });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the user signed in and shows an error when sign-out fails", async () => {
    const onSignedOut = vi.fn();
    renderHeader({
      signedIn: true,
      onSignOut: async () => {
        throw new Error("network down");
      },
      onSignedOut,
    });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(
      await screen.findByText("Couldn't sign you out. Please try again.")
    ).toBeDefined();
    // No redirect, and the user is still presented as signed in.
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Account menu" })
    ).toBeDefined();
    expect(screen.queryByText("Create a renter account")).toBeNull();
  });

  it("closes the menu with Escape", async () => {
    renderHeader({ signedIn: true });
    openMenu();
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("closes the menu on outside click", async () => {
    render(
      <div>
        <button type="button">outside</button>
        <SiteHeader
          loading={false}
          signedIn
          onSignOut={async () => {}}
          onSignedOut={vi.fn()}
        />
      </div>
    );
    openMenu();
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("toggles closed when the profile button is clicked again", async () => {
    renderHeader({ signedIn: true });
    openMenu();
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });
});
