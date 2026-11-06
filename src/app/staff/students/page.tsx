import Link from "next/link";
import { ProgressBar } from "@/components/staff/MeetingPrepCard";
import { requireRole } from "@/lib/auth";
import { shortDate, timeOf } from "@/lib/format";
import { loadStudentRows } from "@/lib/staff/load";
import { selectStudents, type StudentRow } from "@/lib/staff/overview";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Students · Melon" };

const ROADMAP: Record<string, string> = { none: "No roadmap yet", draft: "Draft to approve", awaiting_student: "Waiting for student to accept", published: "Roadmap accepted" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ show?: string; sort?: string; q?: string }> }) {
  const { show = "all", sort = "attention", q = "" } = await searchParams;
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();
  const all = await loadStudentRows(supabase, profile.id);
  const rows = selectStudents(all, { show, sort, q });
  const needYou = all.filter((r) => r.attention.length).length;
  const meetingToday = all.filter((r) => r.meetingToday).length;
  const started = all.filter((r) => r.total > 0);
  const average = started.length ? Math.round(started.reduce((n, r) => n + r.percent, 0) / started.length) : 0;
  const href = (next: { show?: string; sort?: string }) => {
    const p = new URLSearchParams({ show: next.show ?? show, sort: next.sort ?? sort, ...(q ? { q } : {}) });
    return `/staff/students?${p}`;
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your students</h1>
        <p className="mt-1 text-ink-2">Everyone at a glance. Open a row for their current progress.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={all.length} label="students" />
        <Stat value={needYou} label="need a look" />
        <Stat value={meetingToday} label="meeting today" />
        <Stat value={`${average}%`} label="average progress" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill href={href({ show: "all" })} on={show === "all"} label={`All ${all.length}`} />
        <Pill href={href({ show: "attention" })} on={show === "attention"} label={`Need a look ${needYou}`} />
        <Pill href={href({ show: "today" })} on={show === "today"} label={`Today ${meetingToday}`} />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <form action="/staff/students" className="flex items-center gap-2">
            <input type="hidden" name="show" value={show} />
            <input type="hidden" name="sort" value={sort} />
            <input name="q" defaultValue={q} aria-label="Find a student" placeholder="Find a student or major" className="w-48 rounded-full border border-line bg-white px-3 py-1.5 text-sm" />
          </form>
          <span className="text-sm text-muted">Sort:</span>
          <Pill href={href({ sort: "attention" })} on={sort === "attention"} label="Priority" />
          <Pill href={href({ sort: "name" })} on={sort === "name"} label="Name" />
          <Pill href={href({ sort: "progress" })} on={sort === "progress"} label="Progress" />
        </span>
      </div>

      {all.length === 0 && <p className="text-muted">No students are assigned to you yet.</p>}
      {all.length > 0 && rows.length === 0 && <p className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">No students match that.</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <StudentRowCard row={r} />
          </li>
        ))}
      </ul>
    </main>
  );
}

function StudentRowCard({ row: r }: { row: StudentRow }) {
  return (
    <details className="group rounded-2xl border border-line bg-white open:border-ink">
      <summary className="grid cursor-pointer list-none grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[1.4fr_1fr_1.1fr]">
        <span className="flex min-w-0 flex-col">
          <b>{r.name}</b>
          <span className="truncate text-sm text-muted">{[r.yearLabel, r.majors[0]].filter(Boolean).join(" · ") || "Profile not filled in yet"}</span>
        </span>
        <span className="flex flex-col">
          <span className="text-xs font-semibold text-muted">{r.roadmapStatus === "published" ? `${r.done} of ${r.total} steps done` : ROADMAP[r.roadmapStatus] ?? r.roadmapStatus}</span>
          {r.roadmapStatus === "published" && <ProgressBar percent={r.percent} />}
        </span>
        <span className="flex flex-wrap gap-1.5 md:justify-end">
          {r.meetingToday && <Tag tone="today">{`Today ${timeOf(r.meetingToday.starts_at)}`}</Tag>}
          {r.attention.map((a) => (
            <Tag key={a.key} tone={a.urgent ? "urgent" : "quiet"}>
              {a.label}
            </Tag>
          ))}
          {!r.attention.length && !r.meetingToday && <Tag tone="ok">On track</Tag>}
        </span>
      </summary>
      <div className="grid gap-4 border-t border-line px-4 py-4 text-sm md:grid-cols-3">
        <Column title="Open steps">
          {r.openSteps.length ? (
            <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-2">
              {r.openSteps.slice(0, 4).map((s) => (
                <li key={s.title}>
                  {s.title}
                  {s.due_date ? <span className="text-muted"> · {s.firm ? "firm " : ""}{shortDate(s.due_date)}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">None right now.</p>
          )}
        </Column>
        <Column title="Latest">
          {r.lastSession ? (
            <p className="text-ink-2">
              <b>{shortDate(r.lastSession.created_at)}</b>, {r.lastSession.session_type ?? "session"} with {r.lastSession.staff?.full_name ?? "staff"}
              {r.lastSummary ? `: ${r.lastSummary}` : "."}
            </p>
          ) : (
            <p className="text-muted">No sessions yet.</p>
          )}
          {r.nextAppointment && (
            <p className="mt-2 text-ink-2">
              <b>Next:</b> {r.nextAppointment.type}, {shortDate(r.nextAppointment.starts_at)} at {timeOf(r.nextAppointment.starts_at)}
            </p>
          )}
        </Column>
        <Column title="Focus and advice">
          {r.paths.filter((p) => p.status === "pinned").length > 0 && <p className="text-ink-2">Pinned: {r.paths.filter((p) => p.status === "pinned").map((p) => p.name).join(", ")}</p>}
          {r.openAdvice.length ? (
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-ink-2">
              {r.openAdvice.slice(0, 3).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">No open advice.</p>
          )}
        </Column>
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Link href={`/staff/students/${r.id}`} className="rounded-full bg-ink px-4 py-2 font-extrabold text-white">
            Open full record
          </Link>
          {r.toReview[0] && (
            <Link href={`/staff/sessions/${r.toReview[0].id}`} className="rounded-full border border-line bg-white px-4 py-2 font-semibold hover:border-ink">
              Review session
            </Link>
          )}
        </div>
      </div>
    </details>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-extrabold uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <b className="block text-2xl font-extrabold tabular-nums">{value}</b>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

function Pill({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link href={href} aria-current={on ? "true" : undefined} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-ink text-white" : "border border-line bg-white hover:border-ink"}`}>
      {label}
    </Link>
  );
}

const TAG = { urgent: "bg-firm-bg text-firm", quiet: "bg-warn-bg text-warn-ink", today: "bg-new-bg text-new-ink", ok: "bg-done-bg text-done-ink" };

function Tag({ tone, children }: { tone: keyof typeof TAG; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TAG[tone]}`}>{children}</span>;
}
