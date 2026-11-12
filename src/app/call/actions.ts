"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { appNowIso } from "@/lib/clock";
import { ensureRoom, isDailyConfigured, meetingToken } from "@/lib/daily";
import { isSpeechConfigured, transcribeTrack } from "@/lib/sessions/deepgram";
import { sampleConversation } from "@/lib/sessions/demo";
import { mergeTracks, type Track } from "@/lib/sessions/merge";
import { draftInsights, saveSegments } from "@/lib/sessions/pipeline";
import { sampleForStudent } from "@/lib/sessions/sample-for-student";
import { defaultType } from "@/lib/sessions/session-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const Id = z.string().uuid();
const SCOPES = ["record", "transcribe", "ai_analysis"] as const;
const DONE = ["ready_for_review", "reviewed", "closed"];

/** The session, if the signed-in person is its student or its advisor or coach. */
async function participant(sessionId: string) {
  const profile = await requireRole(["student", "advisor", "coach"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, school_id, student_id, staff_id, status, mode, call_room, session_type, transcript_source, started_at, paused_by, call_ended_at")
    .eq("id", Id.parse(sessionId))
    .single();
  if (!session || (session.student_id !== profile.id && session.staff_id !== profile.id)) throw new Error("This isn't your session.");
  const role: "staff" | "student" = session.staff_id === profile.id ? "staff" : "student";
  return { profile, supabase, session, role };
}

const refresh = (id: string) => {
  revalidatePath(`/call/${id}`);
  revalidatePath("/staff", "layout");
  revalidatePath("/student", "layout");
};

/** A way into the call: the room's link and this person's own token. The advisor or coach opens the room. */
export async function joinCall(sessionId: string): Promise<{ url: string; token: string }> {
  if (!isDailyConfigured()) throw new Error("Video calls aren't set up yet (DAILY_API_KEY).");
  const { profile, session, role } = await participant(sessionId);
  if (DONE.includes(session.status)) throw new Error("This session is over.");
  if (session.call_ended_at) throw new Error("This meeting has ended.");
  if (!session.call_room && role !== "staff") throw new Error("Your advisor or coach hasn't opened the call yet.");
  const room = await ensureRoom(session.id);
  if (!session.call_room) {
    const db = createAdminClient();
    await db.from("sessions").update({ call_room: room.name, mode: "melon_call" }).eq("id", session.id);
    const { error } = await db.from("notifications").insert({
      school_id: session.school_id,
      user_id: session.student_id,
      type: "call_open",
      title: `${profile.full_name} opened your video call`,
      link: `/call/${session.id}`,
    });
    if (error) console.error("call notification failed:", error.message);
    refresh(session.id);
  }
  return { url: room.url, token: await meetingToken(room.name, profile.full_name, role === "staff") };
}

export type CallState = {
  status: string;
  me: "staff" | "student";
  staffAgreed: boolean | null;
  studentAgreed: boolean | null;
  recordingSince: string | null;
  /** Who paused the recording, if it's paused. */
  pausedBy: "staff" | "student" | null;
  /** Someone ended the meeting. */
  ended: boolean;
};

/** Polled by both people: who has agreed to record, and whether recording is on. */
export async function callState(sessionId: string): Promise<CallState> {
  const { supabase, session, role } = await participant(sessionId);
  const { data: consents } = await supabase
    .from("consents")
    .select("subject_id, granted, created_at")
    .eq("session_id", session.id)
    .eq("scope", "record")
    .order("created_at");
  const latest = (who: string) => [...(consents ?? [])].reverse().find((c) => c.subject_id === who)?.granted ?? null;
  return {
    status: session.status,
    me: role,
    staffAgreed: latest(session.staff_id),
    studentAgreed: latest(session.student_id),
    recordingSince: session.status === "recording" ? session.started_at : null,
    pausedBy: session.paused_by ? (session.paused_by === session.staff_id ? "staff" : "student") : null,
    ended: Boolean(session.call_ended_at),
  };
}

/** Each person answers for themself. Consent is append-only: changing your mind adds a new row. */
export async function answerInCall(sessionId: string, granted: boolean) {
  const { profile, supabase, session } = await participant(sessionId);
  if (DONE.includes(session.status) || session.status === "transcribed") throw new Error("This call has ended.");
  const { error } = await supabase.from("consents").insert(
    SCOPES.map((scope) => ({ school_id: session.school_id, session_id: session.id, student_id: session.student_id, subject_id: profile.id, scope, granted })),
  );
  if (error) throw new Error("Couldn't save your answer. Try again.");
  // Saying no mid-recording stops it for both people, and nothing recorded so far is kept.
  if (!granted && session.status === "recording") {
    const db = createAdminClient();
    const { data: files } = await db.storage.from("recordings").list(`${session.student_id}/${session.id}-call`);
    if (files?.length) await db.storage.from("recordings").remove(files.map((f) => `${session.student_id}/${session.id}-call/${f.name}`));
    await db.from("sessions").update({ status: "created", started_at: null, paused_by: null }).eq("id", session.id);
  }
  refresh(session.id);
}

async function bothAgreed(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.rpc("has_recording_consent", { sess: id });
  return data === true;
}

/** The advisor or coach starts recording, once both people have agreed. */
export async function startCallRecording(sessionId: string) {
  const { supabase, session, role } = await participant(sessionId);
  if (role !== "staff") throw new Error("Your advisor or coach starts the recording.");
  if (!(await bothAgreed(supabase, session.id))) throw new Error("Both people must agree before recording.");
  await createAdminClient().from("sessions").update({ status: "recording", started_at: appNowIso(), paused_by: null }).eq("id", session.id);
  refresh(session.id);
}

/** Where this person's own microphone recording goes. Only handed out while both people agree. */
export async function trackUpload(sessionId: string, startedAt: number): Promise<{ path: string; token: string }> {
  const { supabase, session, role } = await participant(sessionId);
  if (!(await bothAgreed(supabase, session.id))) throw new Error("Consent was withdrawn, so the recording was discarded.");
  const path = `${session.student_id}/${session.id}-call/${role}-${Math.round(startedAt)}.webm`;
  const { data, error } = await createAdminClient().storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error("Couldn't prepare the upload. Try again.");
  return { path, token: data.token };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Either person pauses or resumes the recording. While paused, nothing is recorded. */
export async function setPaused(sessionId: string, paused: boolean) {
  const { profile, session } = await participant(sessionId);
  if (session.status !== "recording") throw new Error("Nothing is being recorded right now.");
  await createAdminClient().from("sessions").update({ paused_by: paused ? profile.id : null }).eq("id", session.id);
  refresh(session.id);
}

/** This person's browser has sent everything it recorded. Ending waits for both, so no words are lost. */
export async function trackDone(sessionId: string) {
  const { session, role } = await participant(sessionId);
  const db = createAdminClient();
  await db.storage.from("recordings").upload(`${session.student_id}/${session.id}-call/${role}.done`, new Blob(["done"], { type: "text/plain" }), { upsert: true });
}

/**
 * Either person ends the meeting, recording or not. If it was recording, the recording ends for both and the
 * transcript is made, for both people to check.
 */
export async function endMeeting(sessionId: string): Promise<{ ok: boolean; message?: string }> {
  const { session } = await participant(sessionId);
  const db = createAdminClient();
  await db.from("sessions").update({ call_ended_at: appNowIso(), paused_by: null }).eq("id", session.id);
  if (session.status !== "recording") {
    refresh(session.id);
    return { ok: true };
  }
  return finishCall(sessionId);
}

/** The advisor or coach opens an ended meeting again. */
export async function reopenCall(sessionId: string) {
  const { session, role } = await participant(sessionId);
  if (role !== "staff") throw new Error("Your advisor or coach does this.");
  await createAdminClient().from("sessions").update({ call_ended_at: null }).eq("id", session.id);
  refresh(session.id);
}

/**
 * Ends the recording (either person can). Waits for both browsers to send what they recorded, turns it into one
 * transcript with who said what, and opens it for both people to check. Nothing is summarized yet.
 */
export async function finishCall(sessionId: string): Promise<{ ok: boolean; message?: string }> {
  const { supabase, session } = await participant(sessionId);
  if (!["recording", "uploaded"].includes(session.status)) return { ok: false, message: "Nothing is being recorded right now." };
  if (!(await bothAgreed(supabase, session.id))) throw new Error("Consent was withdrawn, so nothing was kept.");
  const db = createAdminClient();
  // Recording is over for both people: their browsers send their last piece and say they're done.
  await db.from("sessions").update({ status: "uploaded", ended_at: appNowIso(), paused_by: null }).eq("id", session.id);
  const folder = `${session.student_id}/${session.id}-call`;
  let files: Array<{ name: string; metadata?: { size?: number } | null }> = [];
  for (let i = 0; i < 15; i++) {
    const { data } = await db.storage.from("recordings").list(folder);
    files = data ?? [];
    if (files.some((f) => f.name === "staff.done") && files.some((f) => f.name === "student.done")) break;
    await wait(2000);
  }
  files = files.filter((f) => f.name.endsWith(".webm"));
  if (!files.length) return { ok: false, message: "No audio arrived. Try again, or use the sample conversation." };

  // The database refuses this row if consent is missing. The audio goes with it.
  const { error } = await db.from("recordings").upsert(
    {
      school_id: session.school_id,
      session_id: session.id,
      student_id: session.student_id,
      storage_path: folder,
      size_bytes: files.reduce((n, f) => n + (f.metadata?.size ?? 0), 0),
    },
    { onConflict: "session_id" },
  );
  if (error) {
    await db.storage.from("recordings").remove(files.map((f) => `${folder}/${f.name}`));
    throw new Error("Consent was withdrawn, so the audio was deleted.");
  }
  if (!isSpeechConfigured()) {
    refresh(session.id);
    return { ok: false, message: "The audio is saved, but speech-to-text isn't set up (DEEPGRAM_API_KEY). Use the sample conversation for now." };
  }
  try {
    const tracks: Track[] = [];
    for (const f of files) {
      const m = f.name.match(/^(staff|student)-(\d+)\.webm$/);
      if (!m) continue;
      const { data: audio } = await db.storage.from("recordings").download(`${folder}/${f.name}`);
      if (!audio) continue;
      tracks.push({ speaker: m[1] as Track["speaker"], startedAt: Number(m[2]), utterances: await transcribeTrack(audio) });
    }
    const segments = mergeTracks(tracks);
    if (!segments.length) return { ok: false, message: "No speech was found in the recording. Use the sample conversation instead." };
    await saveSegments(session, segments, "audio");
  } catch (err) {
    console.error("call transcription failed:", err instanceof Error ? err.message : "unknown");
    await db.from("sessions").update({ status: "failed" }).eq("id", session.id);
    refresh(session.id);
    return { ok: false, message: "Speech-to-text didn't work this time. Use the sample conversation instead." };
  }
  refresh(session.id);
  return { ok: true };
}

/** For demos and rehearsals: the invented sample conversation, opened for both people to check like a real one. */
export async function sampleInCall(sessionId: string) {
  const { supabase, session, role, profile } = await participant(sessionId);
  if (role !== "staff") throw new Error("Your advisor or coach does this.");
  if (!(await bothAgreed(supabase, session.id))) throw new Error("Both people must agree first.");
  const sample = await sampleForStudent(session.student_id, session.session_type ?? defaultType(profile.role));
  await saveSegments(session, sampleConversation(sample).segments, "sample");
  await createAdminClient().from("sessions").update({ ended_at: appNowIso() }).eq("id", session.id);
  refresh(session.id);
}

// ---- the transcript both people check

export async function editLine(sessionId: string, segmentId: string, text: string, speaker: "staff" | "student" | "unknown") {
  const { supabase, session } = await participant(sessionId);
  const { error } = await supabase.rpc("edit_transcript_line", { p_segment: Id.parse(segmentId), p_text: text, p_speaker: speaker });
  if (error) throw new Error(error.message);
  refresh(session.id);
}

export async function addLine(sessionId: string, afterIdx: number, text: string, speaker: "staff" | "student" | "unknown") {
  const { supabase, session } = await participant(sessionId);
  const { error } = await supabase.rpc("add_transcript_line", { p_session: session.id, p_after_idx: afterIdx, p_text: text, p_speaker: speaker });
  if (error) throw new Error(error.message);
  refresh(session.id);
}

export async function deleteLine(sessionId: string, segmentId: string) {
  const { supabase, session } = await participant(sessionId);
  const { error } = await supabase.rpc("delete_transcript_line", { p_segment: Id.parse(segmentId) });
  if (error) throw new Error(error.message);
  refresh(session.id);
}

/** The advisor or coach locks the transcript and asks for the summary: key points and action items to review. */
export async function draftFromTranscript(sessionId: string): Promise<{ next: string }> {
  const { session, role, profile } = await participant(sessionId);
  if (role !== "staff") throw new Error("Your advisor or coach does this.");
  if (session.status !== "transcribed") throw new Error("The transcript isn't open for checking.");
  const sample =
    session.transcript_source === "sample" ? await sampleForStudent(session.student_id, session.session_type ?? defaultType(profile.role)) : undefined;
  await draftInsights(session, sample);
  refresh(session.id);
  return { next: `/staff/sessions/${session.id}` };
}
