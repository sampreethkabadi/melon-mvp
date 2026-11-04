import Link from "next/link";
import type { ReactNode } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { RewardStatus } from "@/lib/progress";

// Building blocks that match the Melon Student Demo: pills, panels, step and resource cards, the swag strip.

const PILL = {
  plain: "bg-soft text-ink-2",
  firm: "bg-firm-bg text-firm",
  new: "bg-new-bg font-extrabold text-new-ink",
  ok: "bg-done-bg text-done-ink",
  warn: "bg-warn-bg text-warn-ink",
  dark: "bg-ink text-white",
  lime: "bg-lime text-ink",
};

export function Pill({ tone = "plain", children }: { tone?: keyof typeof PILL; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PILL[tone]}`}>{children}</span>;
}

export function Panel({ hero, className = "", children }: { hero?: boolean; className?: string; children: ReactNode }) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-3.5 rounded-[22px] bg-white/95 p-5 sm:p-[22px] ${hero ? "border-2 shadow-[0_14px_40px_rgba(20,33,27,.10)]" : "border border-line"} ${className}`}
      style={hero ? { borderColor: "var(--school)" } : undefined}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ school, children }: { school?: boolean; children: ReactNode }) {
  return (
    <span className={`text-xs font-extrabold uppercase tracking-[.08em] ${school ? "" : "text-muted"}`} style={school ? { color: "var(--school)" } : undefined}>
      {children}
    </span>
  );
}

export function Bar({ pct, color = "var(--color-done)", track = "var(--color-line)" }: { pct: number; color?: string; track?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded" style={{ background: track }}>
      <i className="block h-full rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

/** The dark strip that keeps the next reward in view. */
export function SwagStrip({ reward, label = "Next swag" }: { reward: RewardStatus | null; label?: string }) {
  if (!reward) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-ink px-4 py-3.5 text-white">
      <b className="text-sm">
        {label}: {reward.name} · {reward.have} of {reward.need}
      </b>
      <div className="min-w-[120px] flex-1">
        <Bar pct={(reward.have / reward.need) * 100} color="var(--color-lime)" track="rgba(255,255,255,.2)" />
      </div>
      <Link href="/student/rewards" className="rounded-full border border-white/50 px-4 py-1.5 text-sm font-bold">
        See rewards
      </Link>
    </div>
  );
}

/** A small resource card. `kicker` is the label on top ("Start here", "Event · Sep 17"). */
export function ResCard({
  kicker,
  title,
  provider,
  url,
  blurb,
  isNew,
  action,
}: {
  kicker: string;
  title: string;
  provider: string | null;
  url: string | null;
  blurb?: string | null;
  isNew?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl p-3 ${isNew ? "bg-[#F3F1FF]" : "bg-[#F3F8FB]"}`}>
      <span className={`text-[11px] font-bold uppercase tracking-wider ${isNew ? "text-new-ink" : "text-link"}`}>{kicker}</span>
      <b className="text-sm leading-snug">{title}</b>
      {blurb && <span className="text-xs text-muted">{blurb}</span>}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-link">
          {provider ?? "Open"} ↗
        </a>
      ) : (
        provider && <span className="text-xs font-semibold text-ink-2">{provider}</span>
      )}
      {action && <div className="mt-auto pt-1">{action}</div>}
    </div>
  );
}

export function AddButton({ action, label = "Add to my roadmap" }: { action: () => Promise<void>; label?: string }) {
  return (
    <form action={action}>
      <SubmitButton label={label} variant="link" />
    </form>
  );
}
