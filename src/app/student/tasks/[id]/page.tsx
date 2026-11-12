import Link from "next/link";
import { notFound } from "next/navigation";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { AddButton, Bar, Eyebrow, Panel, Pill, ResCard } from "@/components/student/ui";
import { requireRole } from "@/lib/auth";
import { longDate, shortDate, timeOf } from "@/lib/format";
import { rewardsFor } from "@/lib/progress";
import { KIND_LABEL, loadRoadmap, pathLadders, RESOURCE_COLUMNS, RESOURCE_LABEL, type Resource } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { addResource, removeStep, setItemDone } from "../../actions";

export const metadata = { title: "Action item · Melon" };

export default async function StepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; open?: string }> }) {
  const { id } = await params;
  const back = await searchParams;
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { interests, paths, steps, year } = await loadRoadmap(supabase, profile.id);
  const step = steps.find((s) => s.id === id);
  if (!step) notFound();

  const path = paths.find((p) => p.id === step.path_id);
  const sessionId = (step.evidence ?? []).find((e) => e.session_id)?.session_id;
  const [{ data: linked }, { data: session }, { data: adviceRows }, ladders, { data: helpRows }, rewards] = await Promise.all([
    step.resource_id ? supabase.from("resources").select(RESOURCE_COLUMNS).eq("id", step.resource_id).maybeSingle() : Promise.resolve({ data: null }),
    sessionId
      ? supabase.from("sessions").select("created_at, session_type, staff:profiles!sessions_staff_id_fkey(full_name, role)").eq("id", sessionId).maybeSingle()
      : Promise.resolve({ data: null }),
    sessionId ? supabase.from("insights").select("payload").eq("session_id", sessionId).eq("kind", "advice").limit(1) : Promise.resolve({ data: [] }),
    path ? pathLadders(supabase, [path], year) : Promise.resolve([]),
    supabase.from("resources").select(RESOURCE_COLUMNS).eq("type", "coaching").contains("tags", ["career-services"]).limit(2),
    rewardsFor(supabase, profile.id),
  ]);
  const resource = linked as Resource | null;
  const from = session as unknown as { created_at: string; session_type: string | null; staff: { full_name: string; role: string } | null } | null;
  const advice = ((adviceRows ?? []) as Array<{ payload: { text?: string } }>)[0]?.payload.text;
  const onRoadmap = new Set(steps.map((s) => s.resource_id).filter(Boolean));
  // Free help: the next rungs of this step's path, or the career center's drop-in help for steps that are for everyone.
  const help = [...(ladders[0]?.rungs ?? []), ...((helpRows ?? []) as Resource[])].filter((r) => r.id !== step.resource_id).slice(0, 3);
  const event = resource?.type === "event" && resource.starts_at ? resource : null;
  const toward = rewards.all.find((r) => !r.unlocked && r.rule.kind === (step.kind === "event" ? "events" : "streak_weeks")) ?? rewards.next;
  const origin = from
    ? `${from.staff?.full_name ?? "Your coach"} added this after your ${from.session_type?.toLowerCase() ?? "appointment"} on ${shortDate(from.created_at)}.`
    : step.source === "student"
      ? step.resource_id
        ? "You added this from your resources."
        : "You added this yourself."
      : "Part of your first roadmap, checked by your advisor or coach.";
  const done = step.status === "done";

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <p className="text-sm text-muted">
        {back.from === "road" ? (
          <Link href={`/student/roadmap?${new URLSearchParams({ ...(back.open ? { open: back.open } : {}), task: step.id })}`} className="font-semibold text-link">
            ← Back to your road
          </Link>
        ) : (
          <>
            <Link href="/student/tasks" className="font-semibold text-link">
              Action items
            </Link>{" "}
            / {step.title}
          </>
        )}
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Panel className="gap-5 sm:p-7">
          <div className="flex flex-wrap gap-2">
            <Pill>{KIND_LABEL[step.kind] ?? step.kind}</Pill>
            {step.due_date && <Pill tone={step.firm ? "firm" : "plain"}>{step.firm ? `${shortDate(step.due_date)} · date can't move` : `By ${shortDate(step.due_date)}`}</Pill>}
            <Pill tone="ok">{path ? `For ${path.name}` : "Counts for every path"}</Pill>
            {step.status === "paused" && <Pill>Paused</Pill>}
            {done && <Pill tone="ok">Done {step.completed_at ? shortDate(step.completed_at) : ""}</Pill>}
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{step.title}</h1>
            <p className="mt-1.5 max-w-[62ch] text-ink-2">{origin}</p>
          </div>
          {(step.outcomes ?? []).length > 0 && (
            <div className="rounded-2xl bg-done-bg px-4 py-3">
              <Eyebrow>{done ? "What you got out of it" : "What you'll get out of it"}</Eyebrow>
              <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm text-ink-2">
                {(step.outcomes ?? []).map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {(step.description || step.rationale) && (
            <div className="rounded-2xl bg-soft px-4 py-3">
              <Eyebrow>Why this step</Eyebrow>
              {step.rationale && <p className="mt-1 text-sm text-ink-2">{step.rationale}</p>}
              {step.description && <p className="mt-1 text-sm text-ink-2">{step.description}</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {step.status === "active" && (
              <form action={setItemDone.bind(null, step.id, true)}>
                <SubmitButton label="Mark done" />
              </form>
            )}
            {done && (
              <form action={setItemDone.bind(null, step.id, false)}>
                <SubmitButton label="Undo" variant="secondary" />
              </form>
            )}
            {step.source === "student" && !done && (
              <form action={removeStep.bind(null, step.id)}>
                <SubmitButton label="Take it off my roadmap" variant="link" />
              </form>
            )}
          </div>
          {help.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-lg font-extrabold">Free help</h2>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {help.map((r) => (
                  <ResCard
                    key={r.id}
                    kicker={RESOURCE_LABEL[r.type] ?? r.type}
                    title={r.title}
                    provider={r.provider}
                    url={r.url}
                    isNew={r.source === "melon"}
                    action={r.type === "coaching" && !r.level ? undefined : onRoadmap.has(r.id) ? <span className="text-xs font-bold text-done-ink">✓ On your roadmap</span> : <AddButton action={addResource.bind(null, r.id)} />}
                  />
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          {event && (
            <Panel hero>
              <Eyebrow school>The event</Eyebrow>
              <b className="text-xl">{event.title}</b>
              <span className="text-ink-2">
                {longDate(event.starts_at!)} · {timeOf(event.starts_at!)}
              </span>
              {event.provider && <span className="text-sm text-muted">{event.provider}</span>}
              {event.blurb && <span className="text-sm text-ink-2">{event.blurb}</span>}
            </Panel>
          )}
          {toward && (
            <div className="flex flex-col gap-2 rounded-[20px] bg-ink p-5 text-white">
              <span className="text-xs font-extrabold uppercase tracking-[.08em] text-lime">You&apos;re working toward</span>
              <b className="text-[17px]">{toward.name}</b>
              <span className="text-[13px] text-[#D9E6DE]">
                {toward.description}. You&apos;re at {toward.have} of {toward.need}.
              </span>
              <Bar pct={(toward.have / toward.need) * 100} color="var(--color-lime)" track="rgba(255,255,255,.2)" />
              <small className="text-[#B8C7BE]">Pick up at the Career Center</small>
            </div>
          )}
          {step.kind === "event" && (
            <div className="flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-[#B9C2BD] bg-white/90 p-5">
              <b>Share a moment (optional)</b>
              <span className="text-[13px] text-muted">Snap a photo at the event for your semester story. Only you and your advisor or coach see it.</span>
              <Link href="/student/rewards" className="self-start rounded-full border border-ink px-4 py-2 text-sm font-bold">
                Upload
              </Link>
            </div>
          )}
          {advice && (
            <Panel>
              <Eyebrow>Note from {from?.staff?.full_name ?? "your coach"}</Eyebrow>
              <b className="text-[15px] font-semibold">{advice}</b>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
