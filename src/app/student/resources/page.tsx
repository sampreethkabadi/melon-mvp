import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { AddButton, Eyebrow, Panel, ResCard } from "@/components/student/ui";
import { requireRole } from "@/lib/auth";
import { longDate, timeOf } from "@/lib/format";
import { alumniFor, loadRoadmap, pathLadders, RESOURCE_COLUMNS, RESOURCE_LABEL, upcomingEvents, type Resource } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { addResource, removeStep } from "../actions";

export const metadata = { title: "Resources · Melon" };

const RUNG = ["Start here", "Then", "Then"];

export default async function ResourcesPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { roadmap, year, interests, paths, pinned, steps } = await loadRoadmap(supabase, profile.id);
  const pinnedInterests = pinned.map((p) => p.interest).filter((i): i is string => Boolean(i));
  const [ladders, alumni, events, { data: more }] = await Promise.all([
    pathLadders(supabase, pinned, year),
    alumniFor(supabase, pinned),
    upcomingEvents(supabase, pinned, 5),
    pinnedInterests.length
      ? supabase.from("resources").select(RESOURCE_COLUMNS).overlaps("interests", pinnedInterests).eq("type", "club").contains("tags", ["club"]).limit(10)
      : Promise.resolve({ data: [] }),
  ]);
  const canAdd = roadmap?.status === "published";
  const stepFor = (r: Resource) => steps.find((s) => s.resource_id === r.id);
  const extras = ((more ?? []) as Resource[]).filter((r) => !ladders.some((l) => l.rungs.some((x) => x.title === r.title)));
  const clubs = extras.filter((r) => r.type === "club").slice(0, 3);

  const action = (r: Resource) => {
    const s = stepFor(r);
    if (s) {
      return s.source === "student" && s.status !== "done" ? (
        <span className="flex items-center gap-3">
          <span className="text-xs font-bold text-done-ink">✓ On your roadmap</span>
          <AddButton action={removeStep.bind(null, s.id)} label="Remove" />
        </span>
      ) : (
        <span className="text-xs font-bold text-done-ink">{s.status === "done" ? "✓ Done" : "✓ On your roadmap"}</span>
      );
    }
    return canAdd ? <AddButton action={addResource.bind(null, r.id)} /> : null;
  };

  return (
    <main className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Resources</h1>
        <p className="mt-1 text-ink-2">
          A short list for the path{pinned.length === 1 ? "" : "s"} you pinned, not a pile. Start at the top.
          {canAdd ? " Add one and it goes straight onto your roadmap." : " You can add these once your roadmap is approved."}
        </p>
      </div>

      {ladders.map(({ path, rungs }) => (
        <Panel key={path.id} hero>
          <div className="flex flex-wrap items-baseline gap-2">
            <Eyebrow school>Your pinned path</Eyebrow>
            <h2 className="text-lg font-extrabold">{path.name}</h2>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {rungs.map((r, i) => (
              <li key={r.id} className="flex">
                <div className="flex w-full flex-col gap-1.5">
                  <span className="text-xs font-extrabold text-muted">
                    {i + 1}. {RUNG[i]}
                  </span>
                  <ResCard kicker={RESOURCE_LABEL[r.type] ?? r.type} title={r.title} provider={r.provider} url={r.url} blurb={r.blurb} isNew={i === 0} action={action(r)} />
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      ))}

      {pinned.length === 0 && (
        <Panel>
          <h2 className="text-lg font-extrabold">Pin a path to get your list</h2>
          <p className="text-sm text-ink-2">
            Pin a path on your{" "}
            <Link href="/student/roadmap" className="font-semibold text-link">
              roadmap
            </Link>{" "}
            and Melon picks three things to start with. You can switch anytime.
          </p>
        </Panel>
      )}

      {alumni.length > 0 && (
        <Panel>
          <h2 className="text-lg font-extrabold">See where grads like you went</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {alumni.map((a) => (
              <div key={a.id} className="flex flex-col gap-1 rounded-2xl bg-soft p-4">
                <b>
                  {a.name} · {a.degree} &apos;{String(a.grad_year).slice(2)}
                </b>
                <span className="text-sm font-semibold">
                  {a.title} at {a.employer}
                </span>
                <span className="text-sm text-ink-2">{a.story}</span>
                <span className="text-xs text-muted">Not the exact same path, and that&apos;s the point. Ask your career coach for an intro.</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-extrabold">Career center events</h2>
          <span className="text-xs text-muted">For everyone, plus ones for your pinned path.</span>
          {events.length ? (
            events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm">{e.title}</b>
                  <span className="text-xs text-muted">
                    {longDate(e.starts_at!)} · {timeOf(e.starts_at!)} · {e.provider}
                  </span>
                </div>
                {action(e)}
              </div>
            ))
          ) : (
            <span className="text-sm text-muted">Nothing coming up right now.</span>
          )}
        </Panel>
        {clubs.length > 0 && (
          <Panel>
            <h2 className="text-lg font-extrabold">Clubs on beInvolved</h2>
            <div className="grid gap-2.5">
              {clubs.map((c) => (
                <ResCard key={c.id} kicker="Club" title={c.title} provider="Find it on beInvolved" url={c.url} action={action(c)} />
              ))}
            </div>
          </Panel>
        )}
      </div>

      {ladders
        .filter((l) => l.more.length)
        .map((l) => (
          <details key={l.path.id} className="rounded-[22px] border border-line bg-white/90 p-5">
            <summary className="cursor-pointer font-extrabold">More for {l.path.name}, when you&apos;re ready</summary>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {l.more.map((r) => (
                <ResCard key={r.id} kicker={RESOURCE_LABEL[r.type] ?? r.type} title={r.title} provider={r.provider} url={r.url} blurb={r.blurb} action={action(r)} />
              ))}
            </div>
          </details>
        ))}
      {paths.length > pinned.length && pinned.length > 0 && (
        <p className="text-sm text-muted">
          Want ideas for another path? Pin it on your{" "}
          <Link href="/student/roadmap" className="font-semibold text-link">
            roadmap
          </Link>
          . You can switch anytime.
        </p>
      )}
    </main>
  );
}
