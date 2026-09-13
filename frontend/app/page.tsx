"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import { isOnboardingDone } from "@/lib/onboarding-storage";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading, signOut } = useAuth();
  const saved = searchParams.get("saved") === "1";
  const done = firebaseUser ? isOnboardingDone(firebaseUser.uid) : false;

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <p className="text-[14px] text-muted" role="status">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm px-6 pb-10 pt-10">
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-bold tracking-tight">Apun-Ghar</span>
        {firebaseUser ? (
          <button
            type="button"
            onClick={() => {
              void signOut().then(() => router.replace("/login"));
            }}
            className="text-[13.5px] font-bold text-brand-700 underline"
          >
            Sign out
          </button>
        ) : (
          <Link href="/login" className="text-[13.5px] font-bold text-brand-700 underline">
            Sign in
          </Link>
        )}
      </div>

      {/* Saved-preferences confirmation after onboarding. Deliberately does
          not imply a listings/search experience exists yet. */}
      {firebaseUser && done && saved && (
        <section
          aria-label="Preferences saved"
          className="mt-6 rounded-2xl border border-brand-600 bg-brand-50 px-4 py-4"
        >
          <h1 className="text-[17px] font-bold">Preferences saved ✓</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink/80">
            Thanks — we&apos;ve saved what you shared. There&apos;s no
            listings or search experience to browse yet; we&apos;ll use your
            preferences to show relevant places once it launches.
          </p>
          <Link
            href="/profile"
            className="mt-3 block h-11 w-full rounded-xl bg-brand-600 py-2.5 text-center text-[14.5px] font-bold text-white"
          >
            View your profile
          </Link>
        </section>
      )}

      {!firebaseUser && (
        <section className="mt-6">
          <h1 className="text-[24px] font-bold tracking-tight">
            Find a place that feels right.
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Apun-Ghar is getting started. Create an account, tell us your
            preferences, and we&apos;ll use them once places launch.
          </p>
          <div className="mt-5 space-y-3">
            <Link
              href="/signup"
              className="block h-12 w-full rounded-xl bg-brand-600 py-3 text-center text-[15.5px] font-bold text-white"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="block h-12 w-full rounded-xl border border-line bg-white py-3 text-center text-[15px] font-semibold"
            >
              Sign in
            </Link>
          </div>
        </section>
      )}

      {firebaseUser && !done && (
        <section className="mt-6 rounded-2xl border border-line bg-white px-4 py-4">
          <h1 className="text-[17px] font-bold">Finish setting up your preferences</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            It takes under a minute, and every step is optional. Your profile
            stays available either way.
          </p>
          <Link
            href="/onboarding"
            className="mt-3 block h-11 w-full rounded-xl bg-brand-600 py-2.5 text-center text-[14.5px] font-bold text-white"
          >
            Continue onboarding
          </Link>
          <Link
            href="/profile"
            className="mt-2 block h-11 w-full rounded-xl border border-line bg-white py-2.5 text-center text-[14.5px] font-semibold"
          >
            Go to profile instead
          </Link>
        </section>
      )}

      {firebaseUser && done && !saved && (
        <section className="mt-6">
          <h1 className="text-[24px] font-bold tracking-tight">Welcome back.</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Your preferences are saved. There&apos;s no listings or search
            experience to browse yet — we&apos;ll show relevant places here
            once it launches.
          </p>
          <Link
            href="/profile"
            className="mt-5 block h-12 w-full rounded-xl bg-brand-600 py-3 text-center text-[15.5px] font-bold text-white"
          >
            View your profile
          </Link>
        </section>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
