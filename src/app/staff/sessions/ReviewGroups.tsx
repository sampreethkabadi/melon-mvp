import { SubmitButton } from "@/components/SubmitButton";
import { INSIGHT_LABEL, type InsightKind } from "@/lib/sessions/types";
import { editInsight, reviewInsight } from "./actions";

type Segment = { id: string; idx: number; speaker: string; text: string };
export type ReviewInsight = { id: string; kind: InsightKind; status: string; payload: { text: string }; insight_evidence: { segment_id: string }[] };

const GROUPS: Array<{ title: string; note?: string; kinds: InsightKind[]; tone: string }> = [
  { title: "Action items", note: "These become steps on the student's roadmap. At most 2 per session go on now, and the rest are saved for later.", kinds: ["action", "course_change"], tone: "border-done/40 bg-done-bg/50" },
  { title: "Key points", note: "The student sees these as the highlights of the session.", kinds: ["summary", "advice", "goal", "interest", "skill"], tone: "border-new/40 bg-new-bg/50" },
  { title: "Only staff see these", kinds: ["concern"], tone: "border-line bg-soft" },
];

/** Action items and key points from a transcript, each with the lines behind it, to approve, edit or remove. */
export function ReviewGroups({ sessionId, insights, segments, editable, linkLines }: { sessionId: string; insights: ReviewInsight[]; segments: Segment[]; editable: boolean; linkLines: string }) {
  return (
    <>
      {GROUPS.map((group) => {
        const rows = insights.filter((i) => group.kinds.includes(i.kind));
        if (!rows.length) return null;
        return (
          <section key={group.title} className="flex flex-col gap-2">
            <div>
              <h3 className="font-extrabold">{group.title}</h3>
              {group.note && <p className="text-xs text-muted">{group.note}</p>}
            </div>
            {rows.map((insight) => (
              <Card key={insight.id} sessionId={sessionId} insight={insight} segments={segments} editable={editable} tone={group.tone} linkLines={linkLines} />
            ))}
          </section>
        );
      })}
    </>
  );
}

const STATUS: Record<string, string> = { accepted: "Approved", edited: "Edited and approved", rejected: "Removed" };

function Card({ sessionId, insight, segments, editable, tone, linkLines }: { sessionId: string; insight: ReviewInsight; segments: Segment[]; editable: boolean; tone: string; linkLines: string }) {
  const evidence = insight.insight_evidence
    .map((e) => segments.find((s) => s.id === e.segment_id))
    .filter((s): s is Segment => Boolean(s))
    .sort((a, b) => a.idx - b.idx);
  const removed = insight.status === "rejected";
  const decided = insight.status !== "proposed";
  return (
    <article className={`flex flex-col gap-1.5 rounded-2xl border p-3.5 ${removed ? "border-line bg-soft opacity-70" : tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-widest text-muted">{INSIGHT_LABEL[insight.kind]}</span>
        {decided && <span className="text-xs font-bold text-ink-2">{STATUS[insight.status]}</span>}
      </div>
      <p className={removed ? "text-muted line-through" : ""}>{insight.payload.text}</p>
      {evidence[0] && !removed && (
        <blockquote className="border-l-2 border-line pl-2 text-xs text-muted">
          {evidence[0].speaker === "student" ? "Student" : evidence[0].speaker === "staff" ? "Staff" : "Unknown"}: &ldquo;{evidence[0].text}&rdquo;
        </blockquote>
      )}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        Evidence:
        {evidence.map((s) => (
          <a key={s.id} href={`${linkLines}${s.id}`} className="font-semibold text-link">
            line {s.idx + 1}
          </a>
        ))}
      </p>
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          {decided ? (
            <form action={reviewInsight.bind(null, sessionId, insight.id, "proposed")}>
              <SubmitButton label="Undo" variant="link" />
            </form>
          ) : (
            <>
              <form action={reviewInsight.bind(null, sessionId, insight.id, "accepted")}>
                <SubmitButton label="Approve" variant="secondary" />
              </form>
              <form action={reviewInsight.bind(null, sessionId, insight.id, "rejected")}>
                <SubmitButton label="Remove" variant="link" />
              </form>
            </>
          )}
          {!removed && (
            <details className="w-full">
              <summary className="cursor-pointer text-sm font-semibold text-link">Edit</summary>
              <form action={editInsight.bind(null, sessionId, insight.id)} className="mt-2 flex flex-col items-start gap-2">
                <textarea name="text" defaultValue={insight.payload.text} aria-label="Edit suggestion" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
                <SubmitButton label="Save and approve" variant="secondary" />
              </form>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
