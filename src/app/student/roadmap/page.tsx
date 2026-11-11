import Link from "next/link";
import { Backdrop, INTEREST_COLORS } from "@/components/Backdrop";
import { CandyRoad } from "@/components/student/CandyRoad";
import { SubmitButton } from "@/components/SubmitButton";
import { AddButton, Eyebrow, Pill, ResCard, SwagStrip } from "@/components/student/ui";
import { firstName, requireRole } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { rewardsFor } from "@/lib/progress";
import { currentSemester, weekOf } from "@/lib/roadmap/semester";
import { alumniFor, focusSteps, KIND_LABEL, loadRoadmap, pathLadders, pinLimit, type Path, type Step } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { YEAR_LABEL } from "@/lib/types";
import { acceptRoadmap, addResource, answerSuggestion, markChangesSeen, setItemDone, setPin } from "../actions";
import { buildRoadData } from "./road-data";

export const metadata = { title: "Roadmap · Melon" };

type Change = { id: string; summary: { kind?: string; added?: string[] }; session_id: string | null; seen_at: string | null; created_at: string };

const RUNG = ["Start here", "Then", "Then"];

export default async function RoadmapPage({ searchParams }: { searchParams: Promise<{ open?: string; task?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const data = await loadRoadmap(supabase, profile.id);
  const { roadmap, year, interests, paths: allPaths, pinned, steps } = data;

  if (roadmap?.status === "awaiting_student") {
    return <AcceptRoadmap interests={interests} paths={allPaths} steps={steps} />;
  }

  if (roadmap?.status !== "published") {
    return (
      <main className="relative mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6">
        <Backdrop interests={interests} />
        <h1 className="text-3xl font-extrabold tracking-tight">Your roadmap</h1>
        <p className="rounded-3xl border border-line bg-white/95 p-6 text-ink-2">
          Your first roadmap is with your advisor or coach. Once they approve it, it comes to you here to accept.
        </p>
      </main>
    );
  }

  const [{ data: changeRows }, ladders, alumni, rewards, { data: suggestionRows }] = await Promise.all([
    supabase.from("roadmap_changes").select("id, summary, session_id, seen_at, created_at").eq("student_id", profile.id).order("created_at", { ascending: false }).limit(20),
    pathLadders(supabase, pinned, year),
    alumniFor(supabase, pinned),
    rewardsFor(supabase, profile.id),
    supabase
      .from("roadmap_suggestions")
      .select("id, action, title, description, reason, before, by:profiles!roadmap_suggestions_suggested_by_fkey(full_name)")
      .eq("student_id", profile.id)
      .eq("status", "pending")
      .order("created_at"),
  ]);

  const suggestions = (suggestionRows ?? []) as unknown as SuggestionRow[];
  const sem = currentSemester();
  const changes = (changeRows ?? []) as unknown as Change[];
  const unseen = changes.filter((c) => !c.seen_at);
  const isFresh = (p: Path) => Boolean(p.created_from_session && unseen.some((c) => c.session_id === p.created_from_session));
  const paths = allPaths.filter((p) => p.status !== "dropped");
  const newPaths = paths.filter(isFresh);
  const newSessionIds = new Set(unseen.map((c) => c.session_id).filter(Boolean));
  const isNewStep = (s: Step) => (s.evidence ?? []).some((e) => e.session_id && newSessionIds.has(e.session_id));
  const pathName = new Map(paths.map((p) => [p.id, p.name]));
  const f = focusSteps(steps, sem);
  const limit = pinLimit(year);
  const pinnedCount = pinned.length;
  const road = buildRoadData({ steps, paths, pinned, isFresh, year, gradTerm: data.gradTerm, term: sem.term, limit });

  const keyDates = [...f.now, ...f.unlocks]
    .filter((s) => s.due_date)
    .map((s) => ({ step: s, week: weekOf(sem, new Date(`${s.due_date}T12:00:00`)) }))
    .filter((x): x is { step: Step; week: number } => x.week !== null)
    .sort((a, b) => a.step.due_date!.localeCompare(b.step.due_date!))
    .slice(0, 3);
  const keyWeeks = new Set(keyDates.map((k) => k.week));
  const onRoadmap = new Set(steps.map((s) => s.resource_id).filter(Boolean));
  const themeLabel = interests.map((i) => INTEREST_COLORS[i]?.label).filter(Boolean).join(" + ");

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />

      {(suggestions.length > 0 || unseen.length > 0) && (
        <div className="flex flex-col gap-3">
          {suggestions.length > 0 && <Suggestions suggestions={suggestions} />}
          {unseen.length > 0 && <WhatChanged changes={unseen} newPath={newPaths.find((p) => p.status !== "pinned")} switches={limit === 1 && pinnedCount >= 1} />}
        </div>
      )}

      <CandyRoad
        firstName={firstName(profile.full_name)}
        semesters={road.semesters}
        current={road.current}
        fork={road.fork}
        zones={road.zones}
        main={road.main}
        others={road.others}
        openTerm={params.open ?? null}
        highlight={params.task ?? null}
      />

      {/* This semester. */}
      <section
        className="flex min-w-0 flex-col gap-[18px] rounded-[22px] border-2 bg-white/95 p-5 shadow-[0_14px_40px_rgba(20,33,27,.10)] sm:p-6"
        style={{ borderColor: "var(--school)" }}
      >
        <div>
          <Eyebrow school>
            This semester · {sem.term} · week {sem.week} of {sem.weeks}
          </Eyebrow>
          <h2 className="mt-1 text-[24px] font-extrabold leading-tight tracking-tight sm:text-[26px]">
            {newPaths.length ? "Your roadmap grew a new branch." : "Your focus right now"}
          </h2>
          <p className="mt-1 text-ink-2">{[year && YEAR_LABEL[year], data.majors[0], themeLabel && `theme: ${themeLabel}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: sem.weeks }, (_, i) => i + 1).map((w) => (
              <i
                key={w}
                className="h-2.5 flex-1 rounded-[3px]"
                style={{ background: w < sem.week ? "#B9C9BF" : w === sem.week ? "var(--school)" : keyWeeks.has(w) ? "#8E9893" : "var(--color-line)" }}
              />
            ))}
          </div>
          <p className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>Week 1</span>
            {keyDates.map((k) => (
              <span key={k.step.id} className={k.step.firm ? "font-bold text-ink" : ""}>
                {k.step.title.length > 30 ? `${k.step.title.slice(0, 28)}…` : k.step.title} · {shortDate(k.step.due_date!)}
              </span>
            ))}
            <span>Finals</span>
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-extrabold">Your next {f.now.length > 1 ? f.now.length : ""} step{f.now.length === 1 ? "" : "s"}</h2>
            <Link href="/student/tasks" className="ml-auto text-sm font-semibold text-link">
              All action items
            </Link>
          </div>
          {f.now.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {f.now.map((s) => (
                <StepCard key={s.id} step={s} pathName={s.path_id ? pathName.get(s.path_id) : undefined} isNew={isNewStep(s)} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-done-bg px-4 py-3 text-sm font-semibold text-done-ink">Everything here is done. Your next appointment will add more.</p>
          )}
          {f.unlocks.length > 0 && (
            <span className="text-sm font-semibold text-muted">
              +{f.unlocks.length} more unlock{f.unlocks.length === 1 ? "s" : ""} when you finish one
            </span>
          )}
        </div>

        {ladders.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-extrabold">Building your path</h2>
              <Link href="/student/resources" className="ml-auto text-sm font-semibold text-link">
                All resources
              </Link>
            </div>
            {ladders.map(({ path, rungs }) => (
              <div key={path.id} className="flex flex-col gap-2">
                {ladders.length > 1 && <span className="text-xs font-bold text-muted">For {path.name}</span>}
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {rungs.map((r, i) => (
                    <ResCard
                      key={r.id}
                      kicker={RUNG[i]}
                      title={r.title}
                      provider={r.provider}
                      url={r.url}
                      isNew={i === 0}
                      action={onRoadmap.has(r.id) ? <span className="text-xs font-bold text-done-ink">✓ On your roadmap</span> : <AddButton action={addResource.bind(null, r.id)} />}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {pinned.length === 0 && paths.length > 0 && (
          <p className="rounded-2xl bg-soft px-4 py-3 text-sm text-ink-2">Pin a path and Melon picks a short &quot;start here&quot; list for it.</p>
        )}

        <SwagStrip reward={rewards.next} />

        {alumni.length > 0 && (
          <details className="rounded-2xl border border-line bg-white/90 p-3">
            <summary className="cursor-pointer text-sm font-bold text-link">See where grads like you went</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {alumni.map((a) => (
                <li key={a.id} className="text-sm">
                  <b>{a.name}</b> · {a.degree} &apos;{String(a.grad_year).slice(2)} → {a.title} at {a.employer}
                  <span className="block text-xs text-muted">{a.story} Ask your career coach for an intro.</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

/** The student's half of the sign-off: what their advisor or coach approved, and a way to accept it. */
function AcceptRoadmap({ interests, paths, steps }: { interests: string[]; paths: Path[]; steps: Step[] }) {
  const live = paths.filter((p) => p.status !== "dropped");
  const general = steps.filter((s) => !s.path_id || !live.some((p) => p.id === s.path_id));
  return (
    <main className="relative mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your roadmap is ready to accept</h1>
        <p className="mt-1 text-ink-2">Your advisor or coach approved this. Read it over. Once you accept, it becomes your roadmap.</p>
      </div>
      {live.map((p) => (
        <AcceptSection key={p.id} title={p.name} note={p.reason} steps={steps.filter((s) => s.path_id === p.id)} />
      ))}
      {general.length > 0 && <AcceptSection title="Whichever path you take" steps={general} />}
      <form action={acceptRoadmap} className="flex flex-col items-start gap-2 rounded-3xl border-2 bg-white/95 p-6" style={{ borderColor: "var(--school)" }}>
        <SubmitButton label="Accept my roadmap" />
        <p className="text-sm text-muted">Something not right? Talk to your advisor or coach before you accept. They can change it.</p>
      </form>
    </main>
  );
}

function AcceptSection({ title, note, steps }: { title: string; note?: string | null; steps: Step[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-3xl border border-line bg-white/95 p-6">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {note && <p className="text-sm text-muted">{note}</p>}
      <ul className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.id} className="rounded-2xl border border-line bg-white p-3">
            <p className="font-semibold">{s.title}</p>
            <p className="text-sm text-muted">{s.term}</p>
            {s.rationale && <p className="mt-1 text-sm text-ink-2">Why: {s.rationale}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepCard({ step, pathName, isNew }: { step: Step; pathName?: string; isNew: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-[14px] bg-white p-3.5 ${isNew ? "border-2 border-new" : "border border-line"}`}>
      <div className="flex flex-wrap gap-1.5">
        {isNew && <Pill tone="new">New</Pill>}
        <Pill>{KIND_LABEL[step.kind] ?? step.kind}</Pill>
        {step.due_date ? (
          <Pill tone={step.firm ? "firm" : "plain"}>
            {step.firm ? "" : "By "}
            {shortDate(step.due_date)}
          </Pill>
        ) : null}
      </div>
      <Link href={`/student/tasks/${step.id}`} className="text-[15px] font-bold leading-snug underline decoration-[#B9C2BD] underline-offset-[3px]">
        {step.title}
      </Link>
      <p className="text-xs text-muted">{pathName ? `For: ${pathName}` : "Counts for every path"}</p>
      <form action={setItemDone.bind(null, step.id, true)} className="mt-auto">
        <SubmitButton label="Mark done" variant="secondary" />
      </form>
    </div>
  );
}

type SuggestionRow = { id: string; action: string; title: string | null; description: string | null; reason: string | null; before: { title?: string; description?: string | null } | null; by: { full_name: string } | null };

/** Changes staff suggest to an accepted roadmap. Nothing happens unless the student accepts. */
function Suggestions({ suggestions }: { suggestions: SuggestionRow[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-new bg-new-bg p-5">
      <div>
        <h2 className="text-lg font-extrabold text-new-ink">{suggestions.length === 1 ? "A suggestion for your roadmap" : `${suggestions.length} suggestions for your roadmap`}</h2>
        <p className="text-sm text-ink-2">It&apos;s your roadmap, so nothing changes unless you accept.</p>
      </div>
      {suggestions.map((x) => (
        <article key={x.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
            {x.action === "add" ? "Add a step" : x.action === "edit" ? "Change a step" : "Remove a step"} · from {x.by?.full_name ?? "your team"}
          </p>
          {x.action === "edit" && x.before?.title !== x.title && <p className="text-sm text-muted line-through">{x.before?.title}</p>}
          <p className={`font-bold ${x.action === "remove" ? "line-through" : ""}`}>{x.action === "remove" ? x.before?.title : x.title}</p>
          {x.action !== "remove" && x.description && <p className="text-sm text-ink-2">{x.description}</p>}
          {x.reason && <p className="text-sm text-ink-2">Why: {x.reason}</p>}
          <div className="flex flex-wrap gap-2">
            <form action={answerSuggestion.bind(null, x.id, true)}>
              <SubmitButton label="Accept" variant="secondary" />
            </form>
            <form action={answerSuggestion.bind(null, x.id, false)}>
              <SubmitButton label="No thanks" variant="link" />
            </form>
          </div>
        </article>
      ))}
    </section>
  );
}

function WhatChanged({ changes, newPath, switches }: { changes: Change[]; newPath?: Path; switches: boolean }) {
  const added = changes.flatMap((c) => c.summary.added ?? []);
  const newPaths = added.filter((a) => a.startsWith("New path"));
  const steps = added.filter((a) => !a.startsWith("New path"));
  const firstPublish = changes.some((c) => c.summary.kind === "published");
  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] bg-[#1E1B3A] p-[18px] text-white">
      <p className="text-xs font-extrabold uppercase tracking-[.08em] text-[#C4BCFF]">
        {added.length ? "What changed after your last appointment" : "Your roadmap is ready"}
      </p>
      {firstPublish && !added.length && <p className="text-sm">Your advisor or coach checked it. These are your first steps.</p>}
      {added.length > 0 && (
        <ul className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
          {newPaths.map((a) => (
            <li key={a} className="flex gap-2">
              <b className="w-3.5 shrink-0 text-lime">+</b>
              {a}
            </li>
          ))}
          {steps.map((a) => (
            <li key={a} className="flex gap-2">
              <b className="w-3.5 shrink-0 text-lime">+</b>
              {a}
            </li>
          ))}
          {newPaths.length > 0 && (
            <li className="flex gap-2">
              <b className="w-3.5 shrink-0 text-[#7FD4F5]">↺</b>
              Your pinned path stays. Skills you have carry over.
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {newPath && (
          <form action={setPin.bind(null, newPath.id, true)}>
            <button className="rounded-full bg-[#C4BCFF] px-4 py-2 text-sm font-extrabold text-[#1E1B3A]">
              {switches ? "Switch my pin to this path" : "Pin the new path"}
            </button>
          </form>
        )}
        <form action={markChangesSeen}>
          <button className={newPath ? "rounded-full border border-white/40 px-4 py-2 text-sm font-bold text-white" : "rounded-full bg-[#C4BCFF] px-4 py-2 text-sm font-extrabold text-[#1E1B3A]"}>
            {newPath ? "Keep exploring for now" : "Got it"}
          </button>
        </form>
      </div>
    </div>
  );
}
