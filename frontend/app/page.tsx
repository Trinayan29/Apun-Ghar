"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/brand";
import { isOnboardingDone } from "@/lib/onboarding-storage";

function HomeContent() {
  const router = useRouter();
  const { firebaseUser, loading, signOut } = useAuth();
  const done = firebaseUser ? isOnboardingDone(firebaseUser.uid) : false;

  // Completed, signed-in users belong in the marketplace, not on the
  // welcome-back screen. This also covers any stale link pointing at `/`.
  useEffect(() => {
    if (!loading && firebaseUser && done) router.replace("/listings");
  }, [loading, firebaseUser, done, router]);

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
            <Link
              href="/listings"
              className="mt-2 block text-center text-[14px] font-bold text-brand-700 underline underline-offset-2"
            >
              Browse published places
            </Link>
          </section>
        )}

        {done && (
          <p
            role="status"
            className="mt-10 text-[14px] text-muted"
          >
            Taking you to published places…
          </p>
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
            <Link
              href="/listings"
              className="mt-3 flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white text-[15.5px] font-bold transition active:scale-[0.98]"
            >
              Browse published places
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
  return <HomeContent />;
}
