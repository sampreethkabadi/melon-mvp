"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { consentStillValid, finishRecording, getUploadTarget } from "../actions";

type State = "idle" | "recording" | "saving" | "stopped";

export function Recorder({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const discard = useRef(false);

  // If this screen goes away mid-recording, such as after consent is withdrawn, turn the microphone off.
  useEffect(
    () => () => {
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  useEffect(() => {
    if (state !== "recording") return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const check = setInterval(async () => {
      if (!(await consentStillValid(sessionId))) {
        discard.current = true;
        setError("Consent was withdrawn, so recording stopped and the audio was discarded.");
        recorder.current?.stop();
      }
    }, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(check);
    };
  }, [state, sessionId]);

  async function upload(blob: Blob, duration: number) {
    setState("saving");
    try {
      const { path, token } = await getUploadTarget(sessionId);
      const { error: uploadError } = await createClient()
        .storage.from("recordings")
        .uploadToSignedUrl(path, token, blob, { contentType: blob.type || "audio/webm", upsert: true });
      if (uploadError) throw new Error("The upload didn't work. Check your connection.");
      await finishRecording(sessionId, duration, blob.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recording couldn't be saved.");
      setState("stopped");
    }
  }

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      discard.current = false;
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (discard.current) {
          chunks.current = [];
          setState("stopped");
        } else {
          setSeconds((s) => {
            void upload(new Blob(chunks.current, { type: rec.mimeType }), s);
            return s;
          });
        }
      };
      rec.start(1000);
      recorder.current = rec;
      setSeconds(0);
      setState("recording");
    } catch {
      setError("We couldn't use the microphone. Check your browser's permission for this site.");
    }
  }

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-col items-start gap-2">
      {state === "recording" ? (
        <button onClick={() => recorder.current?.stop()} className="rounded-full bg-firm px-5 py-2.5 font-extrabold text-white">
          Stop recording · {clock}
        </button>
      ) : (
        <button onClick={start} disabled={state === "saving"} className="rounded-full bg-ink px-5 py-2.5 font-extrabold text-white disabled:opacity-50">
          {state === "saving" ? "Saving and transcribing…" : "Start recording"}
        </button>
      )}
      {state === "idle" && (
        <label className="text-sm font-semibold text-link">
          Or upload an audio file
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file, 0);
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
          {error}
        </p>
      )}
    </div>
  );
}
