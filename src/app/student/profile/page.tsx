import { BellRing, CalendarDays, CalendarPlus, Compass, FileText, GraduationCap, LogOut, Mail, ShieldCheck } from "lucide-react";
import { Backdrop } from "@/components/Backdrop";
import { Avatar, initialsOf, ROLE_COLOR, roleLabel } from "@/components/student/Avatar";
import { requireRole } from "@/lib/auth";
import { longDate, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { YEAR_LABEL, type ClassYear, type Role } from "@/lib/types";

export const metadata = { title: "Profile · Melon" };

type Staff = { id: string; full_name: string; role: Role; email: string; title: string | null };

// Who to go to for what. Coaches help with careers; advisors with courses and graduation.
const TOPICS: Record<string, string[]> = {
  coach: ["Resumes", "Interviews", "LinkedIn", "Career fair", "Internships"],
  advisor: ["Courses", "Graduation requirements", "Majors and minors", "Academic policy"],
};

export default async function ProfilePage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: team }, { data: appts }, { data: pinnedRows }] = await Promise.all([
    supabase.from("student_profiles").select("class_year, majors, minors, expected_grad_term, interests, resume_path, resume_parsed, updated_at").eq("user_id", profile.id).maybeSingle(),
    supabase.from("staff_assignments").select("staff:profiles!staff_assignments_staff_id_fkey(id, full_name, role, email, title)").eq("student_id", profile.id).eq("active", true),
    supabase.from("appointments").select("starts_at, type, staff_id").eq("student_id", profile.id).eq("status", "scheduled").order("starts_at"),
    supabase.from("roadmap_paths").select("name").eq("student_id", profile.id).eq("status", "pinned").order("sort"),
  ]);

  const staff = ((team ?? []) as unknown as Array<{ staff: Staff | null }>)
    .map((t) => t.staff)
    .filter((s): s is Staff => Boolean(s))
    .sort((a, b) => (a.role === "coach" ? -1 : 1) - (b.role === "coach" ? -1 : 1));
  const year = (sp?.class_year ?? null) as ClassYear | null;
  const majors = (sp?.majors ?? []) as string[];
  const minors = (sp?.minors ?? []) as string[];
  const study = [year && YEAR_LABEL[year], [majors.join(" and "), minors.length ? `${minors.join(" and ")} minor` : ""].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const pinned = (pinnedRows ?? []).map((p) => p.name as string);
  const nextWith = (id: string) => (appts ?? []).find((a) => a.staff_id === id) as { starts_at: string; type: string } | undefined;

  return (
    <main className="relative mx-auto flex max-w-[920px] flex-col gap-7 px-4 py-8 sm:px-6">
      <Backdrop interests={(sp?.interests ?? []) as string[]} />

      <section className="anim-fade-up flex flex-wrap items-center gap-6 rounded-[28px] border border-line bg-white/95 p-6 sm:p-7">
        <span role="img" aria-label={profile.full_name} className="inline-flex size-24 shrink-0 items-center justify-center rounded-full bg-lime text-[34px] font-extrabold text-ink">
          {initialsOf(profile.full_name)}
        </span>
        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <h1 className="text-[28px] font-extrabold tracking-tight sm:text-[32px]">{profile.full_name}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[15px] text-ink-2">
            {study && (
              <span className="flex items-center gap-1.5">
                <GraduationCap size={17} aria-hidden="true" />
                {study}
              </span>
            )}
            {sp?.expected_grad_term && (
              <span className="flex items-center gap-1.5">
                <CalendarDays size={17} aria-hidden="true" />
                Graduates {sp.expected_grad_term}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Compass size={17} aria-hidden="true" />
              {pinned.length ? `Pinned: ${pinned.join(" and ")}` : "No path pinned yet"}
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-[22px] font-extrabold">Your team</h2>
        {staff.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {staff.map((s, i) => {
              const next = nextWith(s.id);
              const color = ROLE_COLOR[s.role] ?? ROLE_COLOR.advisor;
              const first = s.full_name.replace(/^Dr\.?\s+/i, "").split(" ")[0];
              return (
                <article key={s.id} className="anim-fade-up flex flex-col gap-4 rounded-3xl border border-line bg-white/95 p-6" style={{ animationDelay: `${(i + 1) * 70}ms` }}>
                  <div className="flex items-center gap-4">
                    <Avatar name={s.full_name} role={s.role} size={72} badge={false} />
                    <div className="min-w-0">
                      <b className="block text-xl">{s.full_name}</b>
                      <span className="text-sm font-bold" style={{ color: color.bg }}>
                        {roleLabel(s.role)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-[.08em] text-muted">Go to {first} for</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(TOPICS[s.role] ?? []).map((t) => (
                        <span key={t} className="rounded-full px-2.5 py-1 text-[13px] font-bold" style={{ background: color.tint, color: color.bg }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="flex items-center gap-2 rounded-2xl bg-soft px-3.5 py-3 text-sm text-ink-2">
                    <CalendarDays size={17} className="shrink-0" aria-hidden="true" />
                    {next ? (
                      <span>
                        <b className="text-ink">Next:</b> {next.type} · {longDate(next.starts_at)}
                      </span>
                    ) : (
                      "Nothing booked with them yet"
                    )}
                  </p>
                  <div className="mt-auto flex gap-2.5">
                    <a
                      href={`mailto:${s.email}?subject=${encodeURIComponent("Booking an appointment")}`}
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-extrabold text-white"
                    >
                      <CalendarPlus size={17} aria-hidden="true" />
                      Book
                    </a>
                    <a
                      href={`mailto:${s.email}`}
                      aria-label={`Email ${s.full_name}`}
                      title={s.email}
                      className="inline-flex size-12 items-center justify-center rounded-full border border-line bg-white hover:border-ink"
                    >
                      <Mail size={18} aria-hidden="true" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-muted">No advisor or coach yet. The career center assigns one.</p>
        )}
      </section>

      <section className="flex flex-col overflow-hidden rounded-3xl border border-line bg-white/95">
        <Row icon={<FileText size={20} aria-hidden="true" />} label="Resume" value={sp?.resume_path || sp?.resume_parsed ? `On file · updated ${shortDate(String(sp.updated_at).slice(0, 10))}` : "Not uploaded yet"} />
        <Row icon={<ShieldCheck size={20} aria-hidden="true" />} label="Privacy and recording" value="Your team asks before recording" />
        <Row icon={<BellRing size={20} aria-hidden="true" />} label="Reminders" value="Email, 3 days and 1 day before" last />
      </section>

      <form action="/auth/signout" method="post">
        <button className="flex items-center gap-2 text-sm font-bold text-muted hover:text-ink">
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </form>
    </main>
  );
}

function Row({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex min-h-16 flex-wrap items-center gap-x-3.5 gap-y-1 px-5 py-3 ${last ? "" : "border-b border-soft"}`}>
      {icon}
      <b className="flex-1 text-[15px]">{label}</b>
      <span className="text-sm text-muted">{value}</span>
    </div>
  );
}

export const dynamic = "force-dynamic";
