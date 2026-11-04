import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markChangesSeen, setItemDone } from "../actions";

export const metadata = { title: "Roadmap · Melon" };

type Item = { id: string; title: string; description: string | null; rationale: string | null; term: string | null; kind: string; status: string; path_id: string | null };

export default async function RoadmapPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: roadmap }, { data: sp }, { data: pathRows }, { data: itemRows }, { data: changes }, { data: sessions }] = await Promise.all([
    supabase.from("roadmaps").select("status").eq("student_id", profile.id).maybeSingle(),
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase.from("roadmap_paths").select("id, name, reason, first_job, status").eq("student_id", profile.id).neq("status", "dropped").order("sort"),
    supabase.from("roadmap_items").select("id, title, description, rationale, term, kind, status, path_id").eq("student_id", profile.id).order("sort"),
    supabase.from("roadmap_changes").select("id, summary").eq("student_id", profile.id).is("seen_at", null).order("created_at", { ascending: false }),
    supabase.from("sessions").select("id, created_at, insights(kind, status, payload)").eq("student_id", profile.id).eq("status", "reviewed").order("created_at", { ascending: false }).limit(1),
  ]);

  const published = roadmap?.status === "published";
  if (!published) {
    return (
      <main className="relative mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6">
        <Backdrop interests={sp?.interests ?? []} />
        <h1 className="text-3xl font-extrabold tracking-tight">Your roadmap</h1>
        <p className="rounded-3xl border border-line bg-white/95 p-6 text-ink-2">Your advisor or coach reviews every roadmap first. It&apos;ll appear here once they&apos;ve approved it.</p>
      </main>
    );
  }

  const items = (itemRows ?? []) as Item[];
  const paths = pathRows ?? [];
  const live = items.filter((i) => i.status !== "skipped");
  const done = live.filter((i) => i.status === "done").length;
  const general = items.filter((i) => !i.path_id || !paths.some((p) => p.id === i.path_id));
  const added = (changes ?? []).flatMap((c) => ((c.summary as { added?: string[] }).added ?? []));
  const latest = ((sessions ?? [])[0] as unknown as { insights: Array<{ kind: string; payload: { text: string } }> } | undefined)?.insights.find((i) => i.kind === "summary");

  return (
    <main className="relative mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your roadmap</h1>
        <p className="mt-1 text-ink-2">
          {done} of {live.length} done. Approved by your advisor or coach.
        </p>
      </div>

      {(changes ?? []).length > 0 && (
        <section className="flex flex-col items-start gap-2 rounded-3xl border-2 border-new bg-new-bg p-6">
          <h2 className="text-lg font-extrabold text-new-ink">{added.length ? "New since your last session" : "Your roadmap is ready"}</h2>
          {added.length > 0 && (
            <ul className="list-disc pl-5">
              {added.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <form action={markChangesSeen}>
            <SubmitButton label="Got it" variant="secondary" />
          </form>
        </section>
      )}

      {latest && (
        <section className="rounded-3xl border border-line bg-white/95 p-6">
          <h2 className="text-lg font-extrabold">From your latest session</h2>
          <p className="mt-1 text-ink-2">{latest.payload.text}</p>
        </section>
      )}

      {paths.map((path) => (
        <section key={path.id} className="flex flex-col gap-2 rounded-3xl border border-line bg-white/95 p-6">
          <h2 className="text-lg font-extrabold">{path.name}</h2>
          <p className="text-sm text-muted">
            {path.reason}
            {path.first_job && path.first_job !== path.name ? ` A first job could be ${path.first_job}.` : ""}
          </p>
          <Items items={items.filter((i) => i.path_id === path.id)} />
        </section>
      ))}

      {general.length > 0 && (
        <section className="flex flex-col gap-2 rounded-3xl border border-line bg-white/95 p-6">
          <h2 className="text-lg font-extrabold">Whichever path you take</h2>
          <Items items={general} />
        </section>
      )}
    </main>
  );
}

function Items({ items }: { items: Item[] }) {
  if (!items.length) return <p className="text-sm text-muted">Nothing here yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const done = item.status === "done";
        return (
          <li key={item.id} className={`flex items-start justify-between gap-3 rounded-2xl border border-line p-3 ${done ? "bg-done-bg/50" : "bg-white"}`}>
            <div className="min-w-0">
              <p className={`font-semibold ${done ? "line-through" : ""}`}>{item.title}</p>
              <p className="text-sm text-muted">{item.term}</p>
              {item.description && <p className="mt-1 text-sm text-ink-2">{item.description}</p>}
              {item.rationale && <p className="mt-1 text-sm text-muted">Why: {item.rationale}</p>}
            </div>
            <form action={setItemDone.bind(null, item.id, !done)} className="shrink-0">
              <SubmitButton label={done ? "Undo" : "Mark done"} variant="secondary" />
            </form>
          </li>
        );
      })}
    </ul>
  );
}
