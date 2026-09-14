"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, getMe, type AppUser } from "@/lib/api";
import { FormError } from "@/components/auth-ui";
import {
  BuildingIcon,
  CalendarIcon,
  ComingSoonPill,
  InboxIcon,
  OwnerBottomNav,
  OwnerDesktopHeader,
  OwnerEmptyState,
  OwnerIdentityBand,
  OwnerSectionLabel,
} from "@/components/owner-ui";

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [me, setMe] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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

  // Owner guard: unauthenticated → /owner/login; USER/ADMIN → renter home
  // (never the owner studio); 401 → /owner/login.
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
        <Link
          href="/owner/login"
          className="mt-2 block h-12 w-full rounded-xl bg-white py-3 text-center text-[15px] font-semibold text-brand-700 underline"
        >
          Go to owner sign-in
        </Link>
      </main>
    );
  }

  const name = me.display_name ?? me.email ?? "Owner";

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <OwnerDesktopHeader name={name} />
      <OwnerIdentityBand name={name} accountHref="/owner/account" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-5 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <OwnerSectionLabel>Getting started</OwnerSectionLabel>
            <section
              aria-label="Welcome"
              className="mt-2.5 rounded-2xl border border-line bg-white p-5"
            >
              <h2 className="text-[16px] font-bold tracking-tight">
                Your owner account is ready.
              </h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                This is your Owner Studio. Property listing tools are still
                being built — once they launch, you&apos;ll add photos, set
                rent, and publish your first listing from here.
              </p>
            </section>

            <div className="mt-6">
              <OwnerSectionLabel>Enquiries & visits</OwnerSectionLabel>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <section
                  aria-label="Enquiries"
                  className="rounded-2xl border border-line bg-white p-4"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
                  >
                    <InboxIcon />
                  </span>
                  <p className="mt-2 text-[14px] font-bold">Enquiries</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    Tenant messages about your properties will appear here.
                  </p>
                  <p className="mt-2">
                    <ComingSoonPill />
                  </p>
                </section>
                <section
                  aria-label="Visits"
                  className="rounded-2xl border border-line bg-white p-4"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
                  >
                    <CalendarIcon />
                  </span>
                  <p className="mt-2 text-[14px] font-bold">Visits</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                    Confirmed property visits will appear here with date and
                    time.
                  </p>
                  <p className="mt-2">
                    <ComingSoonPill />
                  </p>
                </section>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <OwnerSectionLabel>Your properties</OwnerSectionLabel>
              <div className="mt-2.5">
                <OwnerEmptyState
                  title="No properties yet"
                  body="Your property management tools are coming soon. Once live, add photos, rent, and availability here."
                  icon={<BuildingIcon />}
                  action={
                    <span className="flex min-h-[48px] cursor-not-allowed items-center justify-center rounded-xl bg-paper px-5 text-[15px] font-bold text-muted">
                      Add property · <ComingSoonPill />
                    </span>
                  }
                />
              </div>
            </div>

            <div>
              <OwnerSectionLabel>What you&apos;ll manage here</OwnerSectionLabel>
              <section
                aria-label="What you'll manage here"
                className="mt-2.5 rounded-2xl border border-line bg-white p-5"
              >
                <ul className="space-y-2 text-[13.5px] leading-relaxed text-muted">
                  {[
                    "Listing details — photos, rent, rooms, and house rules",
                    "Availability — pause or unpublish a property anytime",
                    "Enquiries and visits per property",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span aria-hidden className="mt-0.5 text-brand-600">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>

      <OwnerBottomNav />
    </main>
  );
}
