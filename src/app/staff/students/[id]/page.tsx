import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { firstName, requireRole } from "@/lib/auth";
import { MeetingPrepCard } from "@/components/staff/MeetingPrepCard";
import { appNow, localDate } from "@/lib/clock";
import { timeOf } from "@/lib/format";
import { buildBriefing } from "@/lib/sessions/briefing";
import { loadStudentRows } from "@/lib/staff/load";
import { ROADMAP_KINDS } from "@/lib/sessions/types";
import { createClient } from "@/lib/supabase/server";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";
import { startSession } from "../../sessions/actions";
import { addItem, approveRoadmap, dropPath, editItem, setItemApproval, suggestAdd, suggestEdit, suggestRemove, withdrawSuggestion } from "../actions";

export const metadata = { title: "Student · Melon" };

const SESSION_STATUS: Record<string, string> = {
  created: "Waiting for consent",
  no_recording: "Notes needed",
  recording: "Processing",
  uploaded: "Processing",
  transcribed: "Processing",
  ready_for_review: "Needs your review",
  reviewed: "Reviewed",
  failed: "Failed",
};
const ITEM_STATUS: Record<string, string> = { done: "Done", queued: "Waiting for a free slot", locked: "Saved for later", paused: "Paused (path unpinned)" };
const ADVICE_STATUS: Record<string, string> = { new: "Not started", in_progress: "In progress", done: "Done", dismissed: "Dismissed" };

type Suggestion = { id: string; item_id: string | null; action: string; title: string | null; description: string | null; reason: string | null; before: { title?: string } | null; status: string; suggested_by: string | null };

type Item = { id: string; title: string; description: string | null; rationale: string | null; term: string | null; kind: string; status: string; approval: string; path_id: string | null; due_date: string | null; firm: boolean };

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ appointment?: string }> }) {
  const { id } = await params;
  const { appointment } = await searchParams;
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("profiles")
    .select("id, full_name, email, student_profiles(class_year, program, majors, minors, expected_grad_term, interests, target_roles, clubs, answers, resume_path, onboarding_step)")
    .eq("id", id)
    .eq("role", "student")
    .maybeSingle();
  if (!person) notFound();
  const sp = person.student_profiles as unknown as { class_year: ClassYear | null; program: string | null; majors: string[]; minors: string[]; expected_grad_term: string | null; target_roles: string[]; clubs: string[]; answers: { skills?: string[] }; resume_path: string | null; onboarding_step: string } | null;

  const [{ data: roadmap }, { data: pathRows }, { data: changeRows }, { data: itemRows }, { data: sessions }, { data: adviceRows }, { data: events }, { data: mineRow }, { data: suggestionRows }, { data: apptRow }] = await Promise.all([
    supabase.from("roadmaps").select("id, status, version").eq("student_id", id).maybeSingle(),
    supabase.from("roadmap_paths").select("id, name, reason, first_job, status").eq("student_id", id).order("sort"),
    supabase.from("roadmap_changes").select("summary, created_at").eq("student_id", id).order("created_at", { ascending: false }).limit(1),
    supabase.from("roadmap_items").select("id, title, description, rationale, term, kind, status, approval, path_id, due_date, firm").eq("student_id", id).order("sort"),
    supabase.from("sessions").select("id, staff_id, status, created_at, session_type, staff:profiles!sessions_staff_id_fkey(full_name), insights(kind, status, payload)").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("advice_items").select("id, text, status, created_at, given_by_person:profiles!advice_items_given_by_fkey(full_name)").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("profile_events").select("id, type, payload, source, occurred_at").eq("student_id", id).order("occurred_at", { ascending: false }).limit(25),
    supabase.from("staff_assignments").select("id").eq("student_id", id).eq("staff_id", profile.id).eq("active", true).maybeSingle(),
    supabase.from("roadmap_suggestions").select("id, item_id, action, title, description, reason, before, status, suggested_by, created_at, decided_at").eq("student_id", id).order("created_at", { ascending: false }).limit(20),
    appointment ? supabase.from("appointments").select("id, starts_at, type, modality, location, student_id, status").eq("id", appointment).eq("student_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const items = (itemRows ?? []) as Item[];
  const sessionList = (sessions ?? []) as unknown as Array<{ id: string; staff_id: string; status: string; created_at: string; session_type: string | null; staff: { full_name: string } | null; insights: Array<{ kind: string; status: string; payload: { text: string } }> }>;
  const advice = (adviceRows ?? []) as unknown as Array<{ id: string; text: string; status: string; given_by_person: { full_name: string } | null }>;
  const eventList = events ?? [];
  const lastReviewed = sessionList.find((s) => s.status === "reviewed");
  const lastSummary = lastReviewed?.insights.find((i) => i.kind === "summary" && i.status !== "rejected" && i.status !== "proposed");
  const textsOf = (type: string) => eventList.filter((e) => e.type === type).map((e) => (e.payload as { text?: string }).text ?? "").filter(Boolean);

  const briefing = buildBriefing({
    name: person.full_name,
    yearLabel: sp?.class_year ? YEAR_LABEL[sp.class_year] : null,
    majors: sp?.majors ?? [],
    expectedGrad: sp?.expected_grad_term ?? null,
    targetRoles: sp?.target_roles ?? [],
    goals: textsOf("session_goal"),
    concerns: textsOf("session_concern"),
    lastSummary: lastReviewed && lastSummary ? { text: lastSummary.payload.text, date: shortDate(lastReviewed.created_at), staff: lastReviewed.staff?.full_name ?? "staff" } : null,
    sessionCount: sessionList.filter((s) => s.status === "reviewed").length,
    advice: advice.map((a) => ({ text: a.text, status: a.status })),
    roadmapStatus: roadmap?.status ?? "none",
    items: items.filter((i) => i.approval === "approved" || i.approval === "not_needed"),
  });

  const canAct = Boolean(mineRow) && profile.role !== "admin";
  const suggestions = (suggestionRows ?? []) as Suggestion[];
  const waitingOn = new Map(suggestions.filter((x) => x.status === "pending" && x.item_id).map((x) => [x.item_id!, x]));
  // What this person has in progress. A session waiting for review doesn't stop the next one starting.
  const openSession = sessionList.find((s) => s.staff_id === profile.id && !["reviewed", "closed", "ready_for_review"].includes(s.status));
  const toReview = sessionList.find((s) => s.staff_id === profile.id && s.status === "ready_for_review");
  const today = localDate(appNow());
  const prepRow = apptRow ? (await loadStudentRows(supabase, profile.id, [id]))[0] : null;
  const isDraft = roadmap?.status === "draft";
  const paths = (pathRows ?? []).filter((p) => p.status !== "dropped");
  const looseItems = items.filter((i) => !i.path_id || !paths.some((p) => p.id === i.path_id));
  const published = roadmap?.status === "published";
  // The short version: coaches see career steps first, advisors see course steps first.
  const courseFirst = profile.role !== "coach";
  const isCourse = (i: Item) => i.kind === "course";
  const open = items
    .filter((i) => i.status === "active")
    .sort((a, b) => Number(isCourse(b) === courseFirst) - Number(isCourse(a) === courseFirst) || Number(b.firm) - Number(a.firm) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const counts = {
    open: open.length,
    done: items.filter((i) => i.status === "done").length,
    waiting: items.filter((i) => i.status === "queued").length,
    saved: items.filter((i) => i.status === "locked").length,
    paused: items.filter((i) => i.status === "paused").length,
  };
  const lastChange = ((changeRows ?? [])[0] as { summary: { added?: string[] }; created_at: string } | undefined) ?? null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/staff/students" className="text-sm font-semibold text-link">
            ← Students
          </Link>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{person.full_name}</h1>
        </div>
        {canAct &&
          (openSession ? (
            <Link href={`/staff/sessions/${openSession.id}`} className="rounded-full bg-ink px-5 py-2.5 font-extrabold text-white">
              Open current session
            </Link>
          ) : (
            <form action={startSession.bind(null, id, appointment ?? null)}>
              <SubmitButton label="Start session" />
            </form>
          ))}
      </div>

      {apptRow && prepRow && <MeetingPrepCard appointment={apptRow} row={prepRow} today={today} open when={timeOf(apptRow.starts_at)} hideLink />}

      {toReview && (
        <Link href={`/staff/sessions/${toReview.id}`} className="rounded-2xl border-2 bg-warn-bg px-4 py-3 font-bold text-warn-ink" style={{ borderColor: "#F2C14E" }}>
          A session is waiting for your approval. Review its action items and key points →
        </Link>
      )}

      <section className="rounded-3xl border-2 bg-white/95 p-6" style={{ borderColor: "var(--school)" }}>
        <h2 className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          Briefing
        </h2>
        <p className="mt-1 text-lg font-bold">{briefing.headline}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-2">
          {briefing.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {briefing.openAdvice.length > 0 && (
          <div className="mt-3">
            <h3 className="font-bold">Advice still open</h3>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ink-2">
              {briefing.openAdvice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="flex flex-col gap-4 rounded-3xl border border-line bg-white/95 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold">Roadmap</h2>
              <p className="text-sm text-muted">
                {roadmapNote(roadmap?.status, firstName(person.full_name))}
              </p>
            </div>
            {canAct && isDraft && (
              <form action={approveRoadmap.bind(null, id)}>
                <SubmitButton label="Approve and send to student" />
              </form>
            )}
          </div>
          {published && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {paths.map((p) => (
                  <span key={p.id} className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.status === "pinned" ? "bg-ink text-white" : "bg-soft text-ink-2"}`}>
                    {p.status === "pinned" ? "Pinned: " : "Exploring: "}
                    {p.name}
                  </span>
                ))}
              </div>
              <p className="text-sm text-muted">
                {counts.open} open · {counts.done} done
                {counts.waiting ? ` · ${counts.waiting} waiting for a free slot` : ""}
                {counts.saved ? ` · ${counts.saved} saved for later` : ""}
                {counts.paused ? ` · ${counts.paused} paused` : ""}
              </p>
              <ol className="flex flex-col gap-1.5">
                {open.slice(0, 3).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                    <b className="min-w-0">{i.title}</b>
                    <span className="text-xs text-muted">
                      {i.kind === "course" ? "Course" : i.kind}
                      {i.due_date ? ` · ${i.firm ? "firm " : ""}${shortDate(i.due_date + "T12:00:00")}` : ""}
                    </span>
                  </li>
                ))}
                {!open.length && <li className="text-sm text-muted">No open steps.</li>}
              </ol>
              {lastChange?.summary.added?.length ? (
                <p className="rounded-xl bg-soft px-3 py-2 text-sm text-ink-2">
                  <b>Last change ({shortDate(lastChange.created_at)}):</b> {lastChange.summary.added.join("; ")}
                </p>
              ) : null}
            </div>
          )}
          {suggestions.length > 0 && (
            <SuggestionList studentId={id} suggestions={suggestions} me={profile.id} />
          )}
          {canAct && published && (
            <details className="rounded-2xl bg-soft p-3">
              <summary className="cursor-pointer text-sm font-bold text-link">Suggest a new step</summary>
              <form action={suggestAdd.bind(null, id)} className="mt-2 flex flex-col items-start gap-2">
                <p className="text-sm text-muted">This roadmap is accepted, so {firstName(person.full_name)} decides whether to add it.</p>
                <input name="title" required aria-label="New step title" placeholder="What should they do?" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
                <textarea name="description" aria-label="New step details" placeholder="Details (optional)" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
                <input name="reason" aria-label="Why you suggest it" placeholder="Why? They'll see this." className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
                <div className="flex items-center gap-2">
                  <select name="kind" defaultValue="coaching" aria-label="Kind of step" className="rounded-xl border border-line bg-white px-2 py-2 text-sm">
                    {ROADMAP_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <SubmitButton label="Send suggestion" variant="secondary" />
                </div>
              </form>
            </details>
          )}
          <MaybeCollapsed collapsed={published}>
          {paths.map((path) => (
              <div key={path.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold">
                    {path.name}
                    {path.first_job && path.first_job !== path.name && <span className="font-normal text-muted"> · first job: {path.first_job}</span>}
                  </h3>
                  {canAct && isDraft && (
                    <form action={dropPath.bind(null, id, path.id)}>
                      <SubmitButton label="Remove path" variant="link" />
                    </form>
                  )}
                </div>
                {items.filter((i) => i.path_id === path.id).map((item) => <ItemRow key={item.id} studentId={id} item={item} editable={canAct} locked={published} waiting={waitingOn.get(item.id)} />)}
              </div>
            ))}
            {looseItems.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-extrabold">Whichever path you take</h3>
                {looseItems.map((item) => <ItemRow key={item.id} studentId={id} item={item} editable={canAct} locked={published} waiting={waitingOn.get(item.id)} />)}
              </div>
            )}
            {canAct && roadmap && roadmap.status !== "none" && !published && (
              <form action={addItem.bind(null, id, roadmap.id)} className="flex flex-wrap items-end gap-2 rounded-2xl bg-soft p-3">
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
                  Add an item
                  <input name="title" required className="rounded-xl border border-line bg-white px-3 py-2 font-normal" />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Type
                  <select name="kind" defaultValue="coaching" className="rounded-xl border border-line bg-white px-2 py-2 font-normal">
                    {ROADMAP_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton label="Add" variant="secondary" />
              </form>
            )}
  
          </MaybeCollapsed>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-3xl border border-line bg-white/95 p-6">
            <h2 className="text-lg font-extrabold">Sessions</h2>
            {sessionList.length === 0 && <p className="mt-1 text-sm text-muted">None yet.</p>}
            <ul className="mt-2 flex flex-col gap-2">
              {sessionList.map((s) => (
                <li key={s.id}>
                  <Link href={`/staff/sessions/${s.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 hover:border-ink">
                    <span className="text-sm font-semibold">
                      {shortDate(s.created_at)} · {s.session_type ?? "Session"} · {s.staff?.full_name}
                    </span>
                    <span className="text-xs text-muted">{SESSION_STATUS[s.status] ?? s.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-line bg-white/95 p-6">
            <h2 className="text-lg font-extrabold">Advice tracker</h2>
            {advice.length === 0 && <p className="mt-1 text-sm text-muted">No advice recorded yet.</p>}
            <ul className="mt-2 flex flex-col gap-2">
              {advice.map((a) => (
                <li key={a.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                  <p>{a.text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {ADVICE_STATUS[a.status]} · from {a.given_by_person?.full_name ?? "staff"}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-line bg-white/95 p-6">
            <h2 className="text-lg font-extrabold">Profile</h2>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <Fact label="Program" value={sp?.program} />
              <Fact label="Minors" value={sp?.minors?.join(", ")} />
              <Fact label="Clubs" value={sp?.clubs?.join(", ")} />
              <Fact label="Skills" value={sp?.answers?.skills?.join(", ")} />
              <Fact label="Resume" value={sp?.resume_path ? "On file" : "Not uploaded"} />
            </dl>
            <h3 className="mt-3 font-bold">What changed</h3>
            {eventList.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
            <ol className="mt-1 flex flex-col gap-1 text-sm">
              {eventList.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>{eventLabel(e.type, e.payload as { text?: string })}</span>
                  <span className="shrink-0 text-xs text-muted">{shortDate(e.occurred_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}

function ItemRow({ studentId, item, editable, locked, waiting }: { studentId: string; item: Item; editable: boolean; locked: boolean; waiting?: Suggestion }) {
  const rejected = item.approval === "rejected";
  // A removed step on an accepted roadmap is history, so there's nothing left to do with it.
  const actions = editable && !(locked && rejected);
  return (
    <div className={`rounded-2xl border border-line p-3 ${rejected ? "bg-soft" : "bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${rejected ? "text-muted line-through" : ""}`}>{item.title}</p>
          <p className="text-sm text-muted">
            {item.term} · {item.kind}
            {ITEM_STATUS[item.status] ? ` · ${ITEM_STATUS[item.status]}` : ""}
          </p>
          {item.rationale && !rejected && <p className="mt-1 text-sm text-ink-2">Why: {item.rationale}</p>}
        </div>
        {actions && !locked && (
          <form action={setItemApproval.bind(null, studentId, item.id, rejected ? "pending" : "rejected")}>
            <SubmitButton label={rejected ? "Restore" : "Remove"} variant="link" />
          </form>
        )}
      </div>
      {waiting && <p className="mt-1 text-sm font-semibold text-new-ink">Your suggestion is waiting for an answer.</p>}
      {actions && !rejected && !locked && (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm font-semibold text-link">Edit</summary>
          <form action={editItem.bind(null, studentId, item.id)} className="mt-2 flex flex-col items-start gap-2">
            <input name="title" defaultValue={item.title} required aria-label="Title" className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
            <textarea name="description" defaultValue={item.description ?? ""} aria-label="Description" className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
            <SubmitButton label="Save" variant="secondary" />
          </form>
        </details>
      )}
      {actions && !rejected && locked && !waiting && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-link">Suggest a change</summary>
            <form action={suggestEdit.bind(null, studentId, item.id)} className="mt-2 flex flex-col items-start gap-2">
              <input name="title" defaultValue={item.title} required aria-label="Suggested title" className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
              <textarea name="description" defaultValue={item.description ?? ""} aria-label="Suggested description" className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
              <input name="reason" aria-label="Why you suggest this change" placeholder="Why? They'll see this." className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
              <SubmitButton label="Send suggestion" variant="secondary" />
            </form>
          </details>
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-link">Suggest removing</summary>
            <form action={suggestRemove.bind(null, studentId, item.id)} className="mt-2 flex flex-col items-start gap-2">
              <input name="reason" aria-label="Why you suggest removing it" placeholder="Why? They'll see this." className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
              <SubmitButton label="Send suggestion" variant="secondary" />
            </form>
          </details>
        </div>
      )}
    </div>
  );
}

const SUGGESTION_STATUS: Record<string, string> = { pending: "Waiting for an answer", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" };

function SuggestionList({ studentId, suggestions, me }: { studentId: string; suggestions: Suggestion[]; me: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-new/40 bg-new-bg/50 p-3">
      <h3 className="text-sm font-extrabold text-new-ink">Suggestions</h3>
      <ul className="flex flex-col gap-1.5">
        {suggestions.slice(0, 6).map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm">
            <span className="min-w-0">
              <b>{x.action === "add" ? "Add" : x.action === "edit" ? "Change" : "Remove"}:</b> {x.title ?? x.before?.title}
              <span className="ml-1 text-xs text-muted">· {SUGGESTION_STATUS[x.status]}</span>
            </span>
            {x.status === "pending" && x.suggested_by === me && (
              <form action={withdrawSuggestion.bind(null, studentId, x.id)}>
                <SubmitButton label="Withdraw" variant="link" />
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Published roadmaps fold away behind one click; a draft stays open because it needs checking. */
function MaybeCollapsed({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) return <div className="flex flex-col gap-4">{children}</div>;
  return (
    <details className="rounded-2xl border border-line p-3">
      <summary className="cursor-pointer text-sm font-bold text-link">See the full roadmap and suggest changes</summary>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </details>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

const EVENT_LABEL: Record<string, string> = {
  resume_uploaded: "Uploaded a resume",
  profile_confirmed: "Confirmed their profile",
  questions_answered: "Answered the year questions",
  roadmap_drafted: "First roadmap drafted",
  roadmap_published: "Roadmap published",
  roadmap_approved: "Roadmap approved and sent to the student",
  roadmap_accepted: "Student accepted the roadmap",
  suggestion_accepted: "Accepted a suggestion",
  session_goal: "Goal",
  session_action: "Action",
  session_course_change: "Course change",
  session_skill: "Skill",
  session_interest: "Interest",
  session_concern: "Concern",
  session_advice: "Key advice",
};
function eventLabel(type: string, payload: { text?: string }) {
  const label = EVENT_LABEL[type] ?? type;
  return payload.text ? `${label}: ${payload.text}` : label;
}

function roadmapNote(status: string | undefined, name: string) {
  if (status === "draft") return `Draft. ${name} can't see this until you approve it.`;
  if (status === "awaiting_student") return `Approved. Waiting for ${name} to accept it.`;
  if (status === "published") return `Accepted by you both. This is ${name}'s roadmap.`;
  return `${name} hasn't finished onboarding yet.`;
}
