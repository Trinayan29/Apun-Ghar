"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand";

/**
 * Owner introduction / marketing entry page ONLY (Slice 3B-4).
 *
 * This page grants nothing: no OWNER role, no listing, no database
 * writes, no onboarding, no verification. The primary CTA reveals an
 * honest "coming soon" state instead of a fake owner flow.
 */
export default function ListYourPropertyPage() {
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 pb-10 pt-8 lg:grid-cols-2 lg:items-center lg:px-10 lg:pt-14">
        <div>
          <Link href="/" aria-label="Apun-Ghar home">
            <BrandMark />
          </Link>

          <p className="mt-10 text-[13px] font-bold uppercase tracking-widest text-brand-700 lg:mt-8">
            For property owners
          </p>
          <h1 className="mt-2 text-[32px] font-bold leading-[1.15] tracking-tight lg:text-[42px]">
            List your room, PG, hostel or flat on Apun-Ghar.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted lg:text-[16px]">
            We&apos;re building the simplest way to reach students and young
            professionals looking for a place near their college or workplace.
          </p>

          <div className="mt-8 max-w-md">
            {!showComingSoon ? (
              <button
                type="button"
                onClick={() => setShowComingSoon(true)}
                className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
              >
                Get started
              </button>
            ) : (
              <div
                role="status"
                className="rounded-2xl border border-brand-600 bg-brand-50 px-4 py-4"
              >
                <p className="text-[15px] font-bold text-brand-700">
                  Owner listing setup is coming soon.
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink/80">
                  There&apos;s no listing flow to complete yet — we&apos;ll
                  open owner onboarding here once it&apos;s ready. Nothing has
                  been created and your account role is unchanged.
                </p>
              </div>
            )}
            <p className="mt-4 text-center text-[14px] text-muted lg:text-left">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-brand-700 underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <section
          aria-label="What we're building for owners"
          className="overflow-hidden rounded-2xl border border-line bg-white p-6 lg:rounded-3xl lg:p-8"
        >
          <p className="text-[13px] font-bold uppercase tracking-widest text-muted">
            What we&apos;re building
          </p>
          <ul className="mt-4 space-y-4">
            {[
              {
                title: "The right tenants",
                body: "Your place shown to people already looking near it — by budget, college, or workplace.",
              },
              {
                title: "Pricing you control",
                body: "Set a clear monthly rent. What you list is what tenants discuss.",
              },
              {
                title: "Trust from day one",
                body: "Verified-owner checks and honest listing standards, before you go live.",
              },
            ].map((item) => (
              <li key={item.title} className="rounded-xl bg-paper px-4 py-3.5">
                <p className="text-[15px] font-bold">{item.title}</p>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
