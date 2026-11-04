import { redirect } from "next/navigation";
import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { firstName, requireRole } from "@/lib/auth";
import { longDate, plural, shortDate, shortTerm, timeOf } from "@/lib/format";
import { getProgress, rewardProgress, type RewardRow } from "@/lib/progress";
import { KIND_LABEL, planGroups, type PlanItem } from "@/lib/roadmap/plan";
import { createClient } from "@/lib/supabase/server";
import { ConsentCard } from "./ConsentCard";
import { ROLE_LABEL, YEAR_LABEL, type ClassYear, type Role } from "@/lib/types";

export const metadata = { title: "Home · Melon" };

export default async function StudentHome() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: team }, { data: roadmap }, { data: itemRows }, { data: appt }, { data: rewardRows }, { data: summaryRows }, progress] =
    await Promise.all([
      supabase.from("student_profiles").select("class_year, majors, interests, onboarding_step").eq("user_id", profile.id).single(),
      supabase
        .from("staff_assignments")
        .select("kind, staff:profiles!staff_assignments_staff_id_fkey(full_name, role)")
        .eq("student_id", profile.id)
        .eq("active", true),
      supabase.from("roadmaps").select("status").eq("student_id", profile.id).maybeSingle(),
      supabase
        .from("roadmap_items")
        .select("id, title, description, term, kind, status, path_id, due_date, firm, sort, completed_at")
        .eq("student_id", profile.id),
      supabase
        .from("appointments")
        .select("starts_at, type, staff:profiles!appointments_staff_id_fkey(full_name)")
        .eq("student_id", profile.id)
        .eq("status", "scheduled")
        .gte("starts_at", new Date(Date.now() - 3600_000).toISOString())
        .order("starts_at")
        .limit(1)
        .maybeSingle(),
      supabase.from("rewards").select("id, name, description, rule, sort").eq("active", true).order("sort"),
      supabase
        .from("insights")
        .select("payload")
        .eq("student_id", profile.id)
        .eq("kind", "summary")
        .in("status", ["accepted", "edited"])
        .order("created_at", { ascending: false })
        .limit(1),
      getProgress(supabase, profile.id),
    ]);
  if (sp && sp.onboarding_step !== "done") redirect("/student/onboarding");

  const year = sp?.class_year ? YEAR_LABEL[sp.class_year as ClassYear] : null;
  const major = sp?.majors?.[0];
  const staff = (team ?? []) as unknown as Array<{ kind: string; staff: { full_name: string; role: Role } | null }>;
  const published = roadmap?.status === "published";
  const { focus, moreCount } = planGroups((itemRows ?? []) as PlanItem[], progress.sem);
  const next = published ? focus[0] : undefined;
  const nextAppt = appt as unknown as { starts_at: string; type: string; staff: { full_name: string } | null } | null;
  const closest = ((rewardRows ?? []) as RewardRow[])
    .map((r) => rewardProgress(r, progress))
    .filter((r) => !r.unlocked)
    .sort((a, b) => b.have / b.need - a.have / a.need)[0];
  const latestSummary = (summaryRows?.[0]?.payload as { text?: string } | undefined)?.text;
  const p = progress;
  const term = shortTerm(p.sem.term);
  const up = p.showedUp - p.showedUpLastTerm;

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          {[year, major, `week ${p.sem.week} of ${p.sem.weeks}`].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hi {firstName(profile.full_name)}, here&apos;s your {term} so far.</h1>
      </div>

      <ConsentCard studentId={profile.id} />

      {/* Wrapped-style recap. Only compares you with you. */}
      <section aria-label={`Your ${term} so far`} className="grid gap-3 lg:grid-cols-4">
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-ink p-6 text-white lg:col-span-2 lg:row-span-2">
          <p className="text-xs font-extrabold uppercase tracking-widest text-lime">You showed up</p>
          <div>
            <p className="font-brand text-7xl leading-none sm:text-8xl">{p.showedUp}</p>
            <p className="mt-2 text-lg font-bold">
              {p.showedUp === 0
                ? "times so far. Your first step this week starts the count."
                : `time${p.showedUp === 1 ? "" : "s"} this semester: sessions, events and steps you finished.`}
            </p>
          </div>
          <p className="text-sm text-white/75">
            {p.showedUpLastTerm > 0
              ? up > 0
                ? `That's ${up} more than all of last semester.`
                : up === 0
                  ? "Level with all of last semester, and the semester isn't over."
                  : `${p.showedUpLastTerm - p.showedUp} more and you match all of last semester.`
              : "Every one counts toward your rewards."}
          </p>
        </div>

        <Tile label="Time invested" value={p.hours ? `About ${p.hours} hr` : "Just starting"} note="From sessions and steps you finished" />
        <Tile
          label="Streak"
          value={p.streakWeeks ? plural(p.streakWeeks, "week") : "Start one"}
          note={
            <span className="mt-1 flex gap-1" aria-hidden="true">
              {p.weeks.map((on, i) => (
                <span key={i} className="h-2 flex-1 rounded-sm" style={{ background: on ? "var(--school)" : "var(--color-line)" }} />
              ))}
            </span>
          }
        />
        <Tile
          label="Skills growing"
          value={p.skills.length ? p.skills[0] : "Coming soon"}
          note={p.skills.length > 1 ? <span className="line-clamp-2">Also {p.skills.slice(1).join(", ")}</span> : "From your sessions and finished steps"}
        />
        <Tile
          label={p.moment ? "Big moment" : "In your corner"}
          value={p.moment ? p.moment.title : plural(p.people, "person", "people")}
          note={p.moment ? shortDate(p.moment.when) : "Your advisor and coach"}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="flex flex-col gap-2 rounded-3xl border-2 bg-white/95 p-6 shadow-sm md:col-span-2" style={{ borderColor: "var(--school)" }}>
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Up next</p>
          {next ? (
            <>
              <b className="text-xl font-extrabold">{next.title}</b>
              <p className="text-sm text-muted">
                {KIND_LABEL[next.kind] ?? next.kind}
                {next.due_date ? ` · ${next.firm ? "firm date" : "by"} ${shortDate(next.due_date)}` : ""}
                {moreCount + focus.length > 1 ? ` · ${focus.length + moreCount - 1} more this semester` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/student/tasks" className="rounded-full bg-ink px-5 py-2.5 font-extrabold text-white">
                  See my action items
                </Link>
                <Link href="/student/roadmap" className="rounded-full border border-line bg-white px-5 py-2.5 font-semibold hover:border-ink">
                  Open my roadmap
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-ink-2">{roadmapMessage(roadmap?.status, staff.length > 0)}</p>
              {published && (
                <Link href="/student/roadmap" className="mt-2 self-start rounded-full bg-ink px-5 py-2.5 font-extrabold text-white">
                  Open my roadmap
                </Link>
              )}
            </>
          )}
          {latestSummary && (
            <div className="mt-3 rounded-2xl bg-soft px-4 py-3">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">From your latest session</p>
              <p className="mt-1 text-sm text-ink-2">{latestSummary}</p>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {nextAppt && (
            <section className="rounded-3xl border border-line bg-white/95 p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Next session</p>
              <b className="mt-1 block">
                {longDate(nextAppt.starts_at)} · {timeOf(nextAppt.starts_at)}
              </b>
              <p className="text-sm text-muted">
                {nextAppt.type} with {nextAppt.staff?.full_name ?? "your advisor"}
              </p>
            </section>
          )}
          {closest && (
            <Link href="/student/rewards" className="rounded-3xl border border-line bg-white/95 p-5 hover:border-ink">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Closest reward</p>
              <b className="mt-1 block">{closest.name}</b>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft">
                <div className="h-full rounded-full" style={{ width: `${Math.round((closest.have / closest.need) * 100)}%`, background: "var(--school)" }} />
              </div>
              <p className="mt-1 text-xs text-muted">{closest.need - closest.have} to go · {closest.description}</p>
            </Link>
          )}
          <section className="rounded-3xl border border-line bg-white/95 p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Your team</p>
            {staff.length ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {staff.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <b>{s.staff?.full_name}</b>
                    <span className="text-muted">{s.staff ? ROLE_LABEL[s.staff.role] : s.kind}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No advisor or coach yet. The career center assigns one.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-3xl border border-line bg-white/95 p-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-muted">{label}</p>
      <b className="line-clamp-3 text-xl font-extrabold leading-tight sm:text-2xl" title={value}>
        {value}
      </b>
      <div className="text-xs text-muted">{note}</div>
    </div>
  );
}

function roadmapMessage(status: string | undefined, hasTeam: boolean) {
  if (status === "published") return "Everything on your roadmap is done for now. Your next session will add more.";
  if (status === "draft") {
    return hasTeam
      ? "We've drafted your first roadmap from your answers. Your advisor or coach checks every roadmap first, and it appears here once they approve it."
      : "We've drafted your first roadmap from your answers. It appears here once the career center assigns your advisor or coach and they approve it.";
  }
  return "Your advisor or coach will set up your roadmap with you.";
}
