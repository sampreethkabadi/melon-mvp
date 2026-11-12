import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Flag } from "lucide-react";
import { Backdrop } from "@/components/Backdrop";
import { requireRole } from "@/lib/auth";
import { shortDate, shortTerm } from "@/lib/format";
import { milestoneKey, pastTense, plannedFor, tasksFor, winLabel } from "@/lib/roadmap/milestones";
import { semestersFor, termOfDate } from "@/lib/roadmap/road";
import { currentSemester } from "@/lib/roadmap/semester";
import { loadRoadmap } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Milestone · Melon" };

// One flag on the road: what it is, and the action items behind it. Opened from a flag's "See details".

export default async function MilestonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { interests, steps, pinned, year, gradTerm } = await loadRoadmap(supabase, profile.id);
  const sem = currentSemester();
  const main = pinned[0];

  let title: string;
  let term: string;
  let state: "done" | "now" | "planned";
  let when: string | null = null;
  let note: string | null = null;
  let key: string | null;
  let generic: string[] = [];
  let mine = false;

  const planned = /^planned-(\d+)-([a-z]+)$/.exec(id);
  if (planned) {
    const slots = semestersFor(year, gradTerm, sem.term);
    const k = Number(planned[1]);
    const m = plannedFor(k, slots.length).find((x) => x.key === planned[2]);
    if (!m || !slots[k]) notFound();
    title = m.path && main ? m.title.replace("your path", main.name) : m.title;
    term = slots[k].term;
    key = m.key;
    state = term === sem.term ? "now" : "planned";
    generic = m.tasks;
    // Already done? Then this page is that flag's page.
    const won = steps.find((s) => s.status === "done" && s.title.toLowerCase() === pastTense(title).toLowerCase());
    if (won) {
      title = won.title;
      state = "done";
    }
  } else {
    const item = steps.find((s) => s.id === id);
    if (!item || item.status !== "done") notFound();
    title = winLabel(item);
    term = item.term ?? (item.completed_at ? termOfDate(item.completed_at) : sem.term);
    key = milestoneKey(item, main?.name);
    state = "done";
    when = item.completed_at ? shortDate(item.completed_at.slice(0, 10)) : null;
    note = (item.outcomes ?? []).filter(Boolean).join(" · ") || item.description || null;
    mine = item.source === "student" && !key;
  }

  const tasks = tasksFor(key, steps, term);
  const did = tasks.filter((t) => t.status === "done");
  const accent = state === "done" ? "var(--color-done)" : state === "now" ? "var(--school)" : "#9AA49F";

  return (
    <main className="relative mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <Link href={`/student/roadmap?open=${encodeURIComponent(term)}`} className="flex items-center gap-1.5 self-start text-sm font-bold text-link">
        <ArrowLeft size={16} aria-hidden="true" />
        Your road
      </Link>

      <section className="anim-fade-up flex flex-col gap-4 rounded-[28px] border-2 bg-white/95 p-6" style={{ borderColor: accent }}>
        <div className="flex items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: accent }}>
            <Flag size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[.08em]" style={{ color: accent }}>
              {shortTerm(term)} · {state === "done" ? `Done${when ? ` ${when}` : ""}` : state === "now" ? "This semester" : "Planned"}
              {mine ? " · added by you" : ""}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{title}</h1>
          </div>
        </div>
        {state === "done" && did.length > 0 && (
          <p className="rounded-2xl bg-done-bg px-4 py-3 font-bold text-done-ink">
            You finished {did.length === 1 ? "an action item" : `all ${did.length} action items`} to get here. Nice work.
          </p>
        )}
        {state === "done" && note && <p className="text-ink-2">{note}</p>}
        {state === "now" && <p className="text-ink-2">Finish the action items below, then mark it done on your road.</p>}
        {state === "planned" && <p className="text-ink-2">What {shortTerm(term)} usually holds. It turns real on your road when you do it.</p>}
      </section>

      {(tasks.length > 0 || generic.length > 0) && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-lg font-extrabold">{state === "done" ? "What you did to get here" : "Action items"}</h2>
          {tasks.length > 0
            ? tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/student/tasks/${t.id}`}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:border-ink ${t.status === "done" ? "border-transparent bg-done-bg" : "border-line bg-white/95"}`}
                >
                  <span
                    className={`inline-flex size-[26px] shrink-0 items-center justify-center rounded-lg ${t.status === "done" ? "bg-done text-white" : "border-2 border-[#9AA49F] bg-white"}`}
                  >
                    {t.status === "done" && <Check size={15} strokeWidth={3.2} aria-hidden="true" />}
                  </span>
                  <span className={`min-w-0 flex-1 text-[15px] font-bold ${t.status === "done" ? "text-done-ink" : ""}`}>{t.title}</span>
                  <span className="shrink-0 text-[13px] font-semibold text-muted">
                    {t.status === "done" && t.completed_at ? shortDate(t.completed_at.slice(0, 10)) : t.due_date ? shortDate(t.due_date) : ""}
                  </span>
                </Link>
              ))
            : generic.map((g) => (
                <div
                  key={g}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-white/70 px-4 py-3 text-[15px] font-semibold text-ink-2"
                >
                  <span className="inline-flex size-[26px] shrink-0 rounded-lg border-2 border-dashed border-[#B9C1BC]" />
                  {g}
                </div>
              ))}
        </section>
      )}

      {state === "now" && (
        <Link href="/student/tasks" className="self-start text-sm font-bold text-link">
          Open Action items →
        </Link>
      )}
    </main>
  );
}
