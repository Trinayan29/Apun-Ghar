"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, getMe, type AppUser } from "@/lib/api";
import { FormError } from "@/components/auth-ui";
import {
  MailIcon,
  OwnerBottomNav,
  OwnerDesktopHeader,
  OwnerInfoRow,
  OwnerSectionLabel,
  PhoneIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/owner-ui";

export default function OwnerAccountPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading, signOut } = useAuth();
  const [me, setMe] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const u = await getMe();
      if (u.role !== "OWNER") {
        router.replace("/");
        return;
      }
      setMe(u);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load your account."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Owner guard: unauthenticated → /owner/login; USER/ADMIN → renter home.
  // Never touches renter UserProfile endpoints.
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/owner/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = await getMe();
        if (cancelled) return;
        if (u.role !== "OWNER") {
          router.replace("/");
          return;
        }
        setMe(u);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isUnauthorized) {
          router.replace("/owner/login");
          return;
        }
        setLoading(false);
        setLoadError(
          err instanceof ApiError ? err.message : "Couldn't load your account."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
    router.replace("/owner/login");
  };

  if (authLoading || loading) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <p className="text-[14px] text-muted" role="status">
          Loading…
        </p>
      </main>
    );
  }

  if (loadError || !me) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <FormError message={loadError || "Couldn't load your account."} />
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold"
        >
          Retry
        </button>
      </main>
    );
  }

  const name = me.display_name ?? "Not provided";
  const emailValue = me.email ?? firebaseUser?.email ?? "Not provided";
  const phoneValue = me.phone_number ?? "Not provided";

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <OwnerDesktopHeader name={me.display_name ?? me.email ?? "Owner"} />

      <div className="bg-brand-800 text-white">
        <div className="mx-auto w-full max-w-3xl px-5 pb-6 pt-8">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-[24px] font-bold"
            >
              {(me.display_name ?? me.email ?? "O").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-bold">{name}</h1>
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white/90">
                Owner account
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-2.5 px-5 py-5">
        <OwnerSectionLabel>Profile</OwnerSectionLabel>
        <OwnerInfoRow label="Full name" value={name} icon={<UserIcon />} />
        <OwnerInfoRow label="Email" value={emailValue} icon={<MailIcon />} />
        <OwnerInfoRow label="Phone" value={phoneValue} icon={<PhoneIcon />} />
        <OwnerInfoRow
          label="Account type"
          value="Property owner"
          icon={<ShieldIcon />}
        />

        <div className="space-y-2.5 pt-3">
          <Link
            href="/owner/dashboard"
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-brand-600 px-5 text-[16px] font-bold text-white transition active:scale-[0.98]"
          >
            Back to Owner Studio
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-line bg-white px-5 text-[15.5px] font-semibold text-red-600 transition active:scale-[0.99] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      <OwnerBottomNav />
    </main>
  );
}
