import Link from "next/link";
import { Backdrop, INTEREST_COLORS } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addResource, removeStep } from "../actions";

export const metadata = { title: "Resources · Melon" };

type Resource = {
  id: string;
  type: string;
  title: string;
  provider: string | null;
  url: string | null;
  interests: string[];
  source: string;
  is_free: boolean;
  starts_at: string | null;
};
type Step = { id: string; resource_id: string | null; title: string; source: string; status: string };

const TYPES = [
  { id: "all", label: "All" },
  { id: "skill", label: "Skills" },
  { id: "certification", label: "Certifications" },
  { id: "event", label: "Events" },
  { id: "course", label: "Courses" },
  { id: "coaching", label: "Coaching" },
];
const TYPE_LABEL: Record<string, string> = { skill: "Skill", certification: "Certification", event: "Event", course: "Course", coaching: "Coaching" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ type?: string; scope?: string }> }) {
  const { type = "all", scope } = await searchParams;
  const everything = scope === "all";
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: roadmap }, { data: stepRows }] = await Promise.all([
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase.from("roadmaps").select("status").eq("student_id", profile.id).maybeSingle(),
    supabase.from("roadmap_items").select("id, resource_id, title, source, status").eq("student_id", profile.id),
  ]);
  const interests: string[] = sp?.interests ?? [];

  let q = supabase.from("resources").select("id, type, title, provider, url, interests, source, is_free, starts_at").order("source").order("title");
  if (TYPES.some((t) => t.id === type && t.id !== "all")) q = q.eq("type", type);
  if (!everything && interests.length) q = q.overlaps("interests", interests);
  const { data: resRows } = await q.limit(60);

  const resources = (resRows ?? []) as Resource[];
  const steps = (stepRows ?? []) as Step[];
  const canAdd = roadmap?.status === "published";
  const stepFor = (r: Resource) => steps.find((s) => s.resource_id === r.id) ?? steps.find((s) => s.title === r.title);
  const href = (t: string, s = scope) => `/student/resources?${new URLSearchParams({ ...(t !== "all" ? { type: t } : {}), ...(s ? { scope: s } : {}) })}`;
  const interestNames = interests.map((i) => INTEREST_COLORS[i]?.label ?? i).join(" and ");

  return (
    <main className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Resources</h1>
        <p className="mt-1 text-ink-2">
          Free skills, certifications and events your career center trusts.
          {canAdd ? " Add one and it goes straight onto your roadmap." : " You can add these to your roadmap once it's approved."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TYPES.map((t) => (
          <Link
            key={t.id}
            href={href(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${type === t.id ? "bg-ink text-white" : "border border-line bg-white hover:border-ink"}`}
          >
            {t.label}
          </Link>
        ))}
        {interests.length > 0 && (
          <Link href={href(type, everything ? undefined : "all")} className="ml-auto text-sm font-semibold text-link">
            {everything ? `Only show ${interestNames}` : "Show everything"}
          </Link>
        )}
      </div>

      {resources.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => {
            const step = stepFor(r);
            return (
              <div key={r.id} className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-4 ${r.source === "melon" ? "border-new/40 bg-new-bg/70" : "border-line bg-white/95"}`}>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.source === "melon" ? "bg-white text-new-ink" : "bg-soft text-ink-2"}`}>
                    {r.source === "melon" ? "Suggested by Melon" : r.source === "handshake" ? "From Handshake" : TYPE_LABEL[r.type] ?? r.type}
                  </span>
                  {r.source !== "library" && <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2">{TYPE_LABEL[r.type] ?? r.type}</span>}
                  {r.is_free && <span className="rounded-full bg-done-bg px-2 py-0.5 text-[11px] font-bold text-done-ink">Free</span>}
                  {r.starts_at && <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2">{shortDate(r.starts_at)}</span>}
                </div>
                <b className="leading-snug">{r.title}</b>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-link">
                    {r.provider ?? "Open"} ↗
                  </a>
                ) : (
                  r.provider && <span className="text-sm text-muted">{r.provider}</span>
                )}
                <div className="mt-auto flex flex-wrap gap-1">
                  {r.interests.map((i) => (
                    <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-ink" style={{ background: INTEREST_COLORS[i]?.color ?? "#eee" }}>
                      {INTEREST_COLORS[i]?.label ?? i}
                    </span>
                  ))}
                </div>
                <div className="pt-1">
                  {step ? (
                    step.source === "student" && step.status !== "done" ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-done-ink">✓ On your roadmap</span>
                        <form action={removeStep.bind(null, step.id)}>
                          <SubmitButton label="Remove" variant="link" />
                        </form>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-done-ink">{step.status === "done" ? "✓ Done" : "✓ On your roadmap"}</span>
                    )
                  ) : canAdd ? (
                    <form action={addResource.bind(null, r.id)}>
                      <SubmitButton label="Add to my roadmap" variant="secondary" />
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-muted">
          Nothing here for that filter yet.{" "}
          {!everything && (
            <Link href={href(type, "all")} className="font-semibold text-link">
              Show everything
            </Link>
          )}
        </p>
      )}
    </main>
  );
}
