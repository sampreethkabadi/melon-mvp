"use client";

import { useState, useTransition } from "react";
import { placeInsight, type PlacementInput } from "./actions";

export type Placement = { as?: "task" | "milestone" | "goal"; term?: string; goal_id?: string; goal_title?: string } | null;
export type GoalOption = { id: string; title: string; term: string | null };

const CHOICES = [
  { as: "task", label: "Action item", note: "A step on their Action items, as usual." },
  { as: "milestone", label: "Milestone", note: "A flag on their road, in the semester you pick." },
  { as: "goal", label: "Under a goal", note: "An action item grouped under a bigger goal." },
] as const;

/** The advisor's call on where an approved action item goes. Saved as soon as it's chosen. */
export function PlacementPicker({ sessionId, insightId, placement, terms, goals }: { sessionId: string; insightId: string; placement: Placement; terms: string[]; goals: GoalOption[] }) {
  const [as, setAs] = useState(placement?.as ?? "task");
  const [term, setTerm] = useState(placement?.term ?? terms[0]);
  const [goalId, setGoalId] = useState(placement?.goal_id ?? (placement?.goal_title ? "new" : (goals[0]?.id ?? "new")));
  const [goalTitle, setGoalTitle] = useState(placement?.goal_title ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (input: PlacementInput, label: string) => {
    setError(null);
    start(async () => {
      try {
        await placeInsight(sessionId, insightId, input);
        setSaved(label);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  };
  const choose = (next: (typeof CHOICES)[number]["as"]) => {
    setAs(next);
    setSaved(null);
    if (next === "task") save({ as: "task" }, "Saved");
    if (next === "milestone") save({ as: "milestone", term }, "Saved");
    if (next === "goal" && goalId !== "new") save({ as: "goal", goal_id: goalId }, "Saved");
  };

  return (
    <fieldset className="flex w-full flex-col gap-2 rounded-xl border border-line bg-white/80 p-3">
      <legend className="px-1 text-xs font-extrabold uppercase tracking-widest text-muted">Where does this go?</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Where this action item goes">
        {CHOICES.map((c) => (
          <button
            key={c.as}
            type="button"
            role="radio"
            aria-checked={as === c.as}
            disabled={pending}
            onClick={() => choose(c.as)}
            title={c.note}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${as === c.as ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{CHOICES.find((c) => c.as === as)?.note}</p>

      {as === "milestone" && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          Semester
          <select
            value={term}
            disabled={pending}
            onChange={(e) => {
              setTerm(e.target.value);
              save({ as: "milestone", term: e.target.value }, "Saved");
            }}
            className="rounded-lg border border-line bg-white px-2 py-1 text-sm"
          >
            {terms.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      )}

      {as === "goal" && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Goal
            <select
              value={goalId}
              disabled={pending}
              onChange={(e) => {
                setGoalId(e.target.value);
                if (e.target.value !== "new") save({ as: "goal", goal_id: e.target.value }, "Saved");
              }}
              className="min-w-0 max-w-full rounded-lg border border-line bg-white px-2 py-1 text-sm"
            >
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                  {g.term ? ` · ${g.term}` : ""}
                </option>
              ))}
              <option value="new">A new goal…</option>
            </select>
          </label>
          {goalId === "new" && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save({ as: "goal", goal_title: goalTitle, term }, "Saved");
              }}
            >
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-muted">
                New goal
                <input
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="For example: Land a summer internship"
                  className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                By
                <select value={term} onChange={(e) => setTerm(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink">
                  {terms.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button disabled={pending} className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-extrabold text-white disabled:opacity-50">
                Save goal
              </button>
            </form>
          )}
        </div>
      )}
      <p aria-live="polite" className="min-h-4 text-xs font-semibold">
        {pending ? <span className="text-muted">Saving…</span> : error ? <span className="text-firm">{error}</span> : saved ? <span className="text-done-ink">{saved}</span> : null}
      </p>
    </fieldset>
  );
}
