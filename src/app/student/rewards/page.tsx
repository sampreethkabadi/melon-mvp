import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { getProgress, rewardProgress, type RewardRow } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { claimReward, deleteMoment } from "../actions";
import { MomentUpload } from "./MomentUpload";

export const metadata = { title: "Rewards · Melon" };

type Claim = { reward_id: string; code: string; status: string };
type Moment = { id: string; storage_path: string; caption: string | null; created_at: string };

const UNIT: Record<string, [string, string]> = {
  sessions: ["session", "sessions"],
  events: ["event", "events"],
  streak_weeks: ["week", "weeks"],
};

export default async function RewardsPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [progress, { data: sp }, { data: rewardRows }, { data: claimRows }, { data: momentRows }] = await Promise.all([
    getProgress(supabase, profile.id),
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase.from("rewards").select("id, name, description, rule, sort").eq("active", true).order("sort"),
    supabase.from("reward_claims").select("reward_id, code, status").eq("student_id", profile.id),
    supabase.from("student_moments").select("id, storage_path, caption, created_at").eq("student_id", profile.id).order("created_at", { ascending: false }),
  ]);

  const rewards = ((rewardRows ?? []) as RewardRow[]).map((r) => rewardProgress(r, progress));
  const claims = new Map(((claimRows ?? []) as Claim[]).map((c) => [c.reward_id, c]));
  const moments = (momentRows ?? []) as Moment[];
  const { data: signed } = moments.length
    ? await supabase.storage.from("moments").createSignedUrls(moments.map((m) => m.storage_path), 3600)
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const unlocked = rewards.filter((r) => r.unlocked).length;

  return (
    <main className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          {progress.sem.term} · {progress.streakWeeks ? `${progress.streakWeeks}-week streak` : "start a streak this week"}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Rewards</h1>
        <p className="mt-1 text-ink-2">
          Real swag for real milestones. {unlocked ? `You've unlocked ${unlocked} of ${rewards.length}.` : "Your first one is closer than you think."}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {rewards.map((r) => {
          const claim = claims.get(r.id);
          const [one, many] = UNIT[r.rule.kind] ?? ["step", "steps"];
          const pct = Math.round((r.have / r.need) * 100);
          return (
            <div
              key={r.id}
              className={`flex flex-col gap-3 rounded-3xl bg-white/95 p-5 ${r.unlocked ? "border-2 shadow-[0_10px_30px_rgba(20,33,27,.10)]" : "border border-line"}`}
              style={r.unlocked ? { borderColor: "var(--school)" } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <b className="text-lg font-extrabold">{r.name}</b>
                {r.unlocked && <span className="rounded-full bg-lime px-2.5 py-0.5 text-xs font-extrabold text-ink">Unlocked</span>}
              </div>
              <p className="text-sm text-ink-2">{r.description}</p>
              <div>
                <div className="h-2.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={r.have} aria-valuemax={r.need} aria-label={r.name}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.unlocked ? "var(--color-done)" : "var(--school)" }} />
                </div>
                <p className="mt-1 text-xs font-bold text-muted">
                  {r.have} of {r.need} {r.need === 1 ? one : many}
                  {!r.unlocked && ` · ${r.need - r.have} to go`}
                </p>
              </div>
              <div className="mt-auto">
                {claim ? (
                  <div className="rounded-2xl bg-soft p-3">
                    <p className="text-xs font-bold text-muted">{claim.status === "picked_up" ? "Picked up" : "Your pickup code"}</p>
                    <p className="font-mono text-lg font-extrabold tracking-wider">{claim.code}</p>
                    {claim.status !== "picked_up" && <p className="text-xs text-muted">Show this at the career center front desk.</p>}
                  </div>
                ) : r.unlocked ? (
                  <form action={claimReward.bind(null, r.id)}>
                    <SubmitButton label="Claim it" />
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
        {!rewards.length && <p className="text-sm text-muted">Your career center hasn&apos;t set up rewards yet.</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-white/95 p-5">
        <div>
          <h2 className="text-lg font-extrabold">Moments</h2>
          <p className="text-sm text-muted">
            Optional: a photo from a career fair or event. Only you and your advisor or coach can see these. This is a demo, so use a
            photo without other people&apos;s faces in it.
          </p>
        </div>
        <MomentUpload studentId={profile.id} />
        {moments.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {moments.map((m) => (
              <figure key={m.id} className="flex flex-col gap-1">
                {urlFor.get(m.storage_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFor.get(m.storage_path) ?? undefined} alt={m.caption ?? "Event photo"} className="aspect-square w-full rounded-2xl object-cover" />
                ) : (
                  <div className="aspect-square w-full rounded-2xl bg-soft" />
                )}
                <figcaption className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="truncate">{m.caption ?? shortDate(m.created_at)}</span>
                  <form action={deleteMoment.bind(null, m.id)}>
                    <SubmitButton label="Remove" variant="link" />
                  </form>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
