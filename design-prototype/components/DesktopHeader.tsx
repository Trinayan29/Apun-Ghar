"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/store/AppStore";
import Icon from "./Icon";

const LINKS = [
  { href: "/search", label: "Search" },
  { href: "/saved", label: "Saved" },
  { href: "/visits", label: "Visits" },
] as const;

/** Top navigation — desktop and tablet only (mobile uses BottomNav). */
export default function DesktopHeader() {
  const path = usePathname();
  const { userName, savedIds } = useApp();
  return (
    <header className="sticky top-0 z-30 hidden border-b border-line bg-white/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-8 px-8">
        <Link href="/home" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
            <Icon name="home" size={20} />
          </span>
          <span className="text-[18px] font-bold tracking-tight">Apun-Ghar</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-4 py-2 text-[14.5px] font-semibold transition ${
                path.startsWith(l.href) ? "bg-brand-50 text-brand-800" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
              {l.href === "/saved" && savedIds.length > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-700 px-1.5 text-[11.5px] font-bold text-white">
                  {savedIds.length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <Link href="/profile" className="ml-auto flex items-center gap-2.5">
          <span className="hidden text-right xl:block">
            <span className="block text-[13.5px] font-bold leading-tight">{userName}</span>
            <span className="block text-[12px] text-muted">View profile</span>
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-[15px] font-bold text-white">
            {userName.charAt(0).toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
