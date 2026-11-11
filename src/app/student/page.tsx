import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Camera, CalendarDays, Check, Clock, MapPin, Target, Video } from "lucide-react";
import { Backdrop, INTEREST_COLORS } from "@/components/Backdrop";
import { Avatar } from "@/components/student/Avatar";
import { firstName, requireRole } from "@/lib/auth";
import { appNow } from "@/lib/clock";
import { longDate, shortDate, timeOf } from "@/lib/format";
import { rewardsFor } from "@/lib/progress";
import { daysUntil } from "@/lib/roadmap/fair";
import { currentSemester } from "@/lib/roadmap/semester";
import { focusSteps, loadFairPlan, loadRoadmap, pathLadders } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { ConsentCard } from "./ConsentCard";
import { YEAR_LABEL, type Role } from "@/lib/types";

export const metadata = { title: "Home · Melon" };

type NextAppt = { starts_at: string; type: string; modality: string; location: string | null; staff: { full_name: string; role: Role } | null };

// Home is one dashboard. Every card is a link and ends with the one thing to do next, so nothing here is
// just for show. It only ever compares the student with themselves.

export default async function StudentHome() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, data, { data: appt }, rewards, { count: suggestionCount }] = await Promise.all([
    supabase.from("student_profiles").select("onboarding_step").eq("user_id", profile.id).single(),
    loadRoadmap(supabase, profile.id),
    supabase
      .from("appointments")
      .select("starts_at, type, modality, location, staff:profiles!appointments_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .eq("status", "scheduled")
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    rewardsFor(supabase, profile.id),
    supabase.from("roadmap_suggestions").select("id", { count: "exact", head: true }).eq("student_id", profile.id).eq("status", "pending"),
  ]);
  if (sp && sp.onboarding_step !== "done") redirect("/student/onboarding");

  const { roadmap, year, majors, interests, pinned, steps } = data;
  const published = roadmap?.status === "published";
  const sem = currentSemester();
  const f = focusSteps(steps, sem);
  const [plan, ladders] = await Promise.all([
    published ? loadFairPlan(supabase, profile.id, steps) : null,
    pathLadders(supabase, pinned.slice(0, 1), year),
  ]);
  const next = published ? ((plan ? f.now.find((s) => plan.ids.has(s.id)) : undefined) ?? f.now[0]) : undefined;
  const nextAppt = appt as unknown as NextAppt | null;
  const p = rewards.progress;
  const unlocked = rewards.all.filter((r) => r.unlocked);
  const season = sem.term.split(" ")[0];
  const today = appNow().toISOString();
  const nextSkill = ladders[0]?.rungs.find((r) => !steps.some((s) => s.resource_id === r.id && s.status === "done"));
  const vibe = pinned[0]?.name ?? (interests[0] ? INTEREST_COLORS[interests[0]]?.label : null) ?? "Still exploring";
  const twist = pinned[1]?.name ?? data.paths.find((x) => x.status === "exploring" && x.id !== pinned[0]?.id)?.name;
  const apptDays = nextAppt ? daysUntil(today, nextAppt.starts_at) : 0;
  // Career steps are worth bringing to a career coach; course planning with an advisor is its own thing.
  const talkAbout = nextAppt?.staff?.role === "coach" ? f.now.slice(0, 3) : [];

  const headline = plan
    ? `Hi ${firstName(profile.full_name)}, the Career Fair is ${plan.days === 0 ? "today" : plan.days === 1 ? "tomorrow" : `in ${plan.days} days`}.`
    : `Hi ${firstName(profile.full_name)}, here's your ${season.toLowerCase()} so far.`;

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <p className="text-[13px] font-extrabold uppercase tracking-[.08em]" style={{ color: "var(--school)" }}>
          {[year && YEAR_LABEL[year], majors[0], `week ${sem.week} of ${sem.weeks}`].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{headline}</h1>
      </div>

      {Boolean(suggestionCount) && (
        <Link href="/student/roadmap" className="rounded-2xl border-2 border-new bg-new-bg px-4 py-3 font-bold text-new-ink">
          {suggestionCount === 1
            ? "Your advisor or coach suggested a change to your roadmap"
            : `Your advisor or coach suggested ${suggestionCount} changes to your roadmap`}
          . It&apos;s your call →
        </Link>
      )}

      <ConsentCard studentId={profile.id} />

      <div className="grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* You showed up for yourself, and the one plan that matters most right now. */}
        <Tile
          href={published ? "/student/tasks" : "/student/roadmap"}
          className="bg-ink text-white sm:col-span-2 lg:row-span-2"
          arrow="#C8F169"
          pad="p-7 sm:p-8"
        >
          <span className="text-xs font-extrabold uppercase tracking-[.06em] text-lime">
            Your {season} so far · week {sem.week}
          </span>
          {p.showedUp > 0 ? (
            <>
              <span className="mt-2 text-xl font-bold sm:text-2xl">{firstName(profile.full_name)}, you showed up for yourself</span>
              <div className="flex flex-wrap items-end gap-4">
                <span className="text-[96px] font-extrabold leading-[.9] tracking-[-.05em] text-lime tabular-nums lg:text-[140px]">{p.showedUp}</span>
                <span className="pb-3.5 text-[26px] font-extrabold leading-[1.1] sm:text-[28px]">
                  time{p.showedUp === 1 ? "" : "s"}
                  <br />
                  this semester
                </span>
              </div>
              <p className="text-[15px] font-medium text-[#D9E6DE]">
                Appointments, events and steps you finished.
                {p.showedUpLastTerm > 0 && p.showedUp > p.showedUpLastTerm ? " Already more than all of last semester." : ""}
              </p>
            </>
          ) : (
            <>
              <span className="mt-2 text-3xl font-extrabold">Your story starts this week.</span>
              <p className="text-[15px] text-[#D9E6DE]">Every appointment, event and step you finish shows up here.</p>
            </>
          )}
          {!published ? (
            <p className="mt-auto border-t border-white/15 pt-5 text-[15px] font-bold text-lime">{roadmapMessage(roadmap?.status)}</p>
          ) : plan && plan.total > 0 ? (
            <div className="mt-auto flex flex-col gap-2.5 border-t border-white/15 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-2 font-extrabold">
                  <Target size={17} className="text-lime" aria-hidden="true" />
                  Fair-ready · {plan.done} of {plan.total} step{plan.total === 1 ? "" : "s"}
                </span>
                <span className="font-bold text-[#D9E6DE]">{longDate(`${plan.fair.date}T16:00:00Z`)}</span>
              </div>
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: plan.total }, (_, i) => (
                  <i key={i} className={`h-2 flex-1 rounded ${i < plan.done ? "bg-lime" : "bg-white/20"}`} />
                ))}
              </div>
              {next && <span className="text-base font-extrabold text-lime">Next: {lower(next.title)}</span>}
            </div>
          ) : next ? (
            <span className="mt-auto border-t border-white/15 pt-5 text-base font-extrabold text-lime">Next: {lower(next.title)}</span>
          ) : (
            <span className="mt-auto border-t border-white/15 pt-5 text-base font-extrabold text-lime">
              All caught up. Your next appointment adds more.
            </span>
          )}
        </Tile>

        {nextAppt && (
          <Tile
            href="/student/appointments"
            className="border-2 bg-white/95 sm:col-span-2"
            style={{ borderColor: "var(--school)" }}
            arrow="var(--school)"
          >
            <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.06em]" style={{ color: "var(--school)" }}>
              <CalendarDays size={16} aria-hidden="true" />
              Next appointment · {apptDays <= 0 ? "today" : apptDays === 1 ? "tomorrow" : `in ${apptDays} days`}
            </span>
            <div className="flex items-center gap-4">
              {nextAppt.staff && <Avatar name={nextAppt.staff.full_name} role={nextAppt.staff.role} size={60} />}
              <div className="min-w-0">
                <b className="block text-[22px] leading-tight tracking-tight sm:text-2xl">{nextAppt.type}</b>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <Clock size={15} aria-hidden="true" />
                    {apptDays <= 0 ? "Today" : longDate(nextAppt.starts_at)} · {timeOf(nextAppt.starts_at)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {nextAppt.modality === "in_person" ? <MapPin size={15} aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}
                    {nextAppt.location ?? (nextAppt.modality === "teams" ? "Teams" : "Melon call")}
                  </span>
                </div>
              </div>
            </div>
            {talkAbout.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[13px] font-extrabold text-ink-2">Talk about:</span>
                {talkAbout.map((s) => (
                  <span key={s.id} className="max-w-full truncate rounded-full border border-line bg-soft px-2.5 py-1 text-[13px] font-bold">
                    {short(s.title)}
                  </span>
                ))}
              </div>
            )}
          </Tile>
        )}

        {(p.skills.length > 0 || nextSkill) && (
          <Tile href="/student/resources" className="bg-[#9ED8F5] text-[#0B2C3D]">
            <span className="text-xs font-extrabold uppercase tracking-[.06em]">Skills leveled up</span>
            <div className="mt-auto flex items-center gap-3.5">
              <span className="text-[68px] font-extrabold leading-[.9] tabular-nums">{p.skills.length}</span>
              <div className="flex min-w-0 flex-col gap-1">
                {p.skills.slice(0, 3).map((s) => (
                  <span key={s} className="truncate rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            {nextSkill && <span className="text-sm font-bold">Next: {short(nextSkill.title, 40)}</span>}
          </Tile>
        )}

        <Tile href="/student/roadmap" className="bg-[#C9C1FF] text-[#1E1750]">
          <span className="text-xs font-extrabold uppercase tracking-[.06em]">Your career vibe</span>
          <span className="mt-auto text-[28px] font-extrabold leading-[1.05] tracking-[-.03em]">{vibe}</span>
          {twist && <span className="text-[15px] font-semibold">with a rising twist of {twist}</span>}
          <span className="text-sm font-bold">
            {twist ? "Compare both on your roadmap" : pinned.length ? "See your road to it" : "Pin a path when it clicks"}
          </span>
        </Tile>

        {p.streakWeeks > 0 && (
          <Tile href="/student/tasks" className="bg-lime text-[#1E2A06] sm:col-span-2">
            <span className="text-xs font-extrabold uppercase tracking-[.06em]">Your streak</span>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[90px] font-extrabold leading-[.9] tabular-nums">{p.streakWeeks}</span>
              <span className="text-2xl font-extrabold leading-[1.1]">
                week{p.streakWeeks === 1 ? "" : "s"}
                <br />
                in a row
              </span>
            </div>
            <span className="text-sm font-bold">Do 1 step by Sunday to make it {p.streakWeeks + 1}.</span>
            <div className="mt-auto grid grid-cols-9 gap-1.5 pt-2" aria-hidden="true">
              {p.weeks.map((on, i) => (
                <i key={i} className={`h-[34px] rounded-[10px] ${on ? "bg-ink" : "bg-ink/15"} ${i === 8 ? "shadow-[0_0_0_3px_#fff]" : ""}`} />
              ))}
            </div>
          </Tile>
        )}

        {(unlocked.length > 0 || (rewards.next?.have ?? 0) > 0) && (
          <Tile href="/student/rewards" className="border border-line bg-white/95" arrow="#5B6660">
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-muted">Swag you&apos;ve earned</span>
            <span className="text-xl font-extrabold leading-[1.1] tracking-tight">
              {unlocked.length} unlocked{rewards.next ? ", 1 on the way" : ""}
            </span>
            <div className="mt-auto flex items-center gap-3">
              {unlocked[0] && (
                <div className="flex size-[84px] shrink-0 -rotate-6 flex-col items-center justify-center rounded-full border-[5px] border-white bg-melon text-center font-extrabold text-ink shadow-[0_8px_20px_rgba(242,92,102,.35)] outline-2 outline-dashed outline-melon">
                  <span className="text-[9px] uppercase tracking-[.08em]">Unlocked</span>
                  <span className="px-1.5 text-xs leading-tight">{unlocked[0].name}</span>
                </div>
              )}
              {rewards.next && (
                <div className="flex min-w-0 flex-1 rotate-3 flex-col gap-1.5 rounded-2xl border-2 border-dashed border-[#B9C2BD] p-2.5">
                  <b className="truncate text-[13px]">{rewards.next.name}</b>
                  <span className="block h-[7px] rounded bg-soft">
                    <span className="block h-[7px] rounded bg-melon" style={{ width: `${(rewards.next.have / rewards.next.need) * 100}%` }} />
                  </span>
                  <b className="text-xs">
                    {rewards.next.have} of {rewards.next.need}
                  </b>
                </div>
              )}
            </div>
            {rewards.next && (
              <span className="text-[13px] font-bold text-ink-2">
                {rewards.next.need - rewards.next.have} to go: {lower(rewards.next.description)}.
              </span>
            )}
          </Tile>
        )}

        {p.moment && (
          <Tile href="/student/rewards" className="bg-[#FFE1E6] text-[#3D0F18]">
            <span className="text-xs font-extrabold uppercase tracking-[.06em]">Biggest moment</span>
            <span className="mt-auto text-[22px] font-extrabold leading-[1.15] tracking-tight">{p.moment.title}</span>
            <span className="text-[13px] font-semibold">{shortDate(p.moment.when)}</span>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <Camera size={16} aria-hidden="true" />
              Add a photo to keep it
            </span>
          </Tile>
        )}
      </div>
      {published && f.now.length === 0 && (
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Check size={16} aria-hidden="true" />
          Everything on your list is done. Your next appointment adds more.
        </p>
      )}
    </main>
  );
}

/** A dashboard card. The whole card is the link; the arrow in the corner nudges on hover. */
function Tile({
  href,
  className = "",
  style,
  arrow = "currentColor",
  pad = "p-[22px]",
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  arrow?: string;
  pad?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`tile-hover is-link anim-fade-up group relative flex min-w-0 flex-col gap-2 rounded-3xl ${pad} ${className}`}
      style={style}
    >
      <ArrowUpRight
        size={22}
        strokeWidth={2.4}
        aria-hidden="true"
        className="absolute right-5 top-5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        style={{ color: arrow }}
      />
      {children}
    </Link>
  );
}

function lower(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, "");
}

function short(title: string, max = 34) {
  if (title.length <= max) return title;
  const cut = title.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function roadmapMessage(status: string | undefined) {
  if (status === "awaiting_student") return "Your roadmap is ready. Read it over and accept it →";
  if (status === "draft") return "Your first roadmap is with your advisor or coach. It comes to you once they approve it.";
  return "Your advisor or coach will set up your roadmap with you.";
}
