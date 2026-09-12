import Link from "next/link";
import Icon from "@/components/Icon";
import { PropImage } from "@/components/ui";

export default function Welcome() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper text-ink">
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 pb-8 pt-14 lg:grid-cols-2 lg:items-center lg:px-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Icon name="home" size={22} />
            </span>
            <span className="text-[19px] font-bold tracking-tight">Apun-Ghar</span>
          </div>

          <h1 className="mt-10 text-[34px] font-bold leading-[1.15] tracking-tight lg:mt-8 lg:text-[46px]">
            Find a place that feels right.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted lg:text-[16.5px]">
            PGs, rooms and homes near your college or workplace — with honest prices and verified listings.
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
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-3 lg:rounded-3xl">
          <PropImage
            src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=60"
            alt="A warm, lived-in rental room"
            className="aspect-[16/10] w-full rounded-xl lg:aspect-[4/3]"
          />
          <div className="flex items-center gap-2.5 px-1.5 pb-1 pt-3">
            <Icon name="shield" size={19} className="shrink-0 text-brand-700" />
            <p className="text-[13.5px] font-semibold text-ink">
              Verified places. Clear prices. Better decisions.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
