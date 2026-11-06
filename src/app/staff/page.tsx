import { addDays, appNow, localDate, TZ } from "@/lib/clock";
import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { firstName, requireRole } from "@/lib/auth";
import { MeetingPrepCard } from "@/components/staff/MeetingPrepCard";
import { longDate, plural, timeOf } from "@/lib/format";
import { loadStudentRows } from "@/lib/staff/load";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Today · Melon" };

type Appt = {
  id: string;
  starts_at: string;
  type: string;
  modality: string;
  location: string | null;
  student_id: string;
  status: string;
};

export default async function StaffToday() {
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();
  const now = appNow();
  const today = localDate(now);
  const until = addDays(today, 8);

  const [{ data: appts, error: apptError }, rows, { count: reviews }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, type, modality, location, student_id, status")
      .eq("staff_id", profile.id)
      .gte("starts_at", `${addDays(today, -1)}T00:00:00Z`)
      .lt("starts_at", `${until}T12:00:00Z`)
      .order("starts_at"),
    loadStudentRows(supabase, profile.id),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("staff_id", profile.id).eq("status", "ready_for_review"),
  ]);
  if (apptError) throw new Error("Couldn't load your sessions. Try again.");

  const all = (appts ?? []) as Appt[];
  const todays = all.filter((a) => localDate(new Date(a.starts_at)) === today);
  const later = all.filter((a) => a.status === "scheduled" && localDate(new Date(a.starts_at)) > today && localDate(new Date(a.starts_at)) < until);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // The next meeting that hasn't happened opens on its own, so the prep is right there.
  const nextId = todays.find((a) => a.status === "scheduled" && a.starts_at >= now.toISOString())?.id ?? todays.find((a) => a.status === "scheduled")?.id;
  const urgent = rows.filter((r) => r.attention.some((a) => a.urgent)).length;
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" }).format(now);

  const card = (a: Appt, open: boolean, when: string) => {
    const row = byId.get(a.student_id);
    if (!row) return null;
    return <MeetingPrepCard key={a.id} appointment={a} row={row} today={today} open={open} when={when} />;
  };

  return (
    <main className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={["data", "soft"]} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          {dateLabel}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hi {firstName(profile.full_name)}</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile href="#today" value={todays.length} label={todays.length === 1 ? "meeting today" : "meetings today"} />
        <Tile href="/staff/reviews" value={reviews ?? 0} label={reviews === 1 ? "session to review" : "sessions to review"} strong={Boolean(reviews)} />
        <Tile href="/staff/students?show=attention" value={urgent} label={`of ${plural(rows.length, "student")} need you`} strong={urgent > 0} />
      </div>

      <section id="today" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="text-lg font-extrabold">Today&apos;s meetings</h2>
        {todays.length === 0 && <p className="rounded-2xl border border-line bg-white/95 p-4 text-sm text-muted">No meetings today.</p>}
        {todays.map((a) => card(a, a.id === nextId, timeOf(a.starts_at)))}
      </section>

      {later.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">Coming up this week</h2>
          {later.map((a) => card(a, false, `${longDate(a.starts_at)} · ${timeOf(a.starts_at)}`))}
        </section>
      )}
    </main>
  );
}

function Tile({ href, value, label, strong }: { href: string; value: number; label: string; strong?: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border bg-white/95 px-4 py-3 hover:border-ink ${strong ? "border-2" : "border-line"}`} style={strong ? { borderColor: "var(--school)" } : undefined}>
      <b className="block text-2xl font-extrabold tabular-nums">{value}</b>
      <span className="text-sm text-muted">{label}</span>
    </Link>
  );
}
