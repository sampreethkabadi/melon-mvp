import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeWithClaude, CLAUDE_MODEL, isClaudeConfigured, PROMPT_VERSION } from "./claude";
import { sampleConversation } from "./demo";
import { analyzeByRules } from "./rules";
import { keepSupported, type DraftInsight, type Segment } from "./types";

type SessionRow = { id: string; school_id: string; student_id: string; transcript_source: string | null };

/** Replaces a session's transcript. Only the server writes transcripts. */
export async function saveSegments(session: SessionRow, segments: Segment[], source: "audio" | "sample" | "notes") {
  const db = createAdminClient();
  const { error: delError } = await db.from("transcript_segments").delete().eq("session_id", session.id);
  if (delError) throw new Error(delError.message);
  const { error } = await db.from("transcript_segments").insert(
    segments.map((s) => ({ ...s, school_id: session.school_id, session_id: session.id, student_id: session.student_id })),
  );
  if (error) throw new Error(error.message);
  const { error: updateError } = await db.from("sessions").update({ status: "transcribed", transcript_source: source }).eq("id", session.id);
  if (updateError) throw new Error(updateError.message);
}

/**
 * Drafts suggestions for the advisor. Claude runs only when it's set up and the student agreed to AI
 * analysis. Otherwise, or if Claude fails, samples use their saved suggestions and everything else uses rules.
 */
export async function draftInsights(session: SessionRow, sampleFor?: { first: string; major: string; focus: string }) {
  const db = createAdminClient();
  const { data: rows, error } = await db
    .from("transcript_segments")
    .select("id, idx, start_ms, end_ms, speaker, text")
    .eq("session_id", session.id)
    .order("idx");
  if (error) throw new Error(error.message);
  const segments = (rows ?? []) as Array<Segment & { id: string }>;

  const { count } = await db
    .from("consents")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .eq("subject_id", session.student_id)
    .eq("scope", "ai_analysis")
    .eq("granted", true);

  let drafted: DraftInsight[] | null = null;
  let modelRef = "rules-v1";
  if (isClaudeConfigured() && (count ?? 0) > 0) {
    try {
      drafted = await analyzeWithClaude(segments);
      modelRef = CLAUDE_MODEL;
    } catch (err) {
      console.error("Claude analysis failed, using the fallback:", err instanceof Error ? err.message : "unknown");
    }
  }
  if (!drafted && session.transcript_source === "sample" && sampleFor) {
    drafted = sampleConversation(sampleFor).insights;
    modelRef = "saved-sample-v1";
  }
  const kept = keepSupported(drafted ?? analyzeByRules(segments), segments);

  await db.from("insights").delete().eq("session_id", session.id);
  for (const insight of kept) {
    const { data: row, error: insertError } = await db
      .from("insights")
      .insert({
        school_id: session.school_id,
        session_id: session.id,
        student_id: session.student_id,
        kind: insight.kind,
        payload: { text: insight.text, roadmap_kind: insight.roadmap_kind ?? null },
        model_ref: modelRef,
        prompt_version: PROMPT_VERSION,
      })
      .select("id")
      .single();
    if (insertError || !row) throw new Error(insertError?.message ?? "Couldn't save a suggestion.");
    const ids = insight.evidence.map((idx) => segments.find((s) => s.idx === idx)!.id);
    const { error: evidenceError } = await db.from("insight_evidence").insert(ids.map((segment_id) => ({ insight_id: row.id, segment_id })));
    if (evidenceError) throw new Error(evidenceError.message);
  }
  const { error: statusError } = await db.from("sessions").update({ status: "ready_for_review" }).eq("id", session.id);
  if (statusError) throw new Error(statusError.message);
}
