"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/brand";
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

  // Authenticated states keep the existing onboarding/home flow. The
  // welcome marketing below is for first-time visitors only.
  if (firebaseUser) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 pb-10 pt-10">
        <div className="flex items-center justify-between">
          <BrandMark />
          <button
            type="button"
            onClick={() => {
              void signOut().then(() => router.replace("/login"));
            }}
            className="text-[13.5px] font-bold text-brand-700 underline"
          >
            Sign out
          </button>
        </div>

        {done && saved && (
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

        {!done && (
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

        {done && !saved && (
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

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 pb-10 pt-8 lg:grid-cols-2 lg:items-center lg:px-10 lg:pt-14">
        <div>
          <div className="flex items-center justify-between">
            <BrandMark />
            <Link
              href="/login"
              className="text-[14px] font-bold text-brand-700 underline underline-offset-2 lg:hidden"
            >
              Sign in
            </Link>
          </div>

          <h1 className="mt-10 text-[34px] font-bold leading-[1.15] tracking-tight lg:mt-8 lg:text-[46px]">
            Find a place that feels right.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted lg:text-[16.5px]">
            Verified places. Clear prices. Better decisions.
          </p>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
            Tell us your budget and where you study or work — we&apos;ll use
            it to show relevant PGs, rooms and homes once places launch.
          </p>

          <div className="mt-8 max-w-md">
            <Link
              href="/signup"
              className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Get started
            </Link>
            <p className="mt-4 text-center text-[14px] text-muted lg:text-left">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-brand-700 underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>

          <section
            aria-label="For property owners"
            className="mt-8 max-w-md rounded-2xl border border-line bg-white px-4 py-4"
          >
            <h2 className="text-[15px] font-bold">Own a property?</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              List your room, PG, hostel or flat on Apun-Ghar.
            </p>
            <Link
              href="/list-your-property"
              className="mt-2 inline-block text-[14px] font-bold text-brand-700 underline underline-offset-2"
            >
              List a property →
            </Link>
          </section>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-brand-800 p-6 text-white lg:rounded-3xl lg:p-8">
          <p className="text-[13px] font-bold uppercase tracking-widest text-white/60">
            Why Apun-Ghar
          </p>
          <ul className="mt-4 space-y-4">
            {[
              {
                title: "Verified places",
                body: "Listings from owners we can stand behind — no bait photos, no hidden catches.",
              },
              {
                title: "Clear prices",
                body: "The rent you see is the rent you discuss. No last-minute surprises.",
              },
              {
                title: "Better decisions",
                body: "Filter by what matters: budget, distance to college or work, move-in date.",
              },
            ].map((item) => (
              <li key={item.title} className="rounded-xl bg-white/10 px-4 py-3.5">
                <p className="text-[15px] font-bold">{item.title}</p>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/75">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
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
