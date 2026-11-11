import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { Bar, Panel, Pill } from "@/components/student/ui";
import { requireRole } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { rewardsFor, type RewardStatus } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { claimReward, deleteMoment } from "../actions";
import { MomentUpload } from "./MomentUpload";

export const metadata = { title: "Rewards · Melon" };

type Claim = { reward_id: string; code: string; status: string };
type Moment = { id: string; storage_path: string; caption: string | null; created_at: string };

const UNIT: Record<string, [string, string]> = {
  sessions: ["appointment", "appointments"],
  events: ["event", "events"],
  streak_weeks: ["week", "weeks"],
};

export default async function RewardsPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [rewards, { data: sp }, { data: claimRows }, { data: momentRows }] = await Promise.all([
    rewardsFor(supabase, profile.id),
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase.from("reward_claims").select("reward_id, code, status").eq("student_id", profile.id),
    supabase.from("student_moments").select("id, storage_path, caption, created_at").eq("student_id", profile.id).order("created_at", { ascending: false }),
  ]);
  const claims = new Map(((claimRows ?? []) as Claim[]).map((c) => [c.reward_id, c]));
  const moments = (momentRows ?? []) as Moment[];
  const { data: signed } = moments.length
    ? await supabase.storage.from("moments").createSignedUrls(moments.map((m) => m.storage_path), 3600)
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight sm:text-3xl">Your rewards</h1>
        <p className="mt-1 text-ink-2">No points. You earn real swag by reaching milestones, and the career center hands it to you.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {rewards.all.map((r) => (
          <RewardCard key={r.id} reward={r} claim={claims.get(r.id)} />
        ))}
        {!rewards.all.length && <p className="text-sm text-muted">Your career center hasn&apos;t set up rewards yet.</p>}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="text-lg font-extrabold">Share a moment (optional)</h2>
          <span className="text-sm text-ink-2">
            Snap a photo at an event for your semester story. Only you and your advisor or coach see it. This is a demo, so pick a photo
            without other people&apos;s faces.
          </span>
          {moments.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {moments.map((m) => (
                <figure key={m.id} className="flex flex-col gap-1">
                  {urlFor.get(m.storage_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlFor.get(m.storage_path) ?? undefined} alt={m.caption ?? "Event photo"} className="aspect-square w-full rounded-[14px] object-cover" />
                  ) : (
                    <div className="aspect-square w-full rounded-[14px] bg-soft" />
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
          ) : (
            <div className="flex h-[120px] items-center justify-center rounded-[14px] border-2 border-dashed border-[#E39AA6] font-bold text-[#7A2433]">No photo yet</div>
          )}
          <MomentUpload studentId={profile.id} />
        </Panel>
        <Panel>
          <h2 className="text-lg font-extrabold">How it works</h2>
          {[
            "Show up: appointments, events, workshops and steps you finish all count.",
            "Hit a milestone and it unlocks right away.",
            "Claim it, then pick it up at the career center. Melon pays for it.",
          ].map((t, i) => (
            <div key={t} className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3 text-sm">
              <b className="w-6">{i + 1}</b>
              <span>{t}</span>
            </div>
          ))}
        </Panel>
      </div>
    </main>
  );
}

function RewardCard({ reward: r, claim }: { reward: RewardStatus; claim?: Claim }) {
  const [one, many] = UNIT[r.rule.kind] ?? ["step", "steps"];
  const almost = !r.unlocked && r.need - r.have <= 1;
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-[22px] p-5 ${r.unlocked ? "bg-ink text-white" : "border border-line bg-white/95"}`}>
      <span className={`flex size-14 items-center justify-center rounded-2xl ${r.unlocked ? "bg-lime/20 text-lime" : "bg-soft text-ink"}`}>
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      </span>
      <span className="self-start">
        {r.unlocked ? <Pill tone="lime">Unlocked</Pill> : almost ? <Pill tone="warn">Almost yours</Pill> : <Pill>Keep going</Pill>}
      </span>
      <b className="text-xl">{r.name}</b>
      <span className={`text-sm ${r.unlocked ? "text-[#C9D4CE]" : "text-muted"}`}>{r.description}</span>
      {!r.unlocked && (
        <>
          <Bar pct={(r.have / r.need) * 100} color="var(--color-melon)" />
          <b className="text-sm">
            {r.have} of {r.need} {r.need === 1 ? one : many}
          </b>
        </>
      )}
      {r.unlocked &&
        (claim ? (
          <>
            <span className="self-start rounded-[10px] bg-white/10 px-3 py-2 font-mono text-xl font-extrabold tracking-[.12em]">{claim.code}</span>
            <span className="text-sm text-[#C9D4CE]">
              {claim.status === "picked_up" ? "Picked up. Enjoy!" : "Show this at the Career Center front desk · Mon–Fri, 9–5"}
            </span>
          </>
        ) : (
          <form action={claimReward.bind(null, r.id)}>
            <button className="rounded-full bg-lime px-[18px] py-2.5 text-sm font-extrabold text-ink">Claim it</button>
          </form>
        ))}
    </div>
  );
}
