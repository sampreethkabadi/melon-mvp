import "server-only";
import type { Segment } from "./types";

export const isSpeechConfigured = () => Boolean(process.env.DEEPGRAM_API_KEY);

type Utterance = { start: number; end: number; transcript: string; speaker?: number };

/** Transcribes audio at a temporary link, with speakers told apart. */
export async function transcribeUrl(url: string): Promise<Segment[]> {
  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&diarize_model=latest&utterances=true&smart_format=true", {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Speech-to-text failed with status ${res.status}.`);
  const body = (await res.json()) as { results?: { utterances?: Utterance[] } };
  return utterancesToSegments(body.results?.utterances ?? []);
}

/** The advisor usually speaks first, so that's the starting guess. They can swap any label on the review screen. */
export function utterancesToSegments(utterances: Utterance[]): Segment[] {
  const first = utterances[0]?.speaker;
  return utterances.map((u, idx) => ({
    idx,
    start_ms: Math.round(u.start * 1000),
    end_ms: Math.round(u.end * 1000),
    speaker: u.speaker === undefined ? "unknown" : u.speaker === first ? "staff" : "student",
    text: u.transcript,
  }));
}
