"use client";

import { useActionState } from "react";
import type { Answers, Question } from "@/lib/onboarding/questions";
import { BackButton, ErrorNote, SubmitButton } from "./parts";
import { saveAnswers } from "./actions";

export function QuestionsStep({ questions, answers }: { questions: Question[]; answers: Answers }) {
  const [state, action] = useActionState(saveAnswers, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">A few quick questions</h1>
        <p className="mt-1 text-ink-2">Your answers shape your first roadmap. There are no wrong ones.</p>
      </div>
      {questions.map((q) => (
        <fieldset key={q.id} className="rounded-3xl border border-line bg-white/95 p-6">
          <legend className="px-1 font-bold">{q.label}</legend>
          {q.help && <p className="text-sm text-muted">{q.help}</p>}
          {q.type === "text" ? (
            <input
              name={q.id}
              aria-label={q.label}
              required={q.required}
              defaultValue={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5"
            />
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {q.options?.map((o) => {
                const saved = answers[q.id];
                const checked = Array.isArray(saved) ? saved.includes(o.value) : saved === o.value;
                return (
                  <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 has-[:checked]:border-ink has-[:checked]:bg-soft">
                    <input type={q.type === "single" ? "radio" : "checkbox"} name={q.id} value={o.value} defaultChecked={checked} required={q.required && q.type === "single"} />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}
      <ErrorNote message={state.error} />
      <div className="flex items-center justify-between gap-3">
        <BackButton step="profile" />
        <SubmitButton label="Build my roadmap" />
      </div>
    </form>
  );
}
