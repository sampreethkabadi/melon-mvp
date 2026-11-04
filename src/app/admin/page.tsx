import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IntegrationToggle } from "./IntegrationToggle";

export const metadata = { title: "Integrations · Melon" };

const INFO: Record<string, { name: string; what: string; mark: string; color: string }> = {
  handshake: { name: "Handshake", what: "Appointments, events and advisor assignments", mark: "H", color: "#1D5F8A" },
  teams: { name: "Microsoft Teams", what: "Meeting links and transcript import", mark: "T", color: "#4E5BA6" },
  calendar: { name: "Calendar", what: "Adds sessions and deadlines to calendars", mark: "C", color: "#2F8F5B" },
  stellic: { name: "Stellic", what: "Degree audit and courses", mark: "S", color: "#B45309" },
  canvas: { name: "Canvas", what: "Course activity (later)", mark: "Cv", color: "#B42318" },
};
const ORDER = ["handshake", "teams", "calendar", "stellic", "canvas"];

export default async function AdminPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("integrations").select("id, system, enabled, status_note");
  const rows = (data ?? []).sort((a, b) => ORDER.indexOf(a.system) - ORDER.indexOf(b.system));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          Admin · {profile.schools?.name}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Integrations</h1>
        <p className="mt-1 text-ink-2">
          Turn each school system on or off. Melon still works with any of them off; it just asks students a bit more.
        </p>
      </div>
      {rows.length === 0 && (
        <p className="rounded-2xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-ink">
          No integrations yet. Run the setup data step from the README.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const info = INFO[r.system];
          return (
            <li key={r.id} className="flex items-center gap-4 rounded-2xl border border-line bg-white px-4 py-3">
              <span
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl font-extrabold text-white"
                style={{ background: info.color }}
              >
                {info.mark}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b>{info.name}</b>
                <span className="text-sm text-muted">{info.what}</span>
                <span className={`text-sm ${r.enabled ? "text-done-ink" : "text-muted"}`}>
                  {r.enabled ? `On · ${r.status_note ?? "Connected"}` : "Off"}
                </span>
              </span>
              <IntegrationToggle id={r.id} label={info.name} enabled={r.enabled} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
