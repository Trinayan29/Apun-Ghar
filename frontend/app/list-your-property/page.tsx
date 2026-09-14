"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand";

/**
 * Owner introduction / marketing entry page (production).
 *
 * Entry only: links to the real owner signup/login. Grants nothing by
 * itself — no OWNER role, no listing, no writes. Copy makes no claims
 * about verification, listing counts, renters, or revenue.
 */
export default function ListYourPropertyPage() {
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
            Own a property? List it on Apun-Ghar.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted lg:text-[16px]">
            Create an owner account to get ready for listing. We&apos;re
            building a simple way to reach students and young professionals
            looking for a place near their college or workplace.
          </p>

          <div className="mt-8 max-w-md">
            <Link
              href="/owner/signup"
              className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-brand-600 px-5 text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Create an owner account
            </Link>
            <p className="mt-4 text-center text-[14px] text-muted lg:text-left">
              Already an owner?{" "}
              <Link
                href="/owner/login"
                className="font-bold text-brand-700 underline underline-offset-2"
              >
                Sign in to Owner Studio
              </Link>
            </p>
            <p className="mt-2 text-center text-[14px] text-muted lg:text-left">
              Looking for a place to rent?{" "}
              <Link
                href="/signup"
                className="font-bold text-brand-700 underline underline-offset-2"
              >
                Create a renter account
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
                title: "A clear process",
                body: "Photos, rent, rooms, and availability — guided step by step once listing opens.",
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
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            Listing tools aren&apos;t live yet — your owner account reserves
            your place for when they open.
          </p>
        </section>
      </div>
    </main>
  );
}
