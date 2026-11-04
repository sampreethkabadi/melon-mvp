import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import type { NavItem } from "@/lib/nav";
import type { Profile } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";

export function TopBar({ profile, nav }: { profile: Profile; nav: NavItem[] }) {
  const school = profile.schools;
  const initials = profile.full_name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={30} />
          {school && (
            <span className="hidden items-center gap-2 border-l border-line pl-3 text-sm font-semibold text-muted sm:inline-flex">
              <span
                className="inline-flex size-7 items-center justify-center rounded-lg text-[11px] font-extrabold text-white"
                style={{ background: "var(--school)" }}
              >
                {school.short_mark}
              </span>
              {school.name}
            </span>
          )}
        </Link>
        <NavLinks nav={nav} />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-right sm:flex sm:flex-col">
            <b className="text-sm">{profile.full_name}</b>
            <span className="text-xs text-muted">{profile.title || ROLE_LABEL[profile.role]}</span>
          </span>
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
            {initials}
          </span>
          <form action="/auth/signout" method="post">
            <button className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:border-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
