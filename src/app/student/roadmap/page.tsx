import { Backdrop } from "@/components/Backdrop";
import { CandyRoad } from "@/components/student/CandyRoad";
import { SubmitButton } from "@/components/SubmitButton";
import { firstName, requireRole } from "@/lib/auth";
import { appNow } from "@/lib/clock";
import { currentSemester, weekOf } from "@/lib/roadmap/semester";
import { alumniFor, loadRoadmap, pinLimit, type Path, type Step } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { acceptRoadmap, answerSuggestion, markChangesSeen, setPin } from "../actions";
import { buildRoadData } from "./road-data";

export const metadata = { title: "Roadmap · Melon" };

type Change = { id: string; summary: { kind?: string; added?: string[] }; session_id: string | null; seen_at: string | null; created_at: string };


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

  const [{ data: changeRows }, alumni, { data: suggestionRows }, { data: fairRows }] = await Promise.all([
    supabase.from("roadmap_changes").select("id, summary, session_id, seen_at, created_at").eq("student_id", profile.id).order("created_at", { ascending: false }).limit(20),
    alumniFor(supabase, pinned),
    supabase
      .from("roadmap_suggestions")
      .select("id, action, title, description, reason, before, by:profiles!roadmap_suggestions_suggested_by_fkey(full_name)")
      .eq("student_id", profile.id)
      .eq("status", "pending")
      .order("created_at"),
    // This semester's real career fair (not the mock one), so its flag can ask "Did you go?" afterwards.
    supabase.from("resources").select("title, starts_at").eq("type", "event").ilike("title", "%career fair%").not("title", "ilike", "%mock%").not("starts_at", "is", null).order("starts_at"),
  ]);

  const suggestions = (suggestionRows ?? []) as unknown as SuggestionRow[];
  const sem = currentSemester();
  const changes = (changeRows ?? []) as unknown as Change[];
  const unseen = changes.filter((c) => !c.seen_at);
  const isFresh = (p: Path) => Boolean(p.created_from_session && unseen.some((c) => c.session_id === p.created_from_session));
  const paths = allPaths.filter((p) => p.status !== "dropped");
  const newPaths = paths.filter(isFresh);
  const limit = pinLimit(year);
  const pinnedCount = pinned.length;
  const today = appNow().toISOString().slice(0, 10);
  const fairDate = (fairRows ?? [])
    .map((e) => (e.starts_at as string).slice(0, 10))
    .find((d) => weekOf(sem, new Date(`${d}T12:00:00Z`)) !== null);
  const road = buildRoadData({ steps, paths, pinned, isFresh, year, gradTerm: data.gradTerm, term: sem.term, limit, fairDate, today });

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

      {alumni.length > 0 && (
        <details className="self-start rounded-2xl border border-line bg-white/90 px-4 py-3">
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
