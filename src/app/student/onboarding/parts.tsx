"use client";

import { useTransition } from "react";
import { useFormStatus } from "react-dom";
import { goToStep, retryDraft } from "./actions";

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
      {message}
    </p>
  );
}

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-full bg-ink px-6 py-3 font-extrabold text-white disabled:opacity-50">
      {pending ? "One moment…" : label}
    </button>
  );
}

export function BackButton({ step }: { step: "resume" | "profile" }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => goToStep(step))} className="text-sm font-semibold text-link disabled:opacity-60">
      Back
    </button>
  );
}

export function RetryDraft() {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-3 rounded-3xl border border-line bg-white/95 p-6">
      <h1 className="text-2xl font-extrabold">Let&apos;s build your roadmap</h1>
      <p className="text-ink-2">Your answers are saved. If this doesn&apos;t work, try again in a minute.</p>
      <button
        disabled={pending}
        onClick={() => start(() => retryDraft())}
        className="rounded-full bg-ink px-6 py-3 font-extrabold text-white disabled:opacity-50"
      >
        {pending ? "One moment…" : "Build my roadmap"}
      </button>
    </div>
  );
}
