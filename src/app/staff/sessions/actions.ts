"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { sampleConversation } from "@/lib/sessions/demo";
import { sampleForStudent } from "@/lib/sessions/sample-for-student";
import { defaultType } from "@/lib/sessions/session-types";
import { appNowIso } from "@/lib/clock";
import { isSpeechConfigured, transcribeUrl } from "@/lib/sessions/deepgram";
import { draftInsights, saveSegments } from "@/lib/sessions/pipeline";
import { notesToSegments, parseTranscript } from "@/lib/sessions/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const Id = z.string().uuid();
const SCOPES = ["record", "transcribe", "ai_analysis"] as const;

/** The session, if the signed-in advisor or coach is the one running it. */
async function ownSession(id: string) {
  const profile = await requireRole(["advisor", "coach"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, school_id, student_id, staff_id, status, transcript_source, appointment_id, session_type")
    .eq("id", Id.parse(id))
    .single();
  if (!session || session.staff_id !== profile.id) throw new Error("This isn't your session.");
  return { profile, supabase, session };
}

// Sessions show up on Today, Students, Reviews and the session page, so refresh them all.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const refresh = (_id: string) => revalidatePath("/staff", "layout");

export async function startSession(studentId: string, appointmentId: string | null) {
  const profile = await requireRole(["advisor", "coach"]);
  const supabase = await createClient();
  // The student picked the session type when they booked.
  const { data: appt } = appointmentId
    ? await supabase.from("appointments").select("type").eq("id", Id.parse(appointmentId)).maybeSingle()
    : { data: null };
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      school_id: profile.school_id,
      student_id: Id.parse(studentId),
      staff_id: profile.id,
      appointment_id: appointmentId ? Id.parse(appointmentId) : null,
      session_type: appt?.type ?? defaultType(profile.role),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't start the session. Check that this student is assigned to you.");
  const { error: notifyError } = await createAdminClient().from("notifications").insert({
    school_id: profile.school_id,
    user_id: studentId,
    type: "consent_request",
    title: `${profile.full_name} is asking to record your session`,
    link: "/student",
  });
  if (notifyError) console.error("consent notification failed:", notifyError.message);
  redirect(`/staff/sessions/${data.id}`);
}

export async function giveStaffConsent(id: string) {
  const { profile, supabase, session } = await ownSession(id);
  const { error } = await supabase.from("consents").insert(
    SCOPES.map((scope) => ({
      school_id: session.school_id,
      session_id: session.id,
      student_id: session.student_id,
      subject_id: profile.id,
      scope,
      granted: true,
    })),
  );
  if (error) throw new Error("Couldn't save your agreement. Try again.");
  refresh(id);
}

export async function chooseNotesOnly(id: string) {
  const { supabase, session } = await ownSession(id);
  const { error } = await supabase.from("sessions").update({ mode: "notes_only", status: "no_recording" }).eq("id", session.id);
  if (error) throw new Error("Couldn't switch to notes. Try again.");
  refresh(id);
}

/** Polled while recording, so audio stops as soon as anyone withdraws. */
export async function consentStillValid(id: string): Promise<boolean> {
  const { supabase, session } = await ownSession(id);
  const { data } = await supabase.rpc("has_recording_consent", { sess: session.id });
  return data === true;
}

/** A temporary upload link. It's only handed out once both people have agreed. */
export async function getUploadTarget(id: string): Promise<{ path: string; token: string }> {
  const { supabase, session } = await ownSession(id);
  const { data: agreed } = await supabase.rpc("has_recording_consent", { sess: session.id });
  if (agreed !== true) throw new Error("Both people must agree before recording.");
  const path = `${session.student_id}/${session.id}`;
  const db = createAdminClient();
  const { data, error } = await db.storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error("Couldn't prepare the upload. Try again.");
  await supabase.from("sessions").update({ status: "recording", started_at: appNowIso() }).eq("id", session.id);
  return { path, token: data.token };
}

export async function finishRecording(id: string, durationSeconds: number, sizeBytes: number) {
  const { session } = await ownSession(id);
  const db = createAdminClient();
  const path = `${session.student_id}/${session.id}`;
  // The database refuses this row if consent is missing or was withdrawn. The audio goes with it.
  const { error } = await db.from("recordings").upsert(
    {
      school_id: session.school_id,
      session_id: session.id,
      student_id: session.student_id,
      storage_path: path,
      duration_s: Math.round(durationSeconds),
      size_bytes: sizeBytes,
    },
    { onConflict: "session_id" },
  );
  if (error) {
    await db.storage.from("recordings").remove([path]);
    throw new Error("Consent was withdrawn, so the audio was deleted.");
  }
  await db.from("sessions").update({ status: "uploaded", ended_at: appNowIso() }).eq("id", session.id);
  await processAudio(session);
  refresh(id);
}

async function processAudio(session: { id: string; school_id: string; student_id: string; staff_id: string; session_type: string | null; transcript_source: string | null }) {
  const db = createAdminClient();
  try {
    if (!isSpeechConfigured()) throw new Error("Speech-to-text isn't set up.");
    const { data, error } = await db.storage.from("recordings").createSignedUrl(`${session.student_id}/${session.id}`, 3600);
    if (error || !data) throw new Error("Couldn't open the recording.");
    const segments = await transcribeUrl(data.signedUrl);
    if (!segments.length) throw new Error("No speech was found in the recording.");
    await saveSegments(session, segments, "audio");
    await draftInsights({ ...session, transcript_source: "audio" });
  } catch (err) {
    console.error("audio processing failed:", err instanceof Error ? err.message : "unknown");
    await db.from("sessions").update({ status: "failed" }).eq("id", session.id);
  }
}

/** Retries whatever step failed: transcribing if there's no transcript yet, otherwise the suggestions. */
export async function retryProcessing(id: string) {
  const { session, supabase, profile } = await ownSession(id);
  const { count } = await supabase.from("transcript_segments").select("id", { count: "exact", head: true }).eq("session_id", session.id);
  if (count) {
    await draftInsights(session, session.transcript_source === "sample" ? await sampleForStudent(session.student_id, session.session_type ?? defaultType(profile.role)) : undefined);
  } else {
    await processAudio(session);
  }
  refresh(id);
}

/** Uses the invented sample conversation. Consent still has to be in place, as it would for real audio. */
export async function runSampleConversation(id: string) {
  const { session, supabase, profile } = await ownSession(id);
  const { data: agreed } = await supabase.rpc("has_recording_consent", { sess: session.id });
  if (agreed !== true) throw new Error("Both people must agree first.");
  const sample = await sampleForStudent(session.student_id, session.session_type ?? defaultType(profile.role));
  await saveSegments(session, sampleConversation(sample).segments, "sample");
  await draftInsights({ ...session, transcript_source: "sample" }, sample);
  refresh(id);
}

/** A sample transcript from elsewhere, pasted in. It goes to Claude the same way a recording's transcript would. */
export async function pasteTranscript(id: string, form: FormData) {
  const { session, supabase } = await ownSession(id);
  const { data: agreed } = await supabase.rpc("has_recording_consent", { sess: session.id });
  if (agreed !== true) throw new Error("Both people must agree first.");
  const segments = parseTranscript(String(form.get("transcript") ?? "").slice(0, 200000));
  if (segments.length < 2) throw new Error("That doesn't look like a conversation. Put each speaker on their own line, like \"Advisor: Hello\".");
  await saveSegments(session, segments, "sample");
  await draftInsights({ ...session, transcript_source: "sample" });
  refresh(id);
}

export async function saveNotes(id: string, form: FormData) {
  const { session } = await ownSession(id);
  const segments = notesToSegments(String(form.get("notes") ?? "").slice(0, 20000));
  if (!segments.length) throw new Error("Add at least one line of notes.");
  await saveSegments(session, segments, "notes");
  await draftInsights({ ...session, transcript_source: "notes" });
  refresh(id);
}

export async function reviewInsight(sessionId: string, insightId: string, decision: "accepted" | "rejected" | "proposed") {
  const { profile, supabase, session } = await ownSession(sessionId);
  const { error } = await supabase
    .from("insights")
    .update({ status: decision, reviewed_by: profile.id, reviewed_at: appNowIso() })
    .eq("id", Id.parse(insightId))
    .eq("session_id", session.id);
  if (error) throw new Error("Couldn't save that. Try again.");
  refresh(sessionId);
}

export async function editInsight(sessionId: string, insightId: string, form: FormData) {
  const { profile, supabase, session } = await ownSession(sessionId);
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("A suggestion can't be empty. Reject it instead.");
  const { data: current } = await supabase.from("insights").select("payload").eq("id", Id.parse(insightId)).single();
  const { error } = await supabase
    .from("insights")
    .update({ status: "edited", payload: { ...(current?.payload ?? {}), text }, reviewed_by: profile.id, reviewed_at: appNowIso() })
    .eq("id", insightId)
    .eq("session_id", session.id);
  if (error) throw new Error("Couldn't save your edit. Try again.");
  refresh(sessionId);
}

export async function correctSegment(sessionId: string, segmentId: string, form: FormData) {
  const { supabase, session } = await ownSession(sessionId);
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const speaker = z.enum(["staff", "student", "unknown"]).parse(form.get("speaker"));
  if (!text) throw new Error("A transcript line can't be empty.");
  const { error } = await supabase.from("transcript_segments").update({ text, speaker }).eq("id", Id.parse(segmentId)).eq("session_id", session.id);
  if (error) throw new Error("Couldn't save your correction. Try again.");
  refresh(sessionId);
}

export async function finishReview(id: string) {
  const { supabase, session } = await ownSession(id);
  const { error } = await supabase.rpc("finish_session_review", { p_session: session.id });
  if (error) throw new Error(error.message);
  revalidatePath(`/staff/students/${session.student_id}`);
  refresh(id);
}

/** One click: everything not removed is accepted, and the student's roadmap and highlights update. */
export async function approveSession(id: string) {
  const { supabase, session } = await ownSession(id);
  const { error } = await supabase.rpc("approve_session", { p_session: session.id });
  if (error) throw new Error(error.message);
  revalidatePath(`/staff/students/${session.student_id}`);
  refresh(id);
}

/** A student flagged a highlight: fix its wording, or remove it. Either way the flag is closed. */
export async function resolveFlag(sessionId: string, flagId: string, form: FormData) {
  const { profile, supabase, session } = await ownSession(sessionId);
  const { data: flag } = await supabase.from("insight_flags").select("id, insight_id").eq("id", Id.parse(flagId)).eq("session_id", session.id).single();
  if (!flag) throw new Error("That flag isn't on this session.");
  const choice = z.enum(["fix", "remove", "keep"]).parse(form.get("choice"));
  if (choice === "fix") {
    const text = String(form.get("text") ?? "").trim().slice(0, 2000);
    if (!text) throw new Error("A highlight can't be empty. Remove it instead.");
    const { data: current } = await supabase.from("insights").select("payload").eq("id", flag.insight_id).single();
    await supabase.from("insights").update({ status: "edited", payload: { ...(current?.payload ?? {}), text } }).eq("id", flag.insight_id);
  } else if (choice === "remove") {
    await supabase.from("insights").update({ status: "rejected" }).eq("id", flag.insight_id);
  }
  const { error } = await supabase
    .from("insight_flags")
    .update({ status: choice === "keep" ? "dismissed" : "fixed", resolved_by: profile.id, resolved_at: appNowIso() })
    .eq("id", flag.id);
  if (error) throw new Error("Couldn't save that. Try again.");
  await createAdminClient().from("notifications").insert({
    school_id: session.school_id,
    user_id: session.student_id,
    type: "flag_resolved",
    title: choice === "keep" ? `${profile.full_name} looked at your flag and kept the highlight` : `${profile.full_name} fixed the highlight you flagged`,
    link: "/student/sessions",
  });
  refresh(sessionId);
}
