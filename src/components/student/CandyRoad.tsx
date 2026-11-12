"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { logWin, setItemDone, setPin } from "@/app/student/actions";
import { buildRoad, ICONS, placeLabels, ROAD_W, ROAD_X, type Box, type Road } from "@/lib/roadmap/road";

// The Roadmap page's candy road. Every semester is a numbered button; opening one plants its flags on the
// road, evenly spaced. Junior fall is where the road forks into the student's paths. A little student walks
// to whatever the cursor is near. Hovering a flag shows what it was about and what the student got out of it.

export type RoadItem = {
  id: string;
  /** Short label for the road; the full title is in `title`. */
  label: string;
  title: string;
  icon: string;
  state: "done" | "open" | "planned";
  sub: string;
  mine: boolean;
  about: string;
  wins: string[];
  /** A milestone for this semester that the student can mark done from the road. `ask` milestones have a date
   * ("Did you go?") and are `ready` once it has passed. */
  claim?: { title: string; kind: string; ask: boolean; ready: boolean; itemId?: string };
  /** The action items behind this milestone: what the student did (done) or still has to do. */
  tasks?: Array<{ title: string; done: boolean }>;
  /** Where "See action items" goes: the Action items tab, focused on this milestone. */
  href: string;
};
export type RoadSemester = { term: string; short: string; year: string; status: "done" | "now" | "next"; items: RoadItem[]; canAdd: boolean };
export type RoadPath = {
  id: string;
  name: string;
  goal: string;
  color: string;
  /** The path's own color. The pinned road is drawn in ink, so this is what flashes when you switch to it. */
  accent?: string;
  ink: string;
  tag: string;
  tagBg: string;
  tagInk: string;
  action: "switch" | "pin" | "full" | "pinned";
};

type Props = {
  firstName: string;
  semesters: RoadSemester[];
  current: number;
  fork: number;
  zones: string[];
  main: RoadPath | null;
  others: RoadPath[];
  openTerm: string | null;
  highlight: string | null;
};

type Stop = { type: "rest" } | { type: "goal" } | { type: "fork" } | { type: "node"; k: number } | { type: "item"; k: number; j: number };

// Everyone walks the road as the same little grad-cap student.

const MIN_SCALE = 0.7;

const WIN_KINDS = [
  { id: "event", label: "Event" },
  { id: "networking", label: "Club or people" },
  { id: "project", label: "Project" },
  { id: "experience", label: "Job or research" },
  { id: "skill", label: "Skill" },
  { id: "certification", label: "Certificate" },
] as const;

const BURST = [
  [56, 0, "#c8f169"],
  [40, 40, "#f25c66"],
  [0, 56, "#8b7cf6"],
  [-40, 40, "#5ab8e6"],
  [-56, 0, "#c8f169"],
  [-40, -40, "#f25c66"],
  [0, -56, "#8b7cf6"],
  [40, -40, "#5ab8e6"],
] as const;

const ZONE_FILLS = ["#e3f4ea", "#e4f2fa", "#fff4f2", "#edeaff"];

export function CandyRoad({ firstName, semesters, current, fork, zones, main, others, openTerm, highlight }: Props) {
  const n = semesters.length;
  const canAdd = (k: number) => semesters[k].canAdd;
  const asked = openTerm ? semesters.findIndex((s) => s.term === openTerm) : -1;
  const startOpen = asked >= 0 ? asked : current;
  const [open, setOpen] = useState<boolean[]>(() => semesters.map((_, k) => k === startOpen));
  const [allMode, setAllMode] = useState(false);
  const [tip, setTip] = useState<{ k: number; j: number } | null>(null);
  const [adding, setAdding] = useState(-1);
  const [draft, setDraft] = useState({ title: "", kind: "event", outcome: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(highlight);
  const [burst, setBurst] = useState(0);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [scale, setScale] = useState(1);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- geometry
  const counts = semesters.map((s, k) => s.items.length + (canAdd(k) ? 1 : 0));
  const doneNow = semesters[current]?.items.filter((i) => i.state === "done").length ?? 0;
  const road: Road = useMemo(
    () => buildRoad({ counts, open, fork, current, doneInCurrent: doneNow, addInCurrent: canAdd(current), spurs: others.length }),
    // counts is derived from semesters; open, fork and current are the only other inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(counts), open.join(), fork, current, doneNow, others.length],
  );

  // Labels go where they don't touch the road, the buttons or each other.
  const layout = useMemo(() => {
    const extra: Box[] = [];
    road.nodes.forEach((p) => extra.push({ x: p.x - 40, y: p.y - 40, w: 80, h: 80 }));
    road.nodes.forEach((p) =>
      extra.push(p.x < ROAD_X.mid ? { x: p.x - 48 - 200, y: p.y - 32, w: 200, h: 60 } : { x: p.x + 48, y: p.y - 32, w: 200, h: 60 }),
    );
    extra.push({ x: road.fork.x - 40, y: road.fork.y - 40, w: 80, h: 80 });
    extra.push(
      road.fork.x >= ROAD_X.mid
        ? { x: road.fork.x + 44, y: road.fork.y - 96, w: 270, h: 88 }
        : { x: road.fork.x - 44 - 270, y: road.fork.y - 96, w: 270, h: 88 },
    );
    road.spurEnds.forEach((e) =>
      extra.push(e.x > road.fork.x ? { x: e.x - 14, y: e.y - 54, w: 300, h: 76 } : { x: e.x - 290, y: e.y - 54, w: 304, h: 76 }),
    );
    extra.push({ x: road.goal.x - 110, y: road.goal.y - 54, w: 220, h: 120 });
    zoneTops(road, n).forEach((t) => extra.push({ x: 12, y: t + 10, w: 250, h: 46 }));
    const flags: Array<{ at: { x: number; y: number }; title: string; sub: string }> = [];
    semesters.forEach((s, k) => {
      road.itemIdx[k].forEach((idx, j) => {
        const it = s.items[j];
        flags.push(
          it
            ? { at: road.S[idx], title: it.label, sub: it.sub }
            : { at: road.S[idx], title: "Add something you did", sub: "A club, a job, a project, anything" },
        );
      });
    });
    const pillW = 70 + (main ? `Your path: ${main.name}` : "Pick a path").length * 7.2;
    const placed = placeLabels(road, flags, extra, { w: pillW, h: 30 });
    return { labels: placed.labels, pill: placed.pill, pillW };
  }, [road, semesters, main, n]);

  // ---- scale the road to the page width
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // On phones the road would shrink until its words are unreadable, so it stops at 70% and scrolls sideways.
    const ro = new ResizeObserver(() => setScale(Math.max(MIN_SCALE, Math.min(1, el.clientWidth / ROAD_W))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    const at = road.S[road.nodeIdx[current]];
    if (el && at && el.scrollWidth > el.clientWidth) el.scrollLeft = at.x * scale - el.clientWidth / 2;
    // Only on load and resize, not every time a semester opens and the road grows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, current]);

  // ---- coming back from an action item: show that flag and ring it
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`road-flag-${highlight}`);
    el?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setHl(null), 3400);
    return () => clearTimeout(t);
  }, [highlight]);

  // ---- walking. Runs outside React state so moving the mouse doesn't re-render the road.
  const roadRef = useRef(road);
  const stopRef = useRef<Stop>({ type: "rest" });
  const posRef = useRef(-1);
  const lastP = useRef<{ x: number; y: number } | null>(null);
  const avRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const facing = useRef(1);

  const stopIdx = useCallback((r: Road, s: Stop) => {
    if (s.type === "rest") return r.rest;
    if (s.type === "goal") return r.goal.idx;
    if (s.type === "fork") return Math.max(0, r.fork.idx - 9);
    if (s.type === "node") return Math.max(0, r.nodeIdx[s.k] - 9);
    const v = r.itemIdx[s.k]?.[s.j];
    return v === undefined ? Math.max(0, r.nodeIdx[s.k] - 9) : Math.max(0, v - 9);
  }, []);

  useEffect(() => {
    // A new road (a semester opened or closed): keep the student where they were on screen.
    if (lastP.current && roadRef.current !== road) {
      let best = 0;
      let bd = Infinity;
      road.S.forEach((q, i) => {
        const d = (q.x - lastP.current!.x) ** 2 + (q.y - lastP.current!.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      posRef.current = best;
    }
    roadRef.current = road;
  }, [road]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      const r = roadRef.current;
      const goal = stopIdx(r, stopRef.current);
      let p = posRef.current < 0 ? goal : posRef.current;
      const dist = Math.abs(goal - p);
      const moving = dist > 0.01;
      if (moving) {
        const step = reduce ? dist : Math.min(dist, Math.max(1, Math.min(9, dist * 0.08)));
        const np = p + Math.sign(goal - p) * step;
        const a = r.S[Math.round(p)];
        const b = r.S[Math.round(np)];
        if (b.x < a.x - 0.05) facing.current = -1;
        else if (b.x > a.x + 0.05) facing.current = 1;
        p = np;
      }
      posRef.current = p;
      const at = r.S[Math.max(0, Math.min(r.S.length - 1, Math.round(p)))];
      lastP.current = at;
      const lift = [...r.nodes, r.fork].some((q) => (q.x - at.x) ** 2 + (q.y - at.y) ** 2 < 40 * 40) ? 30 : 0;
      if (avRef.current) {
        avRef.current.style.transform = `translate(${at.x - 28}px, ${at.y - 62 - lift}px)`;
        avRef.current.classList.toggle("walking", moving);
      }
      if (faceRef.current) faceRef.current.style.transform = `scaleX(${facing.current})`;
      const dir = Math.sign(goal - p) || 1;
      trailRefs.current.forEach((el, i) => {
        if (!el) return;
        if (!moving) {
          el.style.opacity = "0";
          return;
        }
        const q = r.S[Math.max(0, Math.min(r.S.length - 1, Math.round(p - dir * (i + 1) * 4)))];
        const rad = 6 - i;
        el.style.transform = `translate(${q.x - rad}px, ${q.y - rad - 3}px)`;
        el.style.width = el.style.height = `${rad * 2}px`;
        el.style.opacity = String(0.6 - i * 0.14);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stopIdx]);

  const walk = (s: Stop) => {
    stopRef.current = s;
  };

  // ---- switching paths
  // When the pinned path changes (from the fork here or "Switch my pin" above the road), make the swap
  // obvious: bring the fork into view, repaint the road from the fork to the goal in the new color, pop the
  // path label and goal flag, and say what happened in words.
  const [swap, setSwap] = useState<{ key: number; to: string; from: string | null } | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const prevMain = useRef<{ id: string; name: string } | null>(main ? { id: main.id, name: main.name } : null);
  const forkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = prevMain.current;
    prevMain.current = main ? { id: main.id, name: main.name } : null;
    if (!main || before?.id === main.id) return;
    setSwap((s) => ({ key: (s?.key ?? 0) + 1, to: main.name, from: before?.name ?? null }));
    setBurst((b) => b + 1);
    walk({ type: "fork" });
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    forkRef.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    const t = setTimeout(() => setSwap(null), 5200);
    return () => clearTimeout(t);
    // Only a change of pinned path should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main?.id]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tip || adding >= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scale;
    const my = (e.clientY - rect.top) / scale;
    if (my < 0) return;
    const r = roadRef.current;
    const cands: Array<{ s: Stop; i: number }> = [];
    r.nodeIdx.forEach((i, k) => cands.push({ s: { type: "node", k }, i }));
    r.itemIdx.forEach((list, k) =>
      list.forEach((i, j) => cands.push({ s: j < semesters[k].items.length ? { type: "item", k, j } : { type: "node", k }, i })),
    );
    cands.push({ s: { type: "fork" }, i: r.fork.idx }, { s: { type: "goal" }, i: r.goal.idx });
    let best = cands[0];
    let bd = Infinity;
    cands.forEach((c) => {
      const q = r.S[c.i];
      const d = (q.x - mx) ** 2 + (q.y - my) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    });
    walk(best.s);
  };

  // ---- opening semesters
  const toggle = (k: number) => {
    setOpen((o) => {
      if (o[k]) return o.map((v, i) => (i === k ? false : v));
      return allMode ? o.map((v, i) => (i === k ? true : v)) : o.map((_, i) => i === k);
    });
    setAdding(-1);
    walk({ type: "node", k });
  };
  const openable = (k: number) => counts[k] > 0;
  const anyClosed = semesters.some((_, k) => openable(k) && !open[k]);
  const toggleAll = () => {
    if (anyClosed) {
      setAllMode(true);
      setOpen(semesters.map((_, k) => openable(k)));
    } else {
      setAllMode(false);
      setOpen(semesters.map((_, k) => k === current));
    }
  };

  // ---- hover summary
  const showTip = (k: number, j: number) => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setTip({ k, j });
    walk({ type: "item", k, j });
  };
  const hideTip = () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 220);
  };
  useEffect(() => () => void (tipTimer.current && clearTimeout(tipTimer.current)), []);

  // ---- marking this semester's milestone done from its flag
  const [claimError, setClaimError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [claimNote, setClaimNote] = useState("");
  useEffect(() => {
    try {
      setSkipped(JSON.parse(localStorage.getItem("melon-not-this-time") ?? "[]"));
    } catch {
      /* private window: it just asks again */
    }
  }, []);
  const notThisTime = (id: string) => {
    const next = [...skipped, id];
    setSkipped(next);
    setTip(null);
    try {
      localStorage.setItem("melon-not-this-time", JSON.stringify(next));
    } catch {
      /* fine */
    }
  };
  const claimMilestone = (it: RoadItem) => {
    if (!it.claim) return;
    setClaimError(null);
    start(async () => {
      // A milestone already on the roadmap (an advisor set it) is just marked done.
      if (it.claim!.itemId) {
        try {
          await setItemDone(it.claim!.itemId, true);
          setTip(null);
          setHl(it.id);
          setTimeout(() => setHl(null), 3400);
        } catch (e) {
          setClaimError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
        }
        return;
      }
      const res = await logWin({
        term: semesters[tip?.k ?? current].term,
        title: it.claim!.title,
        kind: it.claim!.kind,
        outcome: claimNote.trim() || undefined,
      });
      if (res.error) setClaimError(res.error);
      else {
        setTip(null);
        setClaimNote("");
        if (res.id) {
          setHl(res.id);
          setTimeout(() => setHl(null), 3400);
        }
      }
    });
  };

  // ---- adding something you did
  const saveWin = () => {
    const k = adding;
    setFormError(null);
    start(async () => {
      const res = await logWin({ term: semesters[k].term, title: draft.title, kind: draft.kind, outcome: draft.outcome || undefined });
      if (res.error) setFormError(res.error);
      else {
        setAdding(-1);
        setDraft({ title: "", kind: "event", outcome: "" });
        if (res.id) {
          setHl(res.id);
          setTimeout(() => setHl(null), 3400);
        }
      }
    });
  };

  const choosePath = (p: RoadPath) => {
    setPinError(null);
    setSwitching(p.id);
    start(async () => {
      try {
        await setPin(p.id, true);
        // A second pin (freshmen and sophomores) doesn't change the main road, so celebrate it here.
        if (main && p.action === "pin") {
          setBurst((b) => b + 1);
          walk({ type: "fork" });
        }
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "Couldn't change that pin. Try again.");
      } finally {
        setSwitching(null);
      }
    });
  };

  // ---- drawing
  const tops = zoneTops(road, n);
  const zoneBottoms = tops.map((_, z) => (z < tops.length - 1 ? tops[z + 1] : road.goal.y - 50));
  const wave = (y0: number, y1: number) =>
    `M 0 ${y0} Q ${ROAD_W * 0.25} ${y0 - 24} ${ROAD_W * 0.5} ${y0} T ${ROAD_W} ${y0} L ${ROAD_W} ${y1} L 0 ${y1} Z`;
  const pathCol = main?.color ?? "#b9c1bc";
  let li = 0;
  const flagViews = semesters.flatMap((s, k) =>
    road.itemIdx[k].map((idx, j) => {
      const at = road.S[idx];
      const spot = layout.labels[li++];
      return { k, j, at, spot, item: s.items[j] as RoadItem | undefined };
    }),
  );
  const tipView = (() => {
    if (!tip) return null;
    const it = semesters[tip.k]?.items[tip.j];
    const idx = road.itemIdx[tip.k]?.[tip.j];
    if (!it || idx === undefined) return null;
    const q = road.S[idx];
    const l = Math.max(8, Math.min(ROAD_W - 318, q.x + 12 - 155));
    return { it, q, l, arrow: Math.max(16, Math.min(280, q.x + 12 - l - 7)), term: semesters[tip.k].short };
  })();
  const addAt = adding >= 0 ? road.S[road.itemIdx[adding]?.[semesters[adding].items.length] ?? road.nodeIdx[adding]] : null;

  return (
    <section aria-label="Your road" className="relative">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-xl flex-col items-start gap-2">
          <span className="text-xs font-extrabold uppercase tracking-[.14em]" style={{ color: "var(--school)" }}>
            Your road
          </span>
          <h1 className="font-brand text-[34px] font-bold leading-tight tracking-tight">Hi {firstName}, here&apos;s your road.</h1>
          <p className="text-sm text-ink-2">Tap a numbered semester to plant its flags on the road. Hover a flag to see what it was about.</p>
          <button
            type="button"
            onClick={toggleAll}
            className="mt-1 rounded-full border-2 border-ink bg-white px-3.5 py-1.5 text-[13px] font-bold transition-transform hover:-translate-y-0.5"
          >
            {anyClosed ? "Open every semester" : "Close all but this semester"}
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="mx-auto w-full overflow-x-auto overflow-y-hidden rounded-[28px] border border-line"
        style={{ height: road.H * scale, maxWidth: ROAD_W }}
      >
        <div style={{ width: ROAD_W * scale, height: road.H * scale }}>
          <div
            className="relative origin-top-left bg-ground font-sans text-ink"
            style={{ width: ROAD_W, height: road.H, transform: `scale(${scale})` }}
            onMouseMove={onMove}
            onMouseLeave={() => !tip && adding < 0 && walk({ type: "rest" })}
          >
            <svg width={ROAD_W} height={road.H} className="absolute inset-0" aria-hidden="true">
              {tops.map((t, z) => (
                <path key={z} d={wave(t, zoneBottoms[z] + 30)} fill={ZONE_FILLS[z % ZONE_FILLS.length]} />
              ))}
              <path d={wave(zoneBottoms[zoneBottoms.length - 1], road.H)} fill="var(--color-ground)" />
              {road.paths.spurs.map((d, i) => (
                <g key={i} className="road-late">
                  <path d={d} fill="none" stroke="#e3e6e4" strokeWidth={22} strokeLinecap="round" />
                  <path d={d} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" />
                  <path d={d} fill="none" stroke={others[i]?.color ?? "#b9c1bc"} strokeWidth={3.5} strokeDasharray="2 10" strokeLinecap="round" />
                </g>
              ))}
              <path
                className="road-draw"
                pathLength={1}
                d={road.paths.all}
                fill="none"
                stroke="#d6ddd8"
                strokeWidth={36}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                className="road-draw"
                pathLength={1}
                d={road.paths.all}
                fill="none"
                stroke="#fff"
                strokeWidth={26}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g className="road-late">
                <path d={road.paths.past} fill="none" stroke="var(--color-done)" strokeWidth={5} strokeDasharray="3 13" strokeLinecap="round" />
                {road.paths.future && (
                  <path d={road.paths.future} fill="none" stroke="#b9c1bc" strokeWidth={5} strokeDasharray="3 13" strokeLinecap="round" />
                )}
                <path
                  key={main?.id ?? "none"}
                  className={swap ? "road-fade" : undefined}
                  d={road.paths.chosen}
                  fill="none"
                  stroke={pathCol}
                  strokeWidth={5}
                  strokeDasharray="3 13"
                  strokeLinecap="round"
                />
              </g>
              {swap && (
                // The new path's color sweeps down the road from the fork to the goal, then settles.
                <path
                  key={swap.key}
                  className="road-swap"
                  pathLength={1}
                  d={road.paths.chosen}
                  fill="none"
                  stroke={main?.accent ?? pathCol}
                  strokeWidth={20}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>

            {tops.map((t, z) => (
              <div
                key={z}
                className="absolute flex items-center gap-2 rounded-full border-2 border-ink bg-white py-1.5 pl-1.5 pr-3.5"
                style={{ left: 16, top: t + 14 }}
              >
                <span className="inline-flex h-6 items-center rounded-full bg-ink px-2.5 font-brand text-xs font-bold text-lime">Lv {z + 1}</span>
                <span className="font-brand text-[15px] font-bold">{zones[z]}</span>
                <span className="text-xs text-muted">{semesters[z * 2]?.year}</span>
              </div>
            ))}

            {/* Flags */}
            {flagViews.map(({ k, j, at, spot, item }) => {
              const add = !item;
              const sty = add
                ? { fill: "#fff", edge: "var(--color-ink)", ink: "var(--color-ink)", dash: "4 3", lab: "var(--color-ink)" }
                : item.state === "done"
                  ? { fill: "var(--color-done)", edge: "var(--color-rind)", ink: "#fff", dash: undefined, lab: "var(--color-ink)" }
                  : item.state === "open"
                    ? { fill: "#fff", edge: "var(--school)", ink: "var(--school)", dash: "4 3", lab: "var(--school)" }
                    : { fill: "#fff", edge: "#b9c1bc", ink: "var(--color-muted)", dash: "4 3", lab: "var(--color-ink-2)" };
              const flagSvg = (
                <svg width={48} height={56} viewBox="0 0 48 56" aria-hidden="true">
                  <ellipse cx={10} cy={51} rx={8} ry={3} fill="rgba(20,33,27,.18)" />
                  <path d="M10 51 L10 5" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
                  <circle cx={10} cy={4} r={3} fill="var(--color-ink)" />
                  <g className="road-pen">
                    <g className="road-wave" style={{ animationDelay: `${(k * 3 + j) * 230}ms` }}>
                      <path
                        d="M11.5 7 H44 L37 17.5 L44 28 H11.5 Z"
                        fill={sty.fill}
                        stroke={sty.edge}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeDasharray={sty.dash}
                      />
                      <g transform="translate(15.5 9.5) scale(0.68)">
                        <path
                          d={ICONS[add ? "plus" : item.icon] ?? ICONS.star}
                          fill="none"
                          stroke={sty.ink}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    </g>
                  </g>
                </svg>
              );
              const common = { className: "road-flag absolute block", style: { left: 0, top: 0, width: 48, height: 56 } as CSSProperties };
              return (
                <div key={item?.id ?? `add-${k}`}>
                  <div
                    className="road-plant absolute"
                    style={{ left: at.x - 10, top: at.y - 50, width: 48, height: 56, animationDelay: `${j * 70}ms` }}
                  >
                    {item && hl === item.id && <span className="road-ring absolute left-0.5 top-0 size-11 rounded-full border-4 border-lime" />}
                    {add ? (
                      <button
                        type="button"
                        {...common}
                        aria-label={`Add something you did in ${semesters[k].short}`}
                        onClick={() => {
                          setAdding(k);
                          setFormError(null);
                          setTip(null);
                        }}
                      >
                        {flagSvg}
                      </button>
                    ) : (
                      <Link
                        {...common}
                        id={`road-flag-${item.id}`}
                        prefetch={false}
                        href={item.href}
                        aria-label={`${item.title}, ${item.sub}. Opens its action items.`}
                        onMouseEnter={() => showTip(k, j)}
                        onMouseLeave={hideTip}
                        onFocus={() => showTip(k, j)}
                        onBlur={hideTip}
                      >
                        {flagSvg}
                      </Link>
                    )}
                  </div>
                  <div
                    className="road-fade pointer-events-none absolute flex flex-col gap-0.5"
                    style={{
                      left: spot.side === "R" ? spot.x : spot.x + spot.w - 230,
                      top: spot.y,
                      width: 230,
                      alignItems: spot.side === "R" ? "flex-start" : "flex-end",
                      textAlign: spot.side === "R" ? "left" : "right",
                      animationDelay: `${j * 70}ms`,
                    }}
                  >
                    <span className="text-sm font-bold leading-snug" style={{ color: sty.lab }}>
                      {add ? "Add something you did" : item.label}
                    </span>
                    <span className="text-xs" style={{ color: item?.mine ? "var(--color-done-ink)" : "var(--color-muted)" }}>
                      {add ? "A club, a job, a project, anything" : item.sub}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Semesters */}
            {semesters.map((s, k) => {
              const p = road.nodes[k];
              const left = p.x < ROAD_X.mid;
              const pal =
                s.status === "done"
                  ? { face: "var(--color-done)", base: "var(--color-rind)", ring: "var(--color-rind)", ink: "#fff", bs: "solid" }
                  : s.status === "now"
                    ? {
                        face: "var(--school)",
                        base: "color-mix(in srgb, var(--school) 60%, black)",
                        ring: "color-mix(in srgb, var(--school) 60%, black)",
                        ink: "#fff",
                        bs: "solid",
                      }
                    : { face: "#fff", base: "var(--color-line)", ring: "#b9c1bc", ink: "var(--color-muted)", bs: "dashed" };
              const isOpen = open[k] && openable(k);
              return (
                <div key={s.term}>
                  <div
                    className="road-float absolute"
                    style={{ left: p.x - 32, top: p.y - 32, width: 64, height: 72, animationDelay: `${k * 380}ms` }}
                  >
                    {s.status === "now" && (
                      <span className="road-pulse absolute -left-1.5 -top-1.5 size-[76px] rounded-full" style={{ background: "var(--school)" }} />
                    )}
                    <button
                      type="button"
                      className="road-node road-popin absolute inset-0"
                      style={{ animationDelay: `${150 + k * 90}ms` }}
                      aria-label={`Semester ${k + 1}, ${s.short}, ${s.year}${s.status === "now" ? ", you are here" : ""}.${openable(k) ? (isOpen ? " Close it." : " Show everything on the road.") : ""}`}
                      aria-expanded={openable(k) ? isOpen : undefined}
                      onClick={() => (openable(k) ? toggle(k) : walk({ type: "node", k }))}
                      onFocus={() => walk({ type: "node", k })}
                    >
                      <span className="absolute left-0 top-[7px] size-16 rounded-full" style={{ background: pal.base }} />
                      <span
                        className="road-face absolute left-0 top-0 flex size-16 items-center justify-center rounded-full font-brand text-[26px] font-extrabold"
                        style={{ background: pal.face, border: `3px ${pal.bs} ${pal.ring}`, color: pal.ink }}
                      >
                        {k + 1}
                      </span>
                    </button>
                    {isOpen &&
                      BURST.map(([dx, dy, c], i) => (
                        <span
                          key={i}
                          className="road-spark"
                          style={{ background: c, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` } as CSSProperties}
                        />
                      ))}
                  </div>
                  <div
                    className="absolute flex w-[200px] flex-col gap-1"
                    style={{
                      left: left ? p.x - 48 - 200 : p.x + 48,
                      top: p.y - 30,
                      alignItems: left ? "flex-end" : "flex-start",
                      textAlign: left ? "right" : "left",
                    }}
                  >
                    <span className="font-brand text-xl font-bold">
                      {s.short}
                      {s.status === "now" ? " · now" : ""}
                    </span>
                    <span className="text-[12.5px] text-ink-2">
                      {s.year}
                      {s.status === "now" ? " · you are here" : ""}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* The fork in junior fall */}
            <div
              ref={forkRef}
              className="road-float absolute"
              style={{ left: road.fork.x - 30, top: road.fork.y - 34, width: 60, height: 68, animationDelay: "900ms" }}
            >
              <button
                type="button"
                className="road-node road-popin absolute inset-0"
                style={{ animationDelay: "600ms" }}
                aria-label={`${semesters[fork]?.short}: pick your path. ${main ? `You're on ${main.name}.` : "No path pinned yet."}`}
                onClick={() => walk({ type: "fork" })}
                onFocus={() => walk({ type: "fork" })}
              >
                <span className="absolute left-0 top-[7px] size-[60px] rounded-[18px] bg-ink" />
                <span className="road-face absolute left-0 top-0 flex size-[60px] items-center justify-center rounded-[18px] border-[3px] border-ink bg-lime">
                  <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden="true">
                    <path d={ICONS.sign} fill="none" stroke="var(--color-ink)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {burst > 0 &&
                BURST.map(([dx, dy, c], i) => (
                  <span
                    key={`${burst}-${i}`}
                    className="road-spark"
                    style={{ background: c, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` } as CSSProperties}
                  />
                ))}
            </div>
            <div
              className="absolute flex w-[260px] flex-col gap-0.5"
              style={
                road.fork.x >= ROAD_X.mid
                  ? { left: road.fork.x + 46, top: road.fork.y - 92 }
                  : { left: road.fork.x - 46 - 260, top: road.fork.y - 92, textAlign: "right" }
              }
            >
              <span className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--school)" }}>
                {semesters[fork]?.year} {semesters[fork]?.term.split(" ")[0].toLowerCase()}
              </span>
              <span className="font-brand text-xl font-bold">Pick your path</span>
              <span className="text-[12.5px] text-ink-2">
                {main
                  ? `You're on ${main.name}. The other roads stay open if you change your mind.`
                  : "Pin a path with your coach, or pick one here."}
              </span>
              {pinError && <span className="text-xs font-semibold text-firm">{pinError}</span>}
            </div>

            {others.map((p, i) => {
              const e = road.spurEnds[i];
              if (!e) return null;
              const right = e.x > road.fork.x;
              return (
                <div key={p.id} className={swap?.from === p.name ? "road-swapin" : undefined}>
                  <div className="absolute" style={{ left: e.x - 10, top: e.y - 50, width: 48, height: 56 }}>
                    <svg width={48} height={56} viewBox="0 0 48 56" aria-hidden="true">
                      <ellipse cx={10} cy={51} rx={8} ry={3} fill="rgba(20,33,27,.18)" />
                      <path d="M10 51 L10 5" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
                      <circle cx={10} cy={4} r={3} fill="var(--color-ink)" />
                      <g className="road-wave" style={{ animationDelay: `${i * 300}ms` }}>
                        <path
                          d="M11.5 7 H44 L37 17.5 L44 28 H11.5 Z"
                          fill={p.color}
                          stroke="var(--color-ink)"
                          strokeWidth={2.5}
                          strokeLinejoin="round"
                        />
                      </g>
                    </svg>
                  </div>
                  <div
                    className="absolute flex w-[230px] flex-col gap-1"
                    style={
                      right
                        ? { left: e.x + 44, top: e.y - 50, alignItems: "flex-start" }
                        : { left: e.x - 30 - 230, top: e.y - 50, alignItems: "flex-end", textAlign: "right" }
                    }
                  >
                    <span className="font-brand text-base font-bold">{p.name}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: p.tagBg, color: p.tagInk }}>
                      {p.tag}
                    </span>
                    {p.action === "pinned" ? (
                      <span className="text-xs text-muted">Pinned too. Freshmen and sophomores can pin two.</span>
                    ) : p.action === "full" ? (
                      <span className="text-xs text-muted">Unpin one to pick this</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => choosePath(p)}
                        className="text-[12.5px] font-bold text-link disabled:opacity-50"
                      >
                        {switching === p.id ? "Switching…" : p.action === "switch" ? "Switch to this path →" : "Pin this path →"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <div
              key={`pill-${main?.id ?? "none"}`}
              className={`pointer-events-none absolute flex h-[30px] items-center whitespace-nowrap rounded-full border-2 border-ink px-3.5 text-[12.5px] font-bold ${swap ? "road-swappop" : ""}`}
              style={{ left: layout.pill.x, top: layout.pill.y, background: main?.color ?? "#fff", color: main?.ink ?? "var(--color-ink)" }}
            >
              {main ? `Your path: ${main.name}` : "Pick a path"}
            </div>

            {/* The first-job goal */}
            <div
              key={`goal-${main?.id ?? "none"}`}
              className={`absolute flex w-[220px] flex-col items-center gap-1.5 text-center ${swap ? "road-swappop" : ""}`}
              style={{ left: road.goal.x - 110, top: road.goal.y - 50, animationDelay: swap ? "1.1s" : undefined }}
            >
              <svg width={44} height={54} viewBox="0 0 44 54" aria-hidden="true">
                <path d="M14 4 L14 50" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
                <path
                  className="road-goalwave"
                  d="M15 5 L40 13 L15 22 Z"
                  fill={main?.color ?? "#fff"}
                  stroke="var(--color-ink)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                <ellipse cx={14} cy={50} rx={10} ry={3} fill="#e3e6e4" />
              </svg>
              <span className="font-brand text-lg font-bold">{main?.goal ?? "Your first job"}</span>
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11.5px] font-bold text-white">
                {main ? "Your first-job goal" : "Pin a path to set it"}
              </span>
            </div>

            {/* The student */}
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                ref={(el) => {
                  trailRefs.current[i] = el;
                }}
                aria-hidden="true"
                className="road-trail pointer-events-none absolute left-0 top-0 box-border rounded-full border-[1.5px] border-[#c9d0cb] bg-white"
                style={{ opacity: 0 }}
              />
            ))}
            <div
              ref={avRef}
              aria-hidden="true"
              className="road-av pointer-events-none absolute left-0 top-0 h-[66px] w-14"
              style={{ transform: `translate(${road.S[road.rest].x - 28}px, ${road.S[road.rest].y - 62}px)` }}
            >
              <div ref={faceRef}>
                <StudentSvg size={56} legs />
              </div>
            </div>

            {/* Hover summary */}
            {tipView && (
              <div
                role="tooltip"
                onMouseEnter={() => tipTimer.current && clearTimeout(tipTimer.current)}
                onMouseLeave={hideTip}
                className="absolute w-[310px] pb-3"
                style={{ left: tipView.l, top: tipView.q.y - 56, transform: "translateY(-100%)" }}
              >
                <div className="road-fade relative flex flex-col gap-2 rounded-[18px] border-2 border-ink bg-white px-[18px] py-4 shadow-[0_5px_0_var(--color-ink)]">
                  <span
                    className="text-[11px] font-bold uppercase tracking-[.12em]"
                    style={{
                      color:
                        tipView.it.state === "done" ? "var(--color-done-ink)" : tipView.it.state === "open" ? "var(--school)" : "var(--color-muted)",
                    }}
                  >
                    {tipView.term} · {tipView.it.state === "done" ? "Done" : tipView.it.state === "open" ? "This semester" : "Planned"}
                    {tipView.it.mine ? " · added by you" : ""}
                  </span>
                  <span className="font-brand text-lg font-bold leading-snug">{tipView.it.title}</span>
                  {tipView.it.about && <p className="text-[13.5px] leading-normal text-ink-2">{tipView.it.about}</p>}
                  {(tipView.it.tasks ?? []).length > 0 && (
                    <>
                      <span className="mt-1 text-[11px] font-bold uppercase tracking-[.1em] text-muted">
                        {tipView.it.state === "done" ? "What you did to get here" : "Action items"}
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {(tipView.it.tasks ?? []).slice(0, 4).map((t) => (
                          <li key={t.title} className="flex items-start gap-2 text-[13.5px] leading-snug">
                            <Tick done={t.done} />
                            <span className={t.done && tipView.it.state !== "done" ? "text-muted line-through" : ""}>{t.title}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {tipView.it.state === "done" && tipView.it.wins.length > 0 && (
                    <>
                      <span className="mt-1 text-[11px] font-bold uppercase tracking-[.1em] text-muted">What you got out of it</span>
                      <ul className="flex flex-col gap-1.5">
                        {tipView.it.wins.slice(0, 2).map((w) => (
                          <li key={w} className="flex items-start gap-2 text-[13.5px] leading-snug">
                            <Tick done />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {tipView.it.claim && (tipView.it.claim.ready ? !skipped.includes(tipView.it.id) : false) && (
                    <div className="mt-1 flex flex-col gap-2 rounded-xl bg-soft p-3">
                      {tipView.it.claim.ask && <b className="text-[15px]">Did you go?</b>}
                      <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                        What did you get out of it? (optional)
                        <input
                          value={claimNote}
                          onChange={(e) => setClaimNote(e.target.value)}
                          maxLength={120}
                          placeholder={tipView.it.claim.ask ? "Talked to 6 employers" : "Elected club treasurer"}
                          className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => claimMilestone(tipView.it)}
                          className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-extrabold text-white disabled:opacity-60"
                        >
                          {tipView.it.claim.ask ? "Yes, I went" : "I did this"}
                        </button>
                        {tipView.it.claim.ask && (
                          <button
                            type="button"
                            onClick={() => notThisTime(tipView.it.id)}
                            className="inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-bold"
                          >
                            Not this time
                          </button>
                        )}
                      </div>
                      {claimError && <p className="text-xs font-semibold text-firm">{claimError}</p>}
                    </div>
                  )}
                  {tipView.it.href.includes("?m=") && (
                    <Link
                      prefetch={false}
                      href={tipView.it.href}
                      className="mt-1.5 self-start text-[13.5px] font-bold text-link underline underline-offset-[3px]"
                    >
                      See action items →
                    </Link>
                  )}
                  <span
                    className="absolute -bottom-[9px] size-3.5 rotate-45 border-b-2 border-r-2 border-ink bg-white"
                    style={{ left: tipView.arrow }}
                  />
                </div>
              </div>
            )}

            {/* Add something you did */}
            {addAt && (
              <form
                aria-label={`Add something you did in ${semesters[adding].short}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  saveWin();
                }}
                className="absolute flex w-[320px] flex-col gap-2.5 rounded-[18px] border-2 border-ink bg-white p-4 shadow-[0_5px_0_var(--color-ink)]"
                style={{ left: addAt.x < ROAD_X.mid ? addAt.x + 40 : addAt.x - 360, top: Math.max(8, addAt.y - 120) }}
              >
                <label htmlFor="road-win" className="font-brand text-[17px] font-bold">
                  What did you do in {semesters[adding].short}?
                </label>
                <input
                  id="road-win"
                  autoFocus
                  maxLength={80}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Volunteered at HackIU"
                  className="h-11 rounded-xl border-2 border-line px-3 text-sm"
                />
                <fieldset className="flex flex-wrap gap-1.5">
                  <legend className="mb-1 text-xs font-semibold text-muted">What kind of thing was it?</legend>
                  {WIN_KINDS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={draft.kind === w.id}
                      onClick={() => setDraft({ ...draft, kind: w.id })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${draft.kind === w.id ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
                    >
                      {w.label}
                    </button>
                  ))}
                </fieldset>
                <label htmlFor="road-win-out" className="text-xs font-semibold text-muted">
                  What did you get out of it? (optional)
                </label>
                <input
                  id="road-win-out"
                  maxLength={160}
                  value={draft.outcome}
                  onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
                  placeholder="e.g. Met two people hiring for data roles"
                  className="h-11 rounded-xl border-2 border-line px-3 text-sm"
                />
                <p className="text-xs leading-relaxed text-muted">
                  It goes on your road marked &quot;added by you&quot;. Your advisor and coach can see it too.
                </p>
                {formError && <p className="text-xs font-semibold text-firm">{formError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAdding(-1)}
                    className="h-10 rounded-xl border-2 border-line bg-white px-3.5 text-[13px] font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending || draft.title.trim().length < 2}
                    className="h-10 rounded-xl border-2 border-ink bg-done px-4 text-[13px] font-bold text-white shadow-[0_3px_0_var(--color-ink)] disabled:opacity-50"
                  >
                    {pending ? "Adding…" : "Add to my road"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
      {/* Says in words what the road just showed. Outside the scaled road, so it stays put on screen. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {swap && (
          <p
            key={swap.key}
            className="road-swappop max-w-md rounded-2xl border-2 border-ink px-4 py-3 text-sm font-bold shadow-[0_12px_30px_-10px_rgba(20,33,27,.5)]"
            style={{ background: main?.color ?? "#fff", color: main?.ink ?? "var(--color-ink)" }}
          >
            Switched to {swap.to}.{swap.from ? ` ${swap.from} is paused, and its steps come back if you switch again.` : ""}
          </p>
        )}
      </div>
    </section>
  );
}

function Tick({ done }: { done?: boolean }) {
  return (
    <span
      className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md border-2"
      style={done ? { background: "var(--color-lime)", borderColor: "var(--color-ink)" } : { background: "#fff", borderColor: "#b9c1bc" }}
    >
      {done && (
        <svg width={10} height={10} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="var(--color-ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** The y where each year's background band starts: just above its first semester. */
function zoneTops(road: Road, n: number) {
  const tops: number[] = [];
  for (let k = 0; k < n; k += 2) tops.push(road.nodes[k].y - 80);
  return tops;
}

function StudentSvg({ size, legs }: { size: number; legs?: boolean }) {
  return (
    <svg width={size} height={(size * 66) / 56} viewBox="0 0 56 66" aria-hidden="true">
      {legs && (
        <>
          <ellipse cx={28} cy={64} rx={14} ry={2.5} fill="rgba(20,33,27,.15)" />
          <path className="road-leg1" d="M24 52 L23 63" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
          <path className="road-leg2" d="M32 52 L33 63" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      <g className="road-body">
        <rect x={13} y={32} width={10} height={16} rx={3} fill="var(--color-lime)" stroke="var(--color-ink)" strokeWidth={2} />
        <path d="M17 54 Q17 33 28 33 Q39 33 39 54 Z" fill="var(--color-done)" stroke="var(--color-ink)" strokeWidth={2} />
        <circle cx={28} cy={21} r={12} fill="#fff" stroke="var(--color-ink)" strokeWidth={2} />
        <circle cx={24} cy={21} r={1.7} fill="var(--color-ink)" />
        <circle cx={32} cy={21} r={1.7} fill="var(--color-ink)" />
        <path d="M24 26 Q28 29 32 26" fill="none" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinecap="round" />
        <polygon points="13,11 28,4 43,11 28,17" fill="var(--color-ink)" />
        <path d="M41 11 L41 19" stroke="var(--color-lime)" strokeWidth={2} />
      </g>
    </svg>
  );
}
