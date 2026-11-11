"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Flag, Target, Undo2 } from "lucide-react";
import { setItemDone } from "../actions";

export type BoardItem = { id: string; title: string; meta: string; date: string | null; fixed: boolean };
export type DoneItem = { id: string; title: string; when: string; goal?: string };
/** A milestone and the tasks that lead to it. Dated ones (the career fair) are crimson and count down. */
export type MilestoneGroup = { key: string; title: string; when: string; dated: boolean; days: number | null; note: string; total: number; done: number; items: BoardItem[] };

const UNDO_MS = 4000;

/**
 * This week's steps. Ticking one plays a short check animation and leaves an Undo for a few seconds,
 * in case it was a slip. Then it drops into "Done this semester" and is saved.
 */
export function TaskBoard({
  groups,
  items,
  done,
  upcoming,
}: {
  groups: MilestoneGroup[];
  items: BoardItem[];
  done: DoneItem[];
  /** Rendered between this week and done, so the page reads now, next, then what you did. */
  upcoming?: React.ReactNode;
}) {
  const [state, setState] = useState<Record<string, "pending" | "done" | "open">>({});
  const [justDone, setJustDone] = useState<DoneItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Set<string>>(new Set());

  // Leaving the page mid-undo still saves the tick.
  useEffect(() => {
    const t = timers.current;
    const p = pending.current;
    return () => {
      for (const id of p) {
        clearTimeout(t[id]);
        void setItemDone(id, true);
      }
    };
  }, []);

  const save = (id: string, isDone: boolean, title: string) =>
    startTransition(async () => {
      try {
        await setItemDone(id, isDone);
      } catch {
        setError(`Couldn't save "${title}". Try again.`);
        setState((s) => ({ ...s, [id]: isDone ? "open" : "done" }));
        setJustDone((d) => d.filter((x) => x.id !== id));
      }
    });

  function tick(item: BoardItem) {
    setError(null);
    setState((s) => ({ ...s, [item.id]: "pending" }));
    pending.current.add(item.id);
    timers.current[item.id] = setTimeout(() => {
      pending.current.delete(item.id);
      setState((s) => ({ ...s, [item.id]: "done" }));
      const goal = groups.find((g) => g.items.some((i) => i.id === item.id))?.title;
      setJustDone((d) => [{ id: item.id, title: item.title, when: "Just now", goal: goal ? `For: ${goal}` : undefined }, ...d.filter((x) => x.id !== item.id)]);
      save(item.id, true, item.title);
    }, UNDO_MS);
  }

  function undo(id: string) {
    clearTimeout(timers.current[id]);
    pending.current.delete(id);
    setState((s) => ({ ...s, [id]: "open" }));
  }

  function reopen(d: DoneItem) {
    setError(null);
    setState((s) => ({ ...s, [d.id]: "open" }));
    setJustDone((x) => x.filter((y) => y.id !== d.id));
    save(d.id, false, d.title);
  }

  const showOpen = (i: BoardItem) => state[i.id] !== "done";
  const grouped = groups.map((g) => ({ ...g, open: g.items.filter(showOpen), doneNow: g.done + g.items.filter((i) => state[i.id] === "done").length }));
  const openOther = items.filter(showOpen);
  const allItems = [...groups.flatMap((g) => g.items), ...items];
  const reopened = new Set(
    Object.entries(state)
      .filter(([, v]) => v === "open")
      .map(([k]) => k),
  );
  const doneList = [...justDone, ...done.filter((d) => !reopened.has(d.id) && !justDone.some((j) => j.id === d.id))];
  // Steps the student just un-ticked come back to the top of the list until the page refreshes.
  const back = [...done, ...justDone].filter((d) => reopened.has(d.id) && !allItems.some((i) => i.id === d.id));
  const openCount = [...grouped.flatMap((g) => g.open), ...openOther].filter((i) => state[i.id] !== "pending").length + back.length;

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[28px] border-2 border-ink bg-white/95 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[22px] font-extrabold">This week</h2>
          <span className="rounded-full bg-soft px-3 py-1 text-[13px] font-extrabold text-ink-2">{openCount} open</span>
        </div>

        {grouped
          .filter((g) => g.open.length > 0)
          .map((g) => {
            const accent = g.dated ? "var(--school)" : "var(--color-ink)";
            return (
              <div
                key={g.key}
                className={`flex flex-col gap-3.5 rounded-[22px] border p-3 sm:p-5 ${g.dated ? "border-[#F3D3D3] bg-[#FDF3F3]" : "border-line bg-soft/60"}`}
              >
                <div className="flex items-start gap-3.5">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl text-white sm:size-12" style={{ background: accent }}>
                    {g.dated ? <Target size={24} aria-hidden="true" /> : <Flag size={22} aria-hidden="true" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs font-extrabold uppercase tracking-[.08em]" style={{ color: g.dated ? "var(--school)" : "var(--color-muted)" }}>
                      Milestone · {g.when}
                    </span>
                    <b className="text-[19px] leading-tight">{g.title}</b>
                    <span className="text-[13px] text-ink-2 sm:text-sm">{g.note}</span>
                  </div>
                  <span className="flex shrink-0 flex-col items-end">
                    <b className="text-[19px]" style={{ color: accent }}>
                      {g.doneNow} of {g.total}
                    </b>
                    <span className="text-xs font-bold text-muted">
                      {g.days === null ? "tasks" : g.days <= 0 ? "today" : g.days === 1 ? "1 day left" : `${g.days} days left`}
                    </span>
                  </span>
                </div>
                <ol className="flex flex-col">
                  {g.open.map((item, i) => (
                    <li key={item.id} className="flex items-stretch gap-2 sm:gap-3">
                      <div className="flex w-6 shrink-0 flex-col items-center sm:w-7">
                        <span
                          className="mt-[13px] inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold transition-colors duration-300 sm:size-7"
                          style={state[item.id] === "pending" ? { background: "var(--color-done)", color: "#fff" } : { background: "#fff", color: accent, boxShadow: `inset 0 0 0 2px ${accent}` }}
                        >
                          {state[item.id] === "pending" ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : g.done + i + 1}
                        </span>
                        <span className={`w-0.5 flex-1 ${g.dated ? "bg-[#E8C3C3]" : "bg-line"}`} />
                      </div>
                      <Row item={item} pending={state[item.id] === "pending"} onTick={() => tick(item)} onUndo={() => undo(item.id)} />
                    </li>
                  ))}
                  <li className="flex items-center gap-2 sm:gap-3">
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-white sm:size-7" style={{ background: accent }}>
                      <Flag size={14} strokeWidth={2.6} aria-hidden="true" />
                    </span>
                    <b className="text-[15px]" style={{ color: accent }}>
                      {g.dated ? `${g.title} · ${g.when}` : `${g.title}: mark it done on your road`}
                    </b>
                  </li>
                </ol>
              </div>
            );
          })}

        {(openOther.length > 0 || back.length > 0) && groups.some((g) => g.items.length > 0) && <h3 className="text-[15px] font-extrabold text-ink-2">Also this semester</h3>}
        {(openOther.length > 0 || back.length > 0) && (
          <div className="flex flex-col">
            {back.map((d) => (
              <Row
                key={d.id}
                item={{ id: d.id, title: d.title, meta: "Back on your list", date: null, fixed: false }}
                pending={false}
                onTick={() => tick({ id: d.id, title: d.title, meta: "", date: null, fixed: false })}
                onUndo={() => undo(d.id)}
              />
            ))}
            {openOther.map((item) => (
              <Row key={item.id} item={item} pending={state[item.id] === "pending"} onTick={() => tick(item)} onUndo={() => undo(item.id)} />
            ))}
          </div>
        )}

        {openCount === 0 && !Object.values(state).includes("pending") && (
          <p className="rounded-2xl bg-done-bg px-4 py-3 text-sm font-semibold text-done-ink">All done for now. Your next appointment adds more.</p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-soft pt-3 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-full bg-firm" />
            Date can&apos;t move
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-full bg-[#9AA49F]" />
            Aim to finish by
          </span>
        </div>
      </section>

      {upcoming}

      {doneList.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-3xl border border-line bg-white/95 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-extrabold">Done this semester</h2>
            <span className="rounded-full bg-done-bg px-2.5 py-0.5 text-[13px] font-extrabold text-done-ink">{doneList.length}</span>
          </div>
          {doneList.map((d) => (
            <div key={d.id} className={`flex items-center gap-3 rounded-[14px] bg-done-bg px-3.5 py-3 ${d.when === "Just now" ? "anim-pop" : ""}`}>
              <button
                type="button"
                onClick={() => reopen(d)}
                aria-label={`Mark ${d.title} not done`}
                title="Not done after all? Tap to put it back."
                className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-done text-white transition-transform active:scale-90"
              >
                <Check size={15} strokeWidth={3.2} aria-hidden="true" />
              </button>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-bold text-done-ink">{d.title}</span>
                {d.goal && <span className="text-xs font-semibold text-done-ink/80">{d.goal}</span>}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-done-ink">{d.when}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Row({ item, pending, onTick, onUndo }: { item: BoardItem; pending: boolean; onTick: () => void; onUndo: () => void }) {
  return (
    <div
      className={`mb-2.5 flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] border px-3 py-3 sm:px-3.5 transition-colors duration-300 ${pending ? "border-[#B9DCC2] bg-done-bg" : "border-line bg-white"}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={pending ? onUndo : onTick}
          aria-label={pending ? `Undo ${item.title}` : `Mark ${item.title} done`}
          aria-pressed={pending}
          className={`inline-flex size-[26px] shrink-0 items-center justify-center rounded-lg border-2 text-white transition-colors duration-300 ${pending ? "border-done bg-done" : "border-[#9AA49F] bg-white hover:border-done hover:bg-done-bg"}`}
        >
          {pending && <Check size={15} strokeWidth={3.2} aria-hidden="true" className="anim-pop" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            href={`/student/tasks/${item.id}`}
            className={`text-[15px] font-bold transition-colors duration-300 ${pending ? "text-muted line-through" : "hover:underline"}`}
          >
            {item.title}
          </Link>
          {item.meta && !pending && <span className="text-[13px] text-muted">{item.meta}</span>}
          {item.date && !pending && (
            <span className={`text-[13px] sm:hidden ${item.fixed ? "font-extrabold text-firm" : "font-bold text-muted"}`}>{item.date}</span>
          )}
        </div>
        {pending ? (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-extrabold text-white"
          >
            <Undo2 size={15} aria-hidden="true" />
            Undo
          </button>
        ) : item.date ? (
          <span
            className={
              item.fixed
                ? "hidden shrink-0 rounded-full bg-firm-bg px-2.5 py-1 text-[13px] font-extrabold text-firm sm:inline"
                : "hidden shrink-0 text-[13px] font-bold text-muted sm:inline"
            }
          >
            {item.date}
          </span>
        ) : null}
      </div>
      {pending && (
        <span className="block h-[3px] overflow-hidden rounded bg-[#B9DCC2]" aria-hidden="true">
          <span className="block h-[3px] origin-left bg-done" style={{ animation: `melon-drain ${UNDO_MS}ms linear forwards` }} />
        </span>
      )}
    </div>
  );
}
