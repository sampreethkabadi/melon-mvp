import "server-only";
import { z } from "zod/v4";
import { Output, SYSTEM } from "./claude";
import type { DraftInsight, Segment } from "./types";

// A local open-source model, run by Ollama on the same machine as the app, so a transcript never goes to a
// cloud AI. Set OLLAMA_URL (usually http://localhost:11434) to turn it on, and OLLAMA_MODEL to pick a model.

export const OLLAMA_DEFAULT_MODEL = "qwen3:8b";
export const ollamaModel = () => process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL;
export const isOllamaConfigured = () => Boolean(process.env.OLLAMA_URL);

const SCHEMA = z.toJSONSchema(Output);

export async function analyzeWithOllama(segments: Segment[], context: { role: "advisor" | "coach"; type: string | null }): Promise<DraftInsight[]> {
  const transcript = segments.map((s) => `[${s.idx}] ${s.speaker}: ${s.text}`).join("\n");
  const about = `This was a ${context.role === "coach" ? "career coach" : "academic advisor"} session${context.type ? ` of type "${context.type}"` : ""}.`;
  const res = await fetch(new URL("/api/chat", process.env.OLLAMA_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      stream: false,
      think: false,
      // The reply must match the same shape Claude returns, so the rest of the pipeline doesn't care which ran.
      format: SCHEMA,
      options: { temperature: 0, num_ctx: 16384 },
      messages: [
        { role: "system", content: `${SYSTEM}\n\nReply with JSON only, as {"insights": [...]}. Line numbers in evidence are the numbers in square brackets.` },
        { role: "user", content: `${about}\n\n<transcript>\n${transcript}\n</transcript>` },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`The local model failed with status ${res.status}.`);
  const body = (await res.json()) as { message?: { content?: string } };
  const parsed = Output.safeParse(JSON.parse(body.message?.content ?? "{}"));
  if (!parsed.success) throw new Error("The local model's reply couldn't be read.");
  return parsed.data.insights;
}
