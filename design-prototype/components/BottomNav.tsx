"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

const TABS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/saved", label: "Saved", icon: "heart" },
  { href: "/visits", label: "Visits", icon: "calendar" },
  { href: "/profile", label: "Profile", icon: "user" },
] as const;

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map((t) => {
          const active = path === t.href || (t.href === "/home" && path === "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition active:scale-95 ${
                active ? "text-brand-700" : "text-muted"
              }`}
            >
              <Icon name={t.icon} size={23} filled={active && t.icon === "heart"} />
              {t.label}
              {active && <span className="h-1 w-1 rounded-full bg-brand-600" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
