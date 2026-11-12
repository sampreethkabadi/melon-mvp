import type { Segment, Speaker } from "./types.ts";

// A call records each person's own microphone separately. This puts the two back together as one conversation,
// in the order things were said.

export type Track = {
  speaker: Exclude<Speaker, "unknown">;
  /** When this person's recording started (milliseconds since 1970), so the two line up. */
  startedAt: number;
  utterances: Array<{ start: number; end: number; transcript: string }>;
};

export function mergeTracks(tracks: Track[]): Segment[] {
  if (!tracks.length) return [];
  const origin = Math.min(...tracks.map((t) => t.startedAt));
  return tracks
    .flatMap((t) =>
      t.utterances
        .filter((u) => u.transcript.trim())
        .map((u) => ({
          speaker: t.speaker,
          start_ms: Math.round(t.startedAt - origin + u.start * 1000),
          end_ms: Math.round(t.startedAt - origin + u.end * 1000),
          text: u.transcript.trim(),
        })),
    )
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)
    // Speech-to-text splits at pauses. Back-to-back pieces from the same person read better as one line.
    .reduce<Array<Omit<Segment, "idx">>>((lines, s) => {
      const last = lines.at(-1);
      if (last && last.speaker === s.speaker && s.start_ms - last.end_ms <= JOIN_GAP_MS) {
        last.text = `${last.text} ${s.text}`;
        last.end_ms = Math.max(last.end_ms, s.end_ms);
      } else lines.push({ ...s });
      return lines;
    }, [])
    .map((s, idx) => ({ idx, ...s }));
}

/** Pieces from the same person this close together become one line. */
export const JOIN_GAP_MS = 1500;
