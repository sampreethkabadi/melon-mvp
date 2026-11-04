import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { plural, shortDate, shortTerm } from "@/lib/format";
import { KIND_LABEL, planGroups, type PlanItem } from "@/lib/roadmap/plan";
import { currentSemester } from "@/lib/roadmap/semester";
import { createClient } from "@/lib/supabase/server";
import { removeStep, setItemDone } from "../actions";

export const metadata = { title: "Action items · Melon" };

type Item = PlanItem & { source: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ more?: string }> }) {
  const { more } = await searchParams;
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: roadmap }, { data: sp }, { data: itemRows }, { data: pathRows }] = await Promise.all([
    supabase.from("roadmaps").select("status").eq("student_id", profile.id).maybeSingle(),
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("roadmap_items")
      .select("id, title, description, term, kind, status, path_id, due_date, firm, sort, source, resource_id, completed_at")
      .eq("student_id", profile.id)
      .order("sort"),
    supabase.from("roadmap_paths").select("id, name").eq("student_id", profile.id),
  ]);
  const interests = sp?.interests ?? [];

  if (roadmap?.status !== "published") {
    return (
      <main className="relative mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6">
        <Backdrop interests={interests} />
        <h1 className="text-3xl font-extrabold tracking-tight">Action items</h1>
        <p className="rounded-3xl border border-line bg-white/95 p-6 text-ink-2">
          Your steps show up here once your advisor or coach approves your first roadmap.
        </p>
      </main>
    );
  }

  const sem = currentSemester();
  const items = (itemRows ?? []) as Item[];
  const paths = new Map(((pathRows ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const g = planGroups(items, sem);
  const showMore = more === "1";
  const firmSoon = g.open.filter((i) => i.firm && i.due_date).slice(0, 1)[0];

  return (
    <main className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          {sem.term} · week {sem.week} of {sem.weeks}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Action items</h1>
        <p className="mt-1 text-ink-2">
          {g.focus.length
            ? `${plural(g.focus.length, "thing")} to focus on now. Finish one and the next moves up.`
            : "Nothing open right now. Your next session will add more."}
        </p>
      </div>

      {firmSoon && (
        <p className="rounded-2xl bg-firm-bg px-4 py-3 text-sm font-semibold text-firm">
          Firm date: {firmSoon.title} · {shortDate(firmSoon.due_date!)}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Now</h2>
        {g.focus.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {g.focus.map((i) => (
              <ItemCard key={i.id} item={i} pathName={i.path_id ? paths.get(i.path_id) : undefined} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-done-bg px-4 py-3 text-sm font-semibold text-done-ink">Everything here is done. Nice work.</p>
        )}
        {g.laterThisTerm.length > 0 &&
          (showMore ? (
            <>
              <h3 className="mt-2 text-sm font-extrabold uppercase tracking-widest text-muted">Also this semester</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {g.laterThisTerm.map((i) => (
                  <ItemCard key={i.id} item={i} pathName={i.path_id ? paths.get(i.path_id) : undefined} />
                ))}
              </div>
              <Link href="/student/tasks" className="text-sm font-semibold text-link">
                Show just my top 3
              </Link>
            </>
          ) : (
            <Link href="/student/tasks?more=1" className="self-start rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-ink">
              +{g.laterThisTerm.length} more this semester
            </Link>
          ))}
      </section>

      {g.later.length > 0 && (
        <section className="flex flex-col gap-2 rounded-3xl border border-line bg-white/90 p-5">
          <h2 className="text-lg font-extrabold">Coming up later</h2>
          <ul className="flex flex-col divide-y divide-line">
            {g.later.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span>
                  <b>{i.title}</b>
                  <span className="text-muted"> · {KIND_LABEL[i.kind] ?? i.kind}</span>
                </span>
                <span className="text-xs font-bold text-muted">{shortTerm(i.term)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {g.done.length > 0 && (
        <section className="flex flex-col gap-2 rounded-3xl border border-line bg-white/90 p-5">
          <h2 className="text-lg font-extrabold">Done ({g.done.length})</h2>
          <ul className="flex flex-col divide-y divide-line">
            {g.done.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="mr-2 font-bold text-done">✓</span>
                  {i.title}
                  {i.completed_at && <span className="text-muted"> · {shortDate(i.completed_at)}</span>}
                </span>
                <form action={setItemDone.bind(null, i.id, false)}>
                  <SubmitButton label="Undo" variant="link" />
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ItemCard({ item, pathName }: { item: Item; pathName?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
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
        {item.source === "student" && <span className="rounded-full bg-new-bg px-2 py-0.5 text-[11px] font-bold text-new-ink">You added</span>}
      </div>
      <b className="text-[15px] leading-snug">{item.title}</b>
      {item.description && <p className="text-xs text-muted">{item.description}</p>}
      <p className="text-xs text-muted">{pathName ? `For: ${pathName}` : "Counts for every path"}</p>
      <div className="mt-auto flex items-center gap-3">
        <form action={setItemDone.bind(null, item.id, true)}>
          <SubmitButton label="Mark done" variant="secondary" />
        </form>
        {item.source === "student" && (
          <form action={removeStep.bind(null, item.id)}>
            <SubmitButton label="Remove" variant="link" />
          </form>
        )}
      </div>
    </div>
  );
}
