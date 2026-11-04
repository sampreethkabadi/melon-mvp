"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export function NavLinks({ nav }: { nav: NavItem[] }) {
  const path = usePathname();
  const active = [...nav]
    .filter((n) => !n.soon && (path === n.href || path.startsWith(`${n.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-4 text-sm font-semibold">
      {nav.map((item) =>
        item.soon ? (
          <span key={item.href} className="cursor-not-allowed text-muted/60" title="Coming in a later build step">
            {item.label}
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active === item.href ? "page" : undefined}
            className={
              active === item.href
                ? "border-b-2 pb-1 text-ink"
                : "border-b-2 border-transparent pb-1 text-muted hover:text-ink"
            }
            style={active === item.href ? { borderColor: "var(--school)" } : undefined}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
