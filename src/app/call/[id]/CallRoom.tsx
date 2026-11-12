"use client";

import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { answerInCall, callState, finishCall, joinCall, startCallRecording, trackUpload, sampleInCall, type CallState } from "../actions";

type Props = { sessionId: string; me: "staff" | "student"; other: string };

/**
 * The call, with recording that needs both people's yes. Each person's browser records only their own
 * microphone (after both agree), so the transcript knows exactly who said what. Saying no at any point stops it,
 * and nothing recorded is kept.
 */
export function CallRoom({ sessionId, me, other }: Props) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const call = useRef<DailyCall | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // ---- recording this person's own microphone
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; startedAt: number; stream?: MediaStream } | null>(null);
  const [recording, setRecording] = useState(false);

  const startMine = useCallback(async () => {
    if (rec.current) return;
    let track = call.current?.participants().local?.tracks.audio.persistentTrack ?? null;
    let stream: MediaStream | undefined;
    if (!track) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      track = stream.getAudioTracks()[0];
    }
    const recorder = new MediaRecorder(new MediaStream([track]));
    const entry = { recorder, chunks: [] as Blob[], startedAt: Date.now(), stream };
    recorder.ondataavailable = (e) => e.data.size && entry.chunks.push(e.data);
    recorder.start(1000);
    rec.current = entry;
    setRecording(true);
  }, []);

  /** Stops recording. Keeps and uploads it, or throws it away if someone said no. */
  const stopMine = useCallback(
    async (keep: boolean) => {
      const entry = rec.current;
      if (!entry) return;
      rec.current = null;
      setRecording(false);
      await new Promise<void>((resolve) => {
        entry.recorder.onstop = () => resolve();
        entry.recorder.stop();
      });
      entry.stream?.getTracks().forEach((t) => t.stop());
      if (!keep) return;
      const blob = new Blob(entry.chunks, { type: entry.recorder.mimeType || "audio/webm" });
      const { path, token } = await trackUpload(sessionId, entry.startedAt);
      const { error } = await createClient().storage.from("recordings").uploadToSignedUrl(path, token, blob, { contentType: blob.type, upsert: true });
      if (error) throw new Error("Your recording didn't upload. Check your connection.");
    },
    [sessionId],
  );

  // ---- joining
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { url, token } = await joinCall(sessionId);
        if (cancelled || !box.current) return;
        await DailyIframe.getCallInstance()?.destroy();
        const frame = DailyIframe.createFrame(box.current, {
          showLeaveButton: false,
          iframeStyle: { width: "100%", height: "100%", border: "0", borderRadius: "24px" },
        });
        call.current = frame;
        // The other side ended the recording: stop and send mine right away.
        frame.on("app-message", (e) => {
          const data = e?.data as { melon?: string } | undefined;
          if (data?.melon === "stop") void stopMine(true).catch((err) => setNote(err instanceof Error ? err.message : String(err)));
        });
        await frame.join({ url, token });
      } catch (e) {
        if (!cancelled) setJoinError(e instanceof Error ? e.message : "Couldn't join the call.");
      }
    })();
    return () => {
      cancelled = true;
      void stopMine(false);
      void call.current?.destroy();
      call.current = null;
    };
  }, [sessionId, stopMine]);

  // ---- who has agreed, and whether we're recording (checked every 2.5 seconds)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await callState(sessionId);
        if (!alive) return;
        setState(s);
        const iAgree = s.me === "staff" ? s.staffAgreed : s.studentAgreed;
        const allYes = s.staffAgreed === true && s.studentAgreed === true;
        if (s.status === "recording" && allYes && iAgree) void startMine().catch(() => setNote("We couldn't use your microphone for the recording."));
        // Someone said no: stop and discard.
        if (rec.current && !allYes) {
          void stopMine(false);
          setNote("Someone said no, so recording stopped and nothing was kept.");
        }
        // The advisor or coach ended the recording (backup for the in-call message).
        if (rec.current && s.status !== "recording" && allYes) void stopMine(true).catch((err) => setNote(err instanceof Error ? err.message : String(err)));
        if (s.status === "transcribed") router.refresh();
      } catch {
        // A missed check is fine; the next one catches up.
      }
    };
    void tick();
    const t = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sessionId, startMine, stopMine, router]);

  const run = (label: string, fn: () => Promise<unknown>) => {
    setNote(null);
    setBusy(label);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Something went wrong. Try again.");
      } finally {
        setBusy(null);
      }
    });
  };

  const iAgree = state ? (me === "staff" ? state.staffAgreed : state.studentAgreed) : null;
  const theyAgree = state ? (me === "staff" ? state.studentAgreed : state.staffAgreed) : null;
  const allYes = iAgree === true && theyAgree === true;
  const isRecording = state?.status === "recording";

  const endRecording = () =>
    run("end", async () => {
      call.current?.sendAppMessage({ melon: "stop" }, "*");
      await stopMine(true);
      const res = await finishCall(sessionId);
      if (!res.ok && res.message) setNote(res.message);
      router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-3xl border border-line bg-ink">
        <div ref={box} className="absolute inset-0" />
        {joinError && (
          <p role="alert" className="absolute inset-x-6 top-6 rounded-2xl bg-firm-bg px-4 py-3 text-sm font-semibold text-firm">
            {joinError}
          </p>
        )}
        {(isRecording || recording) && (
          <span className="pointer-events-none absolute left-4 top-12 flex items-center gap-2 rounded-full bg-firm px-3 py-1.5 text-xs font-extrabold text-white">
            <span className="size-2 animate-pulse rounded-full bg-white" /> Recording
          </span>
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
          <h2 className="text-lg font-extrabold">Recording needs both of you</h2>
          <p className="text-sm text-ink-2">
            Nothing is recorded until you both agree. Each of you records only your own microphone. Either of you can stop it at any time, and then nothing is kept.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            <Agreed who="You" value={iAgree} />
            <Agreed who={other.split(" ")[0]} value={theyAgree} />
          </ul>
          {iAgree !== true ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => run("yes", () => answerInCall(sessionId, true))} className="rounded-full bg-ink px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">
                I agree to record
              </button>
              {iAgree === null && (
                <button type="button" disabled={pending} onClick={() => run("no", () => answerInCall(sessionId, false))} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  Don&apos;t record
                </button>
              )}
            </div>
          ) : (
            <button type="button" disabled={pending} onClick={() => run("no", () => answerInCall(sessionId, false))} className="self-start text-sm font-semibold text-link">
              {isRecording ? "Stop recording me · keep nothing" : "I changed my mind"}
            </button>
          )}
        </section>

        {me === "staff" && (
          <section className="flex flex-col gap-2 rounded-3xl border-2 bg-white p-5" style={{ borderColor: "var(--school)" }}>
            {!isRecording ? (
              <>
                <button
                  type="button"
                  disabled={!allYes || pending}
                  onClick={() => run("start", () => startCallRecording(sessionId))}
                  className="rounded-full bg-firm px-5 py-2.5 font-extrabold text-white disabled:opacity-40"
                >
                  {busy === "start" ? "Starting…" : "Start recording"}
                </button>
                {!allYes && <p className="text-xs text-muted">Waiting for both of you to agree.</p>}
                <button
                  type="button"
                  disabled={!allYes || pending}
                  onClick={() => run("sample", () => sampleInCall(sessionId).then(() => router.refresh()))}
                  className="self-start text-sm font-semibold text-link disabled:opacity-40"
                >
                  {busy === "sample" ? "One moment…" : "Use the sample conversation instead"}
                </button>
              </>
            ) : (
              <button type="button" disabled={pending} onClick={endRecording} className="rounded-full bg-ink px-5 py-2.5 font-extrabold text-white disabled:opacity-50">
                {busy === "end" ? "Making the transcript…" : "End recording · show transcript"}
              </button>
            )}
            <p className="text-xs text-muted">At the end, you both see the transcript and can fix, add or delete lines before the summary is made.</p>
          </section>
        )}
        {me === "student" && isRecording && (
          <p className="rounded-2xl bg-soft px-4 py-3 text-sm text-ink-2">When the recording ends, you&apos;ll both see the transcript here and can fix anything that&apos;s wrong.</p>
        )}
        {note && (
          <p role="alert" className="rounded-2xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-ink">
            {note}
          </p>
        )}
      </aside>
    </div>
  );
}

function Agreed({ who, value }: { who: string; value: boolean | null }) {
  const [text, tone] = value === true ? ["Agreed", "bg-done-bg text-done-ink"] : value === false ? ["Said no", "bg-firm-bg text-firm"] : ["Waiting", "bg-soft text-ink-2"];
  return (
    <li className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
      <b>{who}</b>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{text}</span>
    </li>
  );
}
