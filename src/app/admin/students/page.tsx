import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reassignAdvisor } from "../assignments";

export const metadata = { title: "Advisors · Melon" };

export default async function AdminStudents() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: advisors }, { data: students }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "advisor").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
    supabase.from("staff_assignments").select("student_id, staff_id").eq("kind", "advisor").eq("active", true),
  ]);
  const advisorOf = new Map((assignments ?? []).map((a) => [a.student_id, a.staff_id]));
  const load = (id: string) => (assignments ?? []).filter((a) => a.staff_id === id).length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          Admin · {profile.schools?.name}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Advisors</h1>
        <p className="mt-1 text-ink-2">New sign-ups go to the advisor with the fewest students, at random when there&apos;s a tie.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {(advisors ?? []).map((a) => (
          <li key={a.id} className="rounded-2xl border border-line bg-white px-4 py-3">
            <b>{a.full_name}</b>
            <p className="text-2xl font-extrabold tabular-nums">{load(a.id)}</p>
            <p className="text-sm text-muted">students</p>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2">
        {(students ?? []).map((s) => (
          <li key={s.id}>
            <form action={reassignAdvisor.bind(null, s.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-2">
              <b>{s.full_name}</b>
              <span className="flex items-center gap-2">
                <select name="advisor" defaultValue={advisorOf.get(s.id) ?? ""} required aria-label={`Advisor for ${s.full_name}`} className="rounded-xl border border-line bg-white px-2 py-1.5 text-sm">
                  <option value="" disabled>
                    No advisor
                  </option>
                  {(advisors ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name}
                    </option>
                  ))}
                </select>
                <SubmitButton label="Save" variant="secondary" />
              </span>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
