"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { homeDestination } from "@/lib/auth-redirect";

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 19.5c1.2-3.2 3.9-5 7-5s5.8 1.8 7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface SiteHeaderProps {
  /** Firebase auth is still initializing. */
  loading: boolean;
  /** A Firebase user is signed in. Role is intentionally not resolved. */
  signedIn: boolean;
  /** Signed-in user finished onboarding; affects the brand link target. */
  onboardingDone?: boolean;
  /** Performs sign-out. Must reject on failure. */
  onSignOut: () => Promise<void>;
  /** Called only after sign-out succeeds (e.g. navigate to /login). */
  onSignedOut: () => void;
  /** Extra actions rendered before the account slot (e.g. Back to browse). */
  children?: ReactNode;
}

/**
 * Shared public header: brand on the left, an auth-aware account slot on
 * the right. While auth initializes it renders a neutral, non-interactive
 * placeholder so signed-in users never see a flash of signed-out actions.
 *
 * Signed-in users get a profile button opening an account menu (My Profile
 * + Sign out) instead of a standalone sign-out button. Sign-out failures
 * stay visible inline; the user keeps their signed-in state and is only
 * redirected after sign-out succeeds.
 */
export default function SiteHeader({
  loading,
  signedIn,
  onboardingDone = false,
  onSignOut,
  onSignedOut,
  children,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Close on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (menuOpen) itemRefs.current[0]?.focus();
  }, [menuOpen]);

  const closeMenu = (refocusButton = false) => {
    setMenuOpen(false);
    if (refocusButton) buttonRef.current?.focus();
  };

  const focusItem = (index: number) => {
    const items = itemRefs.current;
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const current = itemRefs.current.findIndex(
        (item) => item === document.activeElement
      );
      focusItem(current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const current = itemRefs.current.findIndex(
        (item) => item === document.activeElement
      );
      focusItem(current - 1);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await onSignOut();
      setMenuOpen(false);
      onSignedOut();
    } catch {
      setSignOutError("Couldn't sign you out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <Link
        href={homeDestination({ signedIn, onboardingDone })}
        aria-label="Apun-Ghar home"
      >
        <BrandMark />
      </Link>
      <div className="flex items-center gap-3">
        {children}
        {loading ? (
          <span aria-hidden="true" className="inline-block h-6 w-24" />
        ) : signedIn ? (
          <div className="relative" ref={menuRef}>
            <button
              ref={buttonRef}
              type="button"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <ProfileIcon />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="Account"
                onKeyDown={onMenuKeyDown}
                className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-lg"
              >
                <Link
                  ref={(node) => {
                    itemRefs.current[0] = node;
                  }}
                  role="menuitem"
                  href="/profile"
                  onClick={() => closeMenu()}
                  className="block px-4 py-2.5 text-left text-[14px] font-semibold text-ink hover:bg-paper focus-visible:bg-paper focus-visible:outline-none"
                >
                  My Profile
                </Link>
                <button
                  ref={(node) => {
                    itemRefs.current[1] = node;
                  }}
                  role="menuitem"
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="block w-full px-4 py-2.5 text-left text-[14px] font-semibold text-ink hover:bg-paper focus-visible:bg-paper focus-visible:outline-none disabled:opacity-60"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
                {signOutError && (
                  <p role="alert" className="px-4 py-2 text-[12px] text-red-700">
                    {signOutError}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/signup"
            className="text-[14px] font-bold text-brand-700 underline underline-offset-2"
          >
            Create a renter account
          </Link>
        )}
      </div>
    </div>
  );
}
