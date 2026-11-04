import { redirect } from "next/navigation";
import Link from "next/link";
import { Backdrop, INTEREST_COLORS } from "@/components/Backdrop";
import { Bar, Eyebrow, Pill } from "@/components/student/ui";
import { firstName, requireRole } from "@/lib/auth";
import { longDate, shortDate, shortTerm, timeOf } from "@/lib/format";
import { rewardsFor } from "@/lib/progress";
import { currentSemester } from "@/lib/roadmap/semester";
import { focusSteps, KIND_LABEL, loadRoadmap } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { ConsentCard } from "./ConsentCard";
import { ROLE_LABEL, YEAR_LABEL, type Role } from "@/lib/types";

export const metadata = { title: "Home · Melon" };

export default async function StudentHome() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: team }, data, { data: appt }, { data: summaryRows }, rewards] = await Promise.all([
    supabase.from("student_profiles").select("onboarding_step").eq("user_id", profile.id).single(),
    supabase
      .from("staff_assignments")
      .select("kind, staff:profiles!staff_assignments_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .eq("active", true),
    loadRoadmap(supabase, profile.id),
    supabase
      .from("appointments")
      .select("starts_at, type, staff:profiles!appointments_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .eq("status", "scheduled")
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("insights")
      .select("payload")
      .eq("student_id", profile.id)
      .eq("kind", "summary")
      .in("status", ["accepted", "edited"])
      .order("created_at", { ascending: false })
      .limit(1),
    rewardsFor(supabase, profile.id),
  ]);
  if (sp && sp.onboarding_step !== "done") redirect("/student/onboarding");

  const { roadmap, year, majors, interests, pinned, steps } = data;
  const staff = (team ?? []) as unknown as Array<{ kind: string; staff: { full_name: string; role: Role } | null }>;
  const published = roadmap?.status === "published";
  const sem = currentSemester();
  const f = focusSteps(steps, sem);
  const next = published ? f.now[0] : undefined;
  const nextAppt = appt as unknown as { starts_at: string; type: string; staff: { full_name: string; role: Role } | null } | null;
  const latestSummary = (summaryRows?.[0]?.payload as { text?: string } | undefined)?.text;
  const p = rewards.progress;
  const unlocked = rewards.all.filter((r) => r.unlocked);
  const term = shortTerm(sem.term);
  const up = p.showedUp - p.showedUpLastTerm;
  const vibe = pinned[0]?.name ?? (interests[0] ? INTEREST_COLORS[interests[0]]?.label : null) ?? "Still exploring";
  const vibeSub = pinned[1]
    ? `with a side of ${pinned[1].name}`
    : interests[1] && INTEREST_COLORS[interests[1]] && INTEREST_COLORS[interests[1]].label !== vibe
      ? `with a rising twist of ${INTEREST_COLORS[interests[1]].label}`
      : pinned.length
        ? "Your pinned path"
        : "Pin a path when it clicks";

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <Eyebrow school>{[year && YEAR_LABEL[year], majors[0], `week ${sem.week} of ${sem.weeks}`].filter(Boolean).join(" · ")}</Eyebrow>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hi {firstName(profile.full_name)}, here&apos;s what matters this week.</h1>
      </div>

      <ConsentCard studentId={profile.id} />

      {/* The important things first. */}
      <div className="grid gap-4 md:grid-cols-3">
        <section className="flex flex-col gap-2 rounded-3xl border-2 bg-white/95 p-6 shadow-sm md:col-span-2" style={{ borderColor: "var(--school)" }}>
          <Eyebrow>Up next on your roadmap</Eyebrow>
          {next ? (
            <>
              <Link href={`/student/tasks/${next.id}`} className="text-xl font-extrabold hover:underline">
                {next.title}
              </Link>
              <p className="text-sm text-muted">
                {KIND_LABEL[next.kind] ?? next.kind}
                {next.due_date ? ` · ${next.firm ? "firm date" : "by"} ${shortDate(next.due_date)}` : ""}
                {f.now.length > 1 ? ` · ${f.now.length - 1} more this week, all doable` : ""}
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
              {(published || roadmap?.status === "awaiting_student") && (
                <Link href="/student/roadmap" className="mt-2 self-start rounded-full bg-ink px-5 py-2.5 font-extrabold text-white">
                  {published ? "Open my roadmap" : "Review and accept"}
                </Link>
              )}
            </>
          )}
          {latestSummary && (
            <div className="mt-3 rounded-2xl bg-soft px-4 py-3">
              <Eyebrow>From your latest session</Eyebrow>
              <p className="mt-1 text-sm text-ink-2">{latestSummary}</p>
              <Link href="/student/sessions" className="mt-1 inline-block text-sm font-semibold text-link">
                See the highlights
              </Link>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {nextAppt && (
            <section className="rounded-3xl border border-line bg-white/95 p-5">
              <Eyebrow>Next session</Eyebrow>
              <b className="mt-1 block">
                {longDate(nextAppt.starts_at)} · {timeOf(nextAppt.starts_at)}
              </b>
              <p className="text-sm text-muted">
                {nextAppt.type} with {nextAppt.staff?.full_name ?? "your team"}
              </p>
              {nextAppt.staff && (
                <span className="mt-2 inline-block">
                  <Pill tone={nextAppt.staff.role === "coach" ? "new" : "plain"}>{nextAppt.staff.role === "coach" ? "Career coach · career" : "Advisor · courses"}</Pill>
                </span>
              )}
            </section>
          )}
          {rewards.next && (
            <Link href="/student/rewards" className="rounded-3xl border border-line bg-white/95 p-5 hover:border-ink">
              <Eyebrow>Closest reward</Eyebrow>
              <b className="mt-1 block">{rewards.next.name}</b>
              <div className="mt-2">
                <Bar pct={(rewards.next.have / rewards.next.need) * 100} color="var(--school)" />
              </div>
              <p className="mt-1 text-xs text-muted">
                {rewards.next.need - rewards.next.have} to go · {rewards.next.description}
              </p>
            </Link>
          )}
          <section className="rounded-3xl border border-line bg-white/95 p-5">
            <Eyebrow>Your team</Eyebrow>
            {staff.length ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {staff.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <b>{s.staff?.full_name}</b>
                    <span className="text-muted">{s.staff ? (s.staff.role === "coach" ? "Career coach · careers" : `${ROLE_LABEL[s.staff.role]} · courses`) : s.kind}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No advisor or coach yet. The career center assigns one.</p>
            )}
          </section>
        </div>
      </div>

      {/* Your semester so far, Wrapped-style. Only ever compares you with you. */}
      <section aria-label={`Your ${term} so far`} className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Your {term} so far</h2>
        <div className="grid gap-4 [grid-template-areas:'hero'_'a'_'b'_'c'_'d'_'streak'_'swag'_'moment'] sm:grid-cols-2 sm:[grid-template-areas:'hero_hero'_'a_b'_'c_d'_'streak_swag'_'moment_moment'] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:[grid-template-areas:'hero_a_b'_'hero_c_d'_'streak_swag_moment']">
          <div className="flex flex-col gap-1.5 rounded-3xl bg-ink p-8 text-white [grid-area:hero]">
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-lime">
              Your {sem.term.split(" ")[0]} so far · week {sem.week}
            </span>
            <span className="mt-2 text-2xl font-bold">{firstName(profile.full_name)}, you showed up for yourself</span>
            <div className="flex flex-wrap items-end gap-4">
              <span className="text-[96px] font-extrabold leading-[.9] tracking-[-.05em] text-lime tabular-nums lg:text-[140px]">{p.showedUp}</span>
              <span className="pb-3.5 text-[28px] font-extrabold leading-[1.1]">
                time{p.showedUp === 1 ? "" : "s"}
                <br />
                this semester
              </span>
            </div>
            <p className="text-[15px] font-medium text-[#D9E6DE]">
              {p.showedUp === 0
                ? "Your first step this week starts the count."
                : p.showedUpLastTerm > 0 && up > 0
                  ? "Sessions, events, workshops and steps you finished. That's more than all of last spring already."
                  : "Sessions, events, workshops and steps you finished. Every one counts toward your rewards."}
            </p>
            <div className="mt-auto pt-4">
              <Link href="/student/roadmap" className="inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-extrabold text-ink">
                Open my roadmap
              </Link>
            </div>
          </div>
          <Tile area="a" bg="#FF9A8B" fg="#2A0E09" label="Hours invested in you">
            <div className="mt-auto flex items-baseline gap-1.5">
              <span className="text-[68px] font-extrabold leading-[.9] tracking-[-.05em] tabular-nums">{p.hours}</span>
              <span className="text-[22px] font-extrabold">hrs</span>
            </div>
            <p>About, from sessions, events and steps you finished.</p>
          </Tile>
          <Tile area="b" bg="#9ED8F5" fg="#0B2C3D" label="Skills leveled up">
            <div className="mt-auto flex items-center gap-3.5">
              <span className="text-[68px] font-extrabold leading-[.9] tabular-nums">{p.skills.length}</span>
              <div className="flex min-w-0 flex-col gap-1">
                {p.skills.length ? (
                  p.skills.map((s) => (
                    <span key={s} className="truncate rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs font-semibold">Finish a skill step to start.</span>
                )}
              </div>
            </div>
          </Tile>
          <Tile area="c" bg="#C9C1FF" fg="#1E1750" label="Your career vibe">
            <span className="mt-auto text-[28px] font-extrabold leading-[1.05] tracking-[-.03em]">{vibe}</span>
            <p className="text-[15px]">{vibeSub}</p>
          </Tile>
          <Tile area="d" bg="#FFD166" fg="#3A2B00" label="People in your corner">
            <span className="mt-auto text-[68px] font-extrabold leading-[.9] tabular-nums">{p.people}</span>
            <p>Your advisor and career coach{p.people > 2 ? ", and more" : ""}.</p>
          </Tile>
          <Tile area="streak" bg="var(--color-lime)" fg="#1E2A06" label="Your streak">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[90px] font-extrabold leading-[.9] tabular-nums">{p.streakWeeks}</span>
              <span className="text-2xl font-extrabold leading-[1.1]">
                week{p.streakWeeks === 1 ? "" : "s"}
                <br />
                in a row
              </span>
            </div>
            <p className="text-sm">At least one thing for your career, every week.</p>
            <div className="mt-auto grid grid-cols-9 gap-1.5" aria-hidden="true">
              {p.weeks.map((on, i) => (
                <i key={i} className={`h-[34px] rounded-[10px] ${on ? "bg-ink" : "bg-ink/15"} ${i === 8 ? "shadow-[0_0_0_3px_#fff]" : ""}`} />
              ))}
            </div>
          </Tile>
          <div className="flex min-w-0 flex-col gap-2 rounded-3xl border border-line bg-white/95 p-[22px] [grid-area:swag]">
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-muted">Swag you&apos;ve earned</span>
            <span className="text-[22px] font-extrabold leading-[1.1] tracking-tight">
              {unlocked.length} unlocked{rewards.next ? `, ${rewards.next.need - rewards.next.have <= 1 ? "1 almost yours" : "1 on the way"}` : ""}
            </span>
            <div className="mt-auto flex flex-wrap items-center gap-4">
              {unlocked[0] && (
                <div className="flex size-[120px] shrink-0 -rotate-6 flex-col items-center justify-center rounded-full border-[6px] border-white bg-melon text-center font-extrabold text-ink shadow-[0_10px_24px_rgba(242,92,102,.35)] outline-2 outline-dashed outline-melon">
                  <span className="text-[11px] uppercase tracking-[.08em]">Unlocked</span>
                  <span className="px-2 text-sm leading-tight">{unlocked[0].name}</span>
                </div>
              )}
              {rewards.next && (
                <div className="flex min-w-0 flex-1 rotate-3 flex-col gap-1.5 rounded-[18px] border-2 border-dashed border-[#B9C2BD] p-3.5">
                  <b>{rewards.next.name}</b>
                  <small className="text-muted">{rewards.next.need - rewards.next.have} more to go</small>
                  <Bar pct={(rewards.next.have / rewards.next.need) * 100} color="var(--color-melon)" />
                  <small>
                    <b>
                      {rewards.next.have} of {rewards.next.need}
                    </b>
                  </small>
                </div>
              )}
            </div>
            <Link href="/student/rewards" className="self-start text-sm font-semibold text-link">
              See all rewards
            </Link>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 rounded-3xl bg-[#FFE1E6] p-[22px] text-[#3D0F18] [grid-area:moment]">
            <span className="text-xs font-extrabold uppercase tracking-[.06em]">Biggest moment</span>
            <span className="text-[22px] font-extrabold leading-[1.15] tracking-tight">{p.moment ? p.moment.title : "Your big moment is coming"}</span>
            <p className="text-[13px] font-semibold">{p.moment ? shortDate(p.moment.when) : "The Career Fair is a great place for one."}</p>
            <Link href="/student/rewards" className="mt-auto self-start rounded-full border border-[#3D0F18] px-4 py-2 text-sm font-bold">
              Add a photo (optional)
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Tile({ area, bg, fg, label, children }: { area: string; bg: string; fg: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-3xl p-[22px] text-[13px] font-semibold" style={{ gridArea: area, background: bg, color: fg }}>
      <span className="text-xs font-extrabold uppercase tracking-[.06em]">{label}</span>
      {children}
    </div>
  );
}

function roadmapMessage(status: string | undefined, hasTeam: boolean) {
  if (status === "published") return "Everything on your roadmap is done for now. Your next session will add more.";
  if (status === "awaiting_student") return "Your advisor or coach approved your roadmap. Read it over and accept it to make it yours.";
  if (status === "draft") {
    return hasTeam
      ? "We've drafted your first roadmap from your answers. Your advisor or coach checks it first, then it comes to you to accept."
      : "We've drafted your first roadmap from your answers. It appears here once the career center assigns your advisor or coach and they approve it.";
  }
  return "Your advisor or coach will set up your roadmap with you.";
}

