import { Backdrop, INTEREST_COLORS } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { firstName, requireRole } from "@/lib/auth";
import { currentSemester, termOrder, weekOf } from "@/lib/roadmap/semester";
import { createClient } from "@/lib/supabase/server";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";
import { markChangesSeen, pinPath, setItemDone } from "../actions";

export const metadata = { title: "Roadmap · Melon" };

const TZ = "America/Indiana/Indianapolis";

type Item = {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  term: string | null;
  kind: string;
  status: string;
  path_id: string | null;
  due_date: string | null;
  firm: boolean;
  sort: number;
  completed_at: string | null;
};
type Path = {
  id: string;
  name: string;
  reason: string | null;
  first_job: string | null;
  status: "pinned" | "exploring" | "backup" | "dropped";
  interest: string | null;
  created_from_session: string | null;
  created_at: string;
};
type Change = { id: string; summary: { kind?: string; added?: string[] }; session_id: string | null; seen_at: string | null; created_at: string };
type PastSession = { id: string; created_at: string; staff: { full_name: string } | null };
type Resource = { id: string; type: string; title: string; provider: string | null; source: string; url: string | null };

const KIND_LABEL: Record<string, string> = {
  course: "Course",
  experience: "Experience",
  skill: "Skill",
  certification: "Certification",
  event: "Event",
  networking: "Networking",
  application: "Applications",
  coaching: "Coaching",
  project: "Project",
};
const RESOURCE_LABEL: Record<string, string> = {
  skill: "Skill",
  certification: "Certification",
  event: "Event",
  course: "Course",
  coaching: "Coaching",
};

export default async function RoadmapPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: roadmap }, { data: sp }, { data: pathRows }, { data: itemRows }, { data: changeRows }, { data: sessionRows }, { data: summaryRows }] =
    await Promise.all([
      supabase.from("roadmaps").select("status, published_at").eq("student_id", profile.id).maybeSingle(),
      supabase.from("student_profiles").select("interests, class_year, majors").eq("user_id", profile.id).maybeSingle(),
      supabase
        .from("roadmap_paths")
        .select("id, name, reason, first_job, status, interest, created_from_session, created_at")
        .eq("student_id", profile.id)
        .order("sort"),
      supabase
        .from("roadmap_items")
        .select("id, title, description, rationale, term, kind, status, path_id, due_date, firm, sort, completed_at")
        .eq("student_id", profile.id)
        .order("sort"),
      supabase.from("roadmap_changes").select("id, summary, session_id, seen_at, created_at").eq("student_id", profile.id).order("created_at", { ascending: false }).limit(20),
      supabase
        .from("sessions")
        .select("id, created_at, staff:profiles!sessions_staff_id_fkey(full_name)")
        .eq("student_id", profile.id)
        .eq("status", "reviewed")
        .order("created_at", { ascending: true }),
      supabase
        .from("insights")
        .select("payload, created_at")
        .eq("student_id", profile.id)
        .eq("kind", "summary")
        .in("status", ["accepted", "edited"])
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const interests = sp?.interests ?? [];

  if (roadmap?.status !== "published") {
    return (
      <main className="relative mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6">
        <Backdrop interests={interests} />
        <h1 className="text-3xl font-extrabold tracking-tight">Your roadmap</h1>
        <p className="rounded-3xl border border-line bg-white/95 p-6 text-ink-2">
          Your first roadmap is with your advisor or coach for a quick check. It shows up here once they approve it, or
          right after your next session with them.
        </p>
      </main>
    );
  }

  const items = (itemRows ?? []) as Item[];
  const allPaths = (pathRows ?? []) as Path[];
  const changes = (changeRows ?? []) as unknown as Change[];
  const unseen = changes.filter((c) => !c.seen_at);
  const sessions = (sessionRows ?? []) as unknown as PastSession[];
  const latestSummary = (summaryRows?.[0]?.payload as { text?: string } | undefined)?.text;

  const sem = currentSemester();
  const paths = allPaths.filter((p) => p.status !== "dropped");
  const dropped = allPaths.filter((p) => p.status === "dropped");
  const newPathIds = new Set(
    paths.filter((p) => p.created_from_session && unseen.some((c) => c.session_id === p.created_from_session)).map((p) => p.id),
  );
  const pathName = new Map(paths.map((p) => [p.id, p.name]));

  const byPlan = (a: Item, b: Item) =>
    termOrder(a.term) - termOrder(b.term) ||
    Number(b.firm) - Number(a.firm) ||
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    a.sort - b.sort;
  const open = items.filter((i) => i.status === "active").sort(byPlan);
  const nowItems = open.filter((i) => termOrder(i.term) <= termOrder(sem.term));
  const focus = (nowItems.length ? nowItems : open).slice(0, 3);
  const moreCount = (nowItems.length ? nowItems.length : open.length) - focus.length;
  const doneItems = items.filter((i) => i.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const keyDates = open
    .filter((i) => i.due_date)
    .map((i) => ({ item: i, week: weekOf(sem, new Date(`${i.due_date}T12:00:00`)) }))
    .filter((x): x is { item: Item; week: number } => x.week !== null)
    .slice(0, 3);
  const keyWeeks = new Set(keyDates.map((k) => k.week));

  // Resources for the student's interests that aren't already a step on the roadmap.
  const { data: resRows } = interests.length
    ? await supabase.from("resources").select("id, type, title, provider, source, url").overlaps("interests", interests).limit(12)
    : { data: [] };
  const resources = ((resRows ?? []) as Resource[]).filter((r) => !items.some((i) => i.title === r.title)).slice(0, 4);

  const year = sp?.class_year ? YEAR_LABEL[sp.class_year as ClassYear] : null;
  const themeLabel = interests.map((i: string) => INTEREST_COLORS[i]?.label).filter(Boolean).join(" + ");
  const addedFromSessions = (sessionId: string) =>
    changes.filter((c) => c.session_id === sessionId).reduce((n, c) => n + (c.summary.added?.filter((a) => !a.startsWith("New path")).length ?? 0), 0);

  return (
    <main className="relative mx-auto grid max-w-7xl items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <Backdrop interests={interests} />

      {/* The tree: where you've been, where you are, where you could go. */}
      <section aria-label="Your path" className="order-2 flex flex-col lg:order-1">
        <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Your growth so far</p>
        <ol className="ml-2.5 mt-3 flex flex-col gap-3.5 border-l-[5px] border-[#B9C9BF] pb-2 pl-6">
          {roadmap.published_at && (
            <TrunkEntry when={roadmap.published_at} text="Your roadmap started" />
          )}
          {sessions.map((s) => {
            const added = addedFromSessions(s.id);
            return (
              <TrunkEntry
                key={s.id}
                when={s.created_at}
                text={`Session with ${s.staff?.full_name ?? "your advisor"}${added ? ` · ${added} step${added === 1 ? "" : "s"} added` : ""}`}
              />
            );
          })}
          {doneItems.length > 0 && <TrunkEntry text={`${doneItems.length} step${doneItems.length === 1 ? "" : "s"} done`} />}
          {dropped.map((p) => (
            <TrunkEntry key={p.id} text={`${p.name} (explored)`} explored />
          ))}
        </ol>

        <div className="flex items-center gap-3.5">
          <span
            className="size-12 shrink-0 rounded-full border-[6px] bg-white"
            style={{ borderColor: "var(--school)", boxShadow: "0 0 0 8px color-mix(in srgb, var(--school) 14%, transparent)" }}
          />
          <span className="flex flex-col">
            <b className="text-base font-extrabold">{sem.term.split(" ")[0]} &apos;{sem.term.slice(-2)} · you are here</b>
            <span className="text-xs text-muted">
              {nowItems.length} step{nowItems.length === 1 ? "" : "s"} open this semester
            </span>
          </span>
        </div>

        <Fork paths={paths} newIds={newPathIds} />
        <p className="mb-2 text-sm text-ink-2">{forkCaption(paths, newPathIds.size > 0)}</p>
        <div className={`grid gap-2.5 ${paths.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {paths.map((p) => (
            <BranchCard
              key={p.id}
              path={p}
              isNew={newPathIds.has(p.id)}
              upcoming={open.filter((i) => i.path_id === p.id).slice(0, 3)}
            />
          ))}
        </div>
        {paths.length === 0 && <p className="text-sm text-muted">No paths yet. Your advisor or coach will add some with you.</p>}
      </section>

      {/* This semester. */}
      <section className="order-1 flex min-w-0 flex-col gap-5 rounded-3xl border-2 lg:order-2 bg-white/95 p-5 shadow-[0_14px_40px_rgba(20,33,27,.10)] sm:p-6" style={{ borderColor: "var(--school)" }}>
        {unseen.length > 0 && <WhatChanged changes={unseen} />}

        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
            This semester · {sem.term} · week {sem.week} of {sem.weeks}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {newPathIds.size ? "Your roadmap grew a new branch." : `Hi ${firstName(profile.full_name)}, here's your focus.`}
          </h1>
          <p className="mt-1 text-ink-2">{[year, sp?.majors?.[0], themeLabel && `theme: ${themeLabel}`].filter(Boolean).join(" · ")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: sem.weeks }, (_, i) => i + 1).map((w) => (
              <span
                key={w}
                className="h-2.5 flex-1 rounded-[3px]"
                style={{
                  background: w < sem.week ? "#B9C9BF" : w === sem.week ? "var(--school)" : keyWeeks.has(w) ? "#8E9893" : "var(--color-line)",
                }}
              />
            ))}
          </div>
          <p className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>Week 1</span>
            {keyDates.map((k) => (
              <span key={k.item.id} className={k.item.firm ? "font-bold text-ink" : ""}>
                {k.item.title.length > 28 ? `${k.item.title.slice(0, 26)}…` : k.item.title} · {shortDate(k.item.due_date!)}
              </span>
            ))}
            <span>Finals</span>
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <h2 className="text-lg font-extrabold">Your next {focus.length > 1 ? focus.length : ""} step{focus.length === 1 ? "" : "s"}</h2>
          {focus.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {focus.map((i) => (
                <StepCard key={i.id} item={i} pathName={i.path_id ? pathName.get(i.path_id) : undefined} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-done-bg px-4 py-3 text-sm font-semibold text-done-ink">
              Everything here is done. Your next session will add more.
            </p>
          )}
          {moreCount > 0 && (
            <p className="text-sm font-semibold text-muted">
              +{moreCount} more after these. Finish one and the next moves up.
            </p>
          )}
        </div>

        {latestSummary && (
          <div className="rounded-2xl bg-soft px-4 py-3">
            <p className="text-xs font-extrabold uppercase tracking-widest text-muted">From your latest session</p>
            <p className="mt-1 text-ink-2">{latestSummary}</p>
          </div>
        )}

        {resources.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h2 className="text-lg font-extrabold">Building your path</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {resources.map((r) => (
                <div key={r.id} className={`flex min-w-0 flex-col gap-0.5 rounded-xl p-3 ${r.source === "melon" ? "bg-new-bg" : "bg-[#F3F8FB]"}`}>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${r.source === "melon" ? "text-new-ink" : "text-link"}`}>
                    {r.source === "melon" ? "Suggested by Melon" : RESOURCE_LABEL[r.type] ?? r.type}
                  </span>
                  <b className="text-sm">{r.title}</b>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-link">
                      {r.provider ?? "Open"}
                    </a>
                  ) : (
                    <span className="text-xs text-muted">{r.provider}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {doneItems.length > 0 && (
          <details className="rounded-2xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-extrabold">Done so far ({doneItems.length})</summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {doneItems.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted line-through">{i.title}</span>
                  <form action={setItemDone.bind(null, i.id, false)}>
                    <SubmitButton label="Undo" variant="link" />
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

function TrunkEntry({ when, text, explored }: { when?: string; text: string; explored?: boolean }) {
  return (
    <li className={`relative text-sm ${explored ? "italic text-[#848D88]" : "text-muted"}`}>
      <span
        aria-hidden="true"
        className={`absolute -left-[38px] top-0.5 size-4 rounded-full ${explored ? "border-2 border-dashed border-[#B9C2BD] bg-white" : "bg-[#B9C9BF]"}`}
      />
      {when && <b className="text-ink-2">{shortDate(when)} · </b>}
      {text}
    </li>
  );
}

/** The curved lines from "you are here" down to each branch column. */
function Fork({ paths, newIds }: { paths: Path[]; newIds: Set<string> }) {
  const cols = Math.min(paths.length, 2);
  if (!cols) return null;
  const firstRow = paths.slice(0, cols);
  return (
    <svg className="block h-11 w-full" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
      {firstRow.map((p, i) => {
        const x = ((i + 0.5) / cols) * 100;
        const color = newIds.has(p.id) ? "#8B7CF6" : p.status === "pinned" ? "#14211B" : "#9AA49F";
        return (
          <path
            key={p.id}
            d={`M 7 0 C 7 26 ${x} 18 ${x} 44`}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeDasharray={p.status === "pinned" ? undefined : "3 7"}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function BranchCard({ path, isNew, upcoming }: { path: Path; isNew: boolean; upcoming: Item[] }) {
  const pinned = path.status === "pinned";
  const style = pinned
    ? "border-2 border-ink bg-white/85"
    : isNew
      ? "border-2 border-dashed border-new bg-white/90 shadow-[0_0_0_6px_rgba(139,124,246,.18)]"
      : path.status === "backup"
        ? "border-[1.5px] border-dashed border-[#9AA49F] bg-white/60 opacity-85"
        : "border-[1.5px] border-dashed border-[#9AA49F] bg-white/65";
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-2xl p-3 ${style}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
        <span className="min-w-0">{path.name}</span>
        {pinned && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">Pinned</span>}
        {isNew && <span className="rounded-full bg-new-bg px-2 py-0.5 text-[11px] font-extrabold text-new-ink">New</span>}
        {path.status === "backup" && <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2">Backup</span>}
      </div>
      {path.reason && <p className="text-xs text-muted">{path.reason}</p>}
      {upcoming.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((i) => (
            <li key={i.id} className="flex flex-col text-xs text-ink-2">
              <em className="text-[11px] font-bold not-italic text-muted">{shortTerm(i.term)}</em>
              {i.title}
            </li>
          ))}
        </ul>
      )}
      {path.first_job && (
        <span className="self-start rounded-lg bg-ink/[.07] px-2.5 py-1.5 text-xs font-extrabold text-ink-2">First job: {path.first_job}</span>
      )}
      {!pinned && (
        <form action={pinPath.bind(null, path.id)}>
          <SubmitButton label="Pin this path" variant="link" />
        </form>
      )}
    </div>
  );
}

function StepCard({ item, pathName }: { item: Item; pathName?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-white p-3.5">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2">{KIND_LABEL[item.kind] ?? item.kind}</span>
        {item.due_date ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.firm ? "bg-firm-bg text-firm" : "bg-soft text-ink-2"}`}>
            {item.firm ? "Firm · " : "By "}
            {shortDate(item.due_date)}
          </span>
        ) : (
          <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2">{shortTerm(item.term)}</span>
        )}
      </div>
      <b className="text-[15px] leading-snug">{item.title}</b>
      {item.description && <p className="text-xs text-muted">{item.description}</p>}
      <p className="text-xs text-muted">{pathName ? `For: ${pathName}` : "Counts for every path"}</p>
      <form action={setItemDone.bind(null, item.id, true)} className="mt-auto">
        <SubmitButton label="Mark done" variant="secondary" />
      </form>
    </div>
  );
}

function WhatChanged({ changes }: { changes: Change[] }) {
  const added = changes.flatMap((c) => c.summary.added ?? []);
  const newPaths = added.filter((a) => a.startsWith("New path"));
  const steps = added.filter((a) => !a.startsWith("New path"));
  const firstPublish = changes.some((c) => c.summary.kind === "published");
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-[#1E1B3A] p-4 text-white">
      <p className="text-xs font-extrabold uppercase tracking-widest text-[#C4BCFF]">
        {added.length ? "What changed since your last session" : "Your roadmap is ready"}
      </p>
      {firstPublish && !added.length && <p className="text-sm">Your advisor or coach checked it. These are your first steps.</p>}
      {(newPaths.length > 0 || steps.length > 0) && (
        <ul className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
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
              Your other paths stay. Skills you have carry over.
            </li>
          )}
        </ul>
      )}
      <form action={markChangesSeen}>
        <button className="rounded-full bg-[#C4BCFF] px-4 py-2 text-sm font-extrabold text-[#1E1B3A]">Got it</button>
      </form>
    </div>
  );
}

function forkCaption(paths: Path[], grew: boolean) {
  if (grew) return "Your skills open more than one door.";
  if (paths.length === 1) return "One path, with room to branch out later.";
  if (paths.some((p) => p.status === "pinned")) return `${paths.length} paths. You pinned your favorite; the others stay open.`;
  return `${paths.length} paths to explore. Pin one when it clicks.`;
}

function shortDate(iso: string) {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
}

function shortTerm(term: string | null) {
  const m = term?.match(/^(Spring|Summer|Fall) (\d{4})$/);
  return m ? `${m[1]} '${m[2].slice(2)}` : term ?? "";
}
