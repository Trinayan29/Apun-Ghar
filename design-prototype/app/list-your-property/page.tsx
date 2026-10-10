import Link from "next/link";
import Icon from "@/components/Icon";
import { OwnerBrand } from "@/components/owner-ui";

const BENEFITS = [
  {
    icon: "pin",
    title: "The right tenants find you",
    body: "Your place is shown to people already looking nearby — by budget, college, or workplace. No printing flyers, no broker chain.",
  },
  {
    icon: "chat",
    title: "Enquiries in one place",
    body: "Questions, visit requests, and follow-ups land in your Owner Studio instead of scattered phone calls.",
  },
  {
    icon: "shield",
    title: "Clear terms from day one",
    body: "State your rent, rules, and availability plainly so every conversation starts honest.",
  },
] as const;

const STEPS = [
  { n: "1", title: "Create your owner account", body: "Name, email, and phone — under a minute." },
  { n: "2", title: "Add your first property", body: "Photos, rent, and house rules. Property tools are opening up next." },
  { n: "3", title: "Respond to enquiries", body: "Confirm visits and answer questions from interested tenants." },
];

export default function ListYourProperty() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-10 pt-8 lg:px-10 lg:pt-12">
        <OwnerBrand />

        <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-2 lg:items-start lg:gap-14">
          {/* Hero */}
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-widest text-brand-700">
              For property owners
            </p>
            <h1 className="mt-2 text-[32px] font-bold leading-[1.15] tracking-tight lg:text-[42px]">
              Your rooms, seen by people already looking.
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted lg:text-[16px]">
              List your PG, hostel room, or flat on Apun-Ghar and hear directly from students and
              young professionals searching near your area.
            </p>

            <div className="mt-7 max-w-md space-y-3">
              <Link
                href="/owner/signup"
                className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 text-[16px] font-bold text-white transition active:scale-[0.98]"
              >
                List your property
              </Link>
              <p className="text-center text-[14px] text-muted lg:text-left">
                Already listed with us?{" "}
                <Link
                  href="/owner/login"
                  className="font-bold text-brand-700 underline underline-offset-2"
                >
                  Owner sign-in
                </Link>
              </p>
            </div>

            {/* How it works */}
            <ol className="mt-8 max-w-md space-y-3">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-3.5 rounded-2xl border border-line bg-white p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[15px] font-bold text-white">
                    {s.n}
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-bold">{s.title}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted">
                      {s.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Benefits */}
          <section
            aria-label="Why list on Apun-Ghar"
            className="overflow-hidden rounded-2xl border border-line bg-brand-800 p-6 text-white lg:rounded-3xl lg:p-8"
          >
            <p className="text-[12.5px] font-bold uppercase tracking-widest text-white/60">
              Why Apun-Ghar
            </p>
            <ul className="mt-4 space-y-3.5">
              {BENEFITS.map((b) => (
                <li key={b.title} className="rounded-2xl bg-white/10 px-4 py-4">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <Icon name={b.icon} size={18} className="text-white/85" />
                    {b.title}
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-white/75">{b.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-2xl bg-white/10 px-4 py-4 lg:hidden">
              <p className="text-[14px] font-bold">Ready when you are</p>
              <Link
                href="/owner/signup"
                className="mt-2.5 flex min-h-[48px] items-center justify-center rounded-xl bg-white text-[15px] font-bold text-brand-800 transition active:scale-[0.98]"
              >
                Get started
              </Link>
            </div>
          </section>
        </div>

        {/* Renter alternative */}
        <section
          aria-label="Looking for a place instead"
          className="mx-auto mt-10 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-line bg-white px-5 py-5 text-center lg:mx-0 lg:max-w-none lg:flex-row lg:justify-between lg:text-left"
        >
          <div>
            <p className="text-[14.5px] font-bold">Looking for a place to stay?</p>
            <p className="mt-0.5 text-[13.5px] text-muted">
              This page is for owners. Renters start here instead.
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-line px-5 text-[14px] font-bold text-brand-700 transition active:scale-[0.98]"
          >
            Find a place →
          </Link>
        </section>
      </div>
    </main>
  );
}
