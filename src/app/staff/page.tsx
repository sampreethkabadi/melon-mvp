import { appNow } from "@/lib/clock";
import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { firstName, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";

export const metadata = { title: "Today · Melon" };

const TZ = "America/Indiana/Indianapolis";

type Appt = {
  id: string;
  starts_at: string;
  type: string;
  modality: string;
  location: string | null;
  student_id: string;
  student: { full_name: string } | null;
};
type Assigned = {
  kind: string;
  student: { id: string; full_name: string; student_profiles: { class_year: string | null; majors: string[] } | null } | null;
};

export default async function StaffToday() {
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();

  const now = appNow();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - 12 * 3600 * 1000);
  const end = new Date(start.getTime() + 48 * 3600 * 1000);

  const [{ data: appts }, { data: assigned }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, type, modality, location, student_id, student:profiles!appointments_student_id_fkey(full_name)")
      .eq("staff_id", profile.id)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at"),
    supabase
      .from("staff_assignments")
      .select(
        "kind, student:profiles!staff_assignments_student_id_fkey(id, full_name, student_profiles(class_year, majors))",
      )
      .eq("staff_id", profile.id)
      .eq("active", true),
  ]);

  const todayKey = dayKey(now);
  const today = ((appts ?? []) as unknown as Appt[]).filter((a) => dayKey(new Date(a.starts_at)) === todayKey);
  const students = ((assigned ?? []) as unknown as Assigned[]).filter((a) => a.student);
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" }).format(now);

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={["data", "soft"]} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          {dateLabel}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hi {firstName(profile.full_name)}</h1>
        <p className="mt-1 text-ink-2">
          {today.length} session{today.length === 1 ? "" : "s"} today · {students.length} student
          {students.length === 1 ? "" : "s"} assigned to you
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-3xl border-2 bg-white/95 p-6 shadow-sm" style={{ borderColor: "var(--school)" }}>
          <h2 className="text-lg font-extrabold">Today&apos;s sessions</h2>
          {today.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {today.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
                  <span className="w-20 font-extrabold tabular-nums">{time(a.starts_at)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b>{a.student?.full_name}</b>
                    <span className="text-sm text-muted">
                      {a.type} · {modalityLabel(a.modality)}
                      {a.location ? ` · ${a.location}` : ""}
                    </span>
                  </span>
                  <Link href={`/staff/students/${a.student_id}?appointment=${a.id}`} className="rounded-full bg-soft px-3 py-1 text-xs font-bold text-ink-2 hover:bg-line">
                    Open briefing
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No sessions today.</p>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-white/95 p-6">
          <h2 className="text-lg font-extrabold">Your students</h2>
          {students.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {students.map((a) => {
                const sp = a.student!.student_profiles;
                return (
                  <li key={a.student!.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                    <Link href={`/staff/students/${a.student!.id}`} className="font-bold hover:underline">
                      {a.student!.full_name}
                    </Link>
                    <span className="text-right text-sm text-muted">
                      {[sp?.class_year ? YEAR_LABEL[sp.class_year as ClassYear] : null, sp?.majors?.[0]].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No students assigned yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
function time(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function modalityLabel(m: string) {
  return m === "teams" ? "Teams" : m === "melon_call" ? "Melon call" : "In person";
}
