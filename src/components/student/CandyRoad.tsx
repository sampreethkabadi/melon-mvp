"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { logWin, setPin } from "@/app/student/actions";
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
};
export type RoadSemester = { term: string; short: string; year: string; status: "done" | "now" | "next"; items: RoadItem[]; canAdd: boolean };
export type RoadPath = { id: string; name: string; goal: string; color: string; ink: string; tag: string; tagBg: string; tagInk: string; action: "switch" | "pin" | "full" | "pinned" };

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

const AVATARS = [
  { name: "Grad cap", hoodie: "#2f8f5b", hat: "cap" },
  { name: "Top bun", hoodie: "#8b7cf6", hat: "bun" },
  { name: "Beanie", hoodie: "#5ab8e6", hat: "beanie" },
  { name: "Headphones", hoodie: "#990000", hat: "phones" },
] as const;

const WIN_KINDS = [
  { id: "event", label: "Event" },
  { id: "networking", label: "Club or people" },
  { id: "project", label: "Project" },
  { id: "experience", label: "Job or research" },
  { id: "skill", label: "Skill" },
  { id: "certification", label: "Certificate" },
] as const;

const BURST = [
  [56, 0, "#c8f169"], [40, 40, "#f25c66"], [0, 56, "#8b7cf6"], [-40, 40, "#5ab8e6"],
  [-56, 0, "#c8f169"], [-40, -40, "#f25c66"], [0, -56, "#8b7cf6"], [40, -40, "#5ab8e6"],
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
  const [avatar, setAvatar] = useState(0);
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
    road.nodes.forEach((p) => extra.push(p.x < ROAD_X.mid ? { x: p.x - 48 - 200, y: p.y - 32, w: 200, h: 60 } : { x: p.x + 48, y: p.y - 32, w: 200, h: 60 }));
    extra.push({ x: road.fork.x - 40, y: road.fork.y - 40, w: 80, h: 80 });
    extra.push(road.fork.x >= ROAD_X.mid ? { x: road.fork.x + 44, y: road.fork.y - 96, w: 270, h: 88 } : { x: road.fork.x - 44 - 270, y: road.fork.y - 96, w: 270, h: 88 });
    road.spurEnds.forEach((e) => extra.push(e.x > road.fork.x ? { x: e.x - 14, y: e.y - 54, w: 300, h: 76 } : { x: e.x - 290, y: e.y - 54, w: 304, h: 76 }));
    extra.push({ x: road.goal.x - 110, y: road.goal.y - 54, w: 220, h: 120 });
    zoneTops(road, n).forEach((t) => extra.push({ x: 12, y: t + 10, w: 250, h: 46 }));
    const flags: Array<{ at: { x: number; y: number }; title: string; sub: string }> = [];
    semesters.forEach((s, k) => {
      road.itemIdx[k].forEach((idx, j) => {
        const it = s.items[j];
        flags.push(it ? { at: road.S[idx], title: it.label, sub: it.sub } : { at: road.S[idx], title: "Add something you did", sub: "A club, a job, a project, anything" });
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
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / ROAD_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- the avatar the student picked, remembered on this device
  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem("melon.avatar"));
      if (v >= 0 && v < AVATARS.length) setAvatar(v);
    } catch {}
  }, []);
  const pickAvatar = (i: number) => {
    setAvatar(i);
    try {
      window.localStorage.setItem("melon.avatar", String(i));
    } catch {}
  };

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

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tip || adding >= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scale;
    const my = (e.clientY - rect.top) / scale;
    if (my < 0) return;
    const r = roadRef.current;
    const cands: Array<{ s: Stop; i: number }> = [];
    r.nodeIdx.forEach((i, k) => cands.push({ s: { type: "node", k }, i }));
    r.itemIdx.forEach((list, k) => list.forEach((i, j) => cands.push({ s: j < semesters[k].items.length ? { type: "item", k, j } : { type: "node", k }, i })));
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
    start(async () => {
      try {
        await setPin(p.id, true);
        setBurst((b) => b + 1);
        walk({ type: "fork" });
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "Couldn't change that pin. Try again.");
      }
    });
  };

  // ---- drawing
  const tops = zoneTops(road, n);
  const zoneBottoms = tops.map((_, z) => (z < tops.length - 1 ? tops[z + 1] : road.goal.y - 50));
  const wave = (y0: number, y1: number) => `M 0 ${y0} Q ${ROAD_W * 0.25} ${y0 - 24} ${ROAD_W * 0.5} ${y0} T ${ROAD_W} ${y0} L ${ROAD_W} ${y1} L 0 ${y1} Z`;
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
          <button type="button" onClick={toggleAll} className="mt-1 rounded-full border-2 border-ink bg-white px-3.5 py-1.5 text-[13px] font-bold transition-transform hover:-translate-y-0.5">
            {anyClosed ? "Open every semester" : "Close all but this semester"}
          </button>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs font-semibold text-muted">Pick your student</span>
          <div className="flex gap-2">
            {AVATARS.map((a, i) => (
              <button
                key={a.name}
                type="button"
                aria-label={`${a.name} student`}
                aria-pressed={avatar === i}
                onClick={() => pickAvatar(i)}
                className="flex size-[52px] items-center justify-center rounded-2xl border-2 bg-white transition-transform hover:-translate-y-0.5"
                style={{ borderColor: avatar === i ? "var(--color-ink)" : "var(--color-line)" }}
              >
                <StudentSvg avatar={i} size={40} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="mx-auto w-full overflow-hidden rounded-[28px] border border-line" style={{ height: road.H * scale, maxWidth: ROAD_W }}>
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
            <path className="road-draw" pathLength={1} d={road.paths.all} fill="none" stroke="#d6ddd8" strokeWidth={36} strokeLinecap="round" strokeLinejoin="round" />
            <path className="road-draw" pathLength={1} d={road.paths.all} fill="none" stroke="#fff" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
            <g className="road-late">
              <path d={road.paths.past} fill="none" stroke="var(--color-done)" strokeWidth={5} strokeDasharray="3 13" strokeLinecap="round" />
              {road.paths.future && <path d={road.paths.future} fill="none" stroke="#b9c1bc" strokeWidth={5} strokeDasharray="3 13" strokeLinecap="round" />}
              <path d={road.paths.chosen} fill="none" stroke={pathCol} strokeWidth={5} strokeDasharray="3 13" strokeLinecap="round" />
            </g>
          </svg>

          {tops.map((t, z) => (
            <div key={z} className="absolute flex items-center gap-2 rounded-full border-2 border-ink bg-white py-1.5 pl-1.5 pr-3.5" style={{ left: 16, top: t + 14 }}>
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
                  ? { fill: "#fff", edge: "var(--school)", ink: "var(--school)", dash: undefined, lab: "var(--school)" }
                  : { fill: "#fff", edge: "#b9c1bc", ink: "var(--color-muted)", dash: "4 3", lab: "var(--color-ink-2)" };
            const flagSvg = (
              <svg width={48} height={56} viewBox="0 0 48 56" aria-hidden="true">
                <ellipse cx={10} cy={51} rx={8} ry={3} fill="rgba(20,33,27,.18)" />
                <path d="M10 51 L10 5" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
                <circle cx={10} cy={4} r={3} fill="var(--color-ink)" />
                <g className="road-pen">
                  <g className="road-wave" style={{ animationDelay: `${(k * 3 + j) * 230}ms` }}>
                    <path d="M11.5 7 H44 L37 17.5 L44 28 H11.5 Z" fill={sty.fill} stroke={sty.edge} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={sty.dash} />
                    <g transform="translate(15.5 9.5) scale(0.68)">
                      <path d={ICONS[add ? "plus" : item.icon] ?? ICONS.star} fill="none" stroke={sty.ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  </g>
                </g>
              </svg>
            );
            const common = { className: "road-flag absolute block", style: { left: 0, top: 0, width: 48, height: 56 } as CSSProperties };
            return (
              <div key={item?.id ?? `add-${k}`}>
                <div className="road-plant absolute" style={{ left: at.x - 10, top: at.y - 50, width: 48, height: 56, animationDelay: `${j * 70}ms` }}>
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
                      href={`/student/tasks/${item.id}?from=road&open=${encodeURIComponent(semesters[k].term)}`}
                      aria-label={`${item.title}, ${item.sub}. Opens the action item.`}
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
                  ? { face: "var(--school)", base: "color-mix(in srgb, var(--school) 60%, black)", ring: "color-mix(in srgb, var(--school) 60%, black)", ink: "#fff", bs: "solid" }
                  : { face: "#fff", base: "var(--color-line)", ring: "#b9c1bc", ink: "var(--color-muted)", bs: "dashed" };
            const isOpen = open[k] && openable(k);
            return (
              <div key={s.term}>
                <div className="road-float absolute" style={{ left: p.x - 32, top: p.y - 32, width: 64, height: 72, animationDelay: `${k * 380}ms` }}>
                  {s.status === "now" && <span className="road-pulse absolute -left-1.5 -top-1.5 size-[76px] rounded-full" style={{ background: "var(--school)" }} />}
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
                      <span key={i} className="road-spark" style={{ background: c, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` } as CSSProperties} />
                    ))}
                </div>
                <div
                  className="absolute flex w-[200px] flex-col gap-1"
                  style={{ left: left ? p.x - 48 - 200 : p.x + 48, top: p.y - 30, alignItems: left ? "flex-end" : "flex-start", textAlign: left ? "right" : "left" }}
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
          <div className="road-float absolute" style={{ left: road.fork.x - 30, top: road.fork.y - 34, width: 60, height: 68, animationDelay: "900ms" }}>
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
                <span key={`${burst}-${i}`} className="road-spark" style={{ background: c, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` } as CSSProperties} />
              ))}
          </div>
          <div
            className="absolute flex w-[260px] flex-col gap-0.5"
            style={road.fork.x >= ROAD_X.mid ? { left: road.fork.x + 46, top: road.fork.y - 92 } : { left: road.fork.x - 46 - 260, top: road.fork.y - 92, textAlign: "right" }}
          >
            <span className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--school)" }}>
              {semesters[fork]?.year} {semesters[fork]?.term.split(" ")[0].toLowerCase()}
            </span>
            <span className="font-brand text-xl font-bold">Pick your path</span>
            <span className="text-[12.5px] text-ink-2">
              {main ? `You're on ${main.name}. The other roads stay open if you change your mind.` : "Pin a path with your coach, or pick one here."}
            </span>
            {pinError && <span className="text-xs font-semibold text-firm">{pinError}</span>}
          </div>

          {others.map((p, i) => {
            const e = road.spurEnds[i];
            if (!e) return null;
            const right = e.x > road.fork.x;
            return (
              <div key={p.id}>
                <div className="absolute" style={{ left: e.x - 10, top: e.y - 50, width: 48, height: 56 }}>
                  <svg width={48} height={56} viewBox="0 0 48 56" aria-hidden="true">
                    <ellipse cx={10} cy={51} rx={8} ry={3} fill="rgba(20,33,27,.18)" />
                    <path d="M10 51 L10 5" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
                    <circle cx={10} cy={4} r={3} fill="var(--color-ink)" />
                    <g className="road-wave" style={{ animationDelay: `${i * 300}ms` }}>
                      <path d="M11.5 7 H44 L37 17.5 L44 28 H11.5 Z" fill={p.color} stroke="var(--color-ink)" strokeWidth={2.5} strokeLinejoin="round" />
                    </g>
                  </svg>
                </div>
                <div className="absolute flex w-[230px] flex-col gap-1" style={right ? { left: e.x + 44, top: e.y - 50, alignItems: "flex-start" } : { left: e.x - 30 - 230, top: e.y - 50, alignItems: "flex-end", textAlign: "right" }}>
                  <span className="font-brand text-base font-bold">{p.name}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: p.tagBg, color: p.tagInk }}>
                    {p.tag}
                  </span>
                  {p.action === "pinned" ? (
                    <span className="text-xs text-muted">Pinned too. Freshmen and sophomores can pin two.</span>
                  ) : p.action === "full" ? (
                    <span className="text-xs text-muted">Unpin one to pick this</span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => choosePath(p)} className="text-[12.5px] font-bold text-link hover:underline disabled:opacity-50">
                      {p.action === "switch" ? "Switch to this path →" : "Pin this path →"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div
            className="pointer-events-none absolute flex h-[30px] items-center whitespace-nowrap rounded-full border-2 border-ink px-3.5 text-[12.5px] font-bold"
            style={{ left: layout.pill.x, top: layout.pill.y, background: main?.color ?? "#fff", color: main?.ink ?? "var(--color-ink)" }}
          >
            {main ? `Your path: ${main.name}` : "Pick a path"}
          </div>

          {/* The first-job goal */}
          <div className="absolute flex w-[220px] flex-col items-center gap-1.5 text-center" style={{ left: road.goal.x - 110, top: road.goal.y - 50 }}>
            <svg width={44} height={54} viewBox="0 0 44 54" aria-hidden="true">
              <path d="M14 4 L14 50" stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
              <path className="road-goalwave" d="M15 5 L40 13 L15 22 Z" fill={main?.color ?? "#fff"} stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" />
              <ellipse cx={14} cy={50} rx={10} ry={3} fill="#e3e6e4" />
            </svg>
            <span className="font-brand text-lg font-bold">{main?.goal ?? "Your first job"}</span>
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11.5px] font-bold text-white">{main ? "Your first-job goal" : "Pin a path to set it"}</span>
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
          <div ref={avRef} aria-hidden="true" className="road-av pointer-events-none absolute left-0 top-0 h-[66px] w-14" style={{ transform: `translate(${road.S[road.rest].x - 28}px, ${road.S[road.rest].y - 62}px)` }}>
            <div ref={faceRef}>
              <StudentSvg avatar={avatar} size={56} legs />
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
                  style={{ color: tipView.it.state === "done" ? "var(--color-done-ink)" : tipView.it.state === "open" ? "var(--school)" : "var(--color-muted)" }}
                >
                  {tipView.term} · {tipView.it.state === "done" ? "Done" : tipView.it.state === "open" ? "To do" : "Planned"}
                  {tipView.it.mine ? " · added by you" : ""}
                </span>
                <span className="font-brand text-lg font-bold leading-snug">{tipView.it.title}</span>
                <span className="mt-1 text-[11px] font-bold uppercase tracking-[.1em] text-muted">What it was about</span>
                <p className="text-[13.5px] leading-normal">{tipView.it.about}</p>
                {tipView.it.wins.length > 0 && (
                  <>
                    <span className="mt-1 text-[11px] font-bold uppercase tracking-[.1em] text-muted">
                      {tipView.it.state === "done" ? "What you got out of it" : "What you'll get out of it"}
                    </span>
                    <ul className="flex flex-col gap-1.5">
                      {tipView.it.wins.map((w) => (
                        <li key={w} className="flex items-start gap-2 text-[13.5px] leading-snug">
                          <span
                            className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md border-2"
                            style={tipView.it.state === "done" ? { background: "var(--color-lime)", borderColor: "var(--color-ink)" } : { background: "#fff", borderColor: "#b9c1bc" }}
                          >
                            <svg width={10} height={10} viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d={tipView.it.state === "done" ? "M5 12.5 L10 17 L19 7" : "M12 6 V18 M6 12 H18"}
                                fill="none"
                                stroke={tipView.it.state === "done" ? "var(--color-ink)" : "#b9c1bc"}
                                strokeWidth={4}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <Link
                  prefetch={false}
                  href={`/student/tasks/${tipView.it.id}?from=road&open=${encodeURIComponent(semesters[tip!.k].term)}`}
                  className="mt-1.5 self-start text-[13.5px] font-bold text-link underline underline-offset-[3px]"
                >
                  Go to action item →
                </Link>
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
              <p className="text-xs leading-relaxed text-muted">It goes on your road marked &quot;added by you&quot;. Your advisor and coach can see it too.</p>
              {formError && <p className="text-xs font-semibold text-firm">{formError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(-1)} className="h-10 rounded-xl border-2 border-line bg-white px-3.5 text-[13px] font-bold">
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
    </section>
  );
}

/** The y where each year's background band starts: just above its first semester. */
function zoneTops(road: Road, n: number) {
  const tops: number[] = [];
  for (let k = 0; k < n; k += 2) tops.push(road.nodes[k].y - 80);
  return tops;
}

function StudentSvg({ avatar, size, legs }: { avatar: number; size: number; legs?: boolean }) {
  const a = AVATARS[avatar] ?? AVATARS[0];
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
        <path d="M17 54 Q17 33 28 33 Q39 33 39 54 Z" fill={a.hoodie} stroke="var(--color-ink)" strokeWidth={2} />
        <circle cx={28} cy={21} r={12} fill="#fff" stroke="var(--color-ink)" strokeWidth={2} />
        <circle cx={24} cy={21} r={1.7} fill="var(--color-ink)" />
        <circle cx={32} cy={21} r={1.7} fill="var(--color-ink)" />
        <path d="M24 26 Q28 29 32 26" fill="none" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinecap="round" />
        {a.hat === "cap" && (
          <>
            <polygon points="13,11 28,4 43,11 28,17" fill="var(--color-ink)" />
            <path d="M41 11 L41 19" stroke="var(--color-lime)" strokeWidth={2} />
          </>
        )}
        {a.hat === "bun" && (
          <>
            <circle cx={28} cy={6} r={5} fill="var(--color-ink)" />
            <path d="M16 19 Q17 9 28 9 Q39 9 40 19 Q34 13 28 14 Q21 13 16 19 Z" fill="var(--color-ink)" />
          </>
        )}
        {a.hat === "beanie" && (
          <>
            <path d="M15 18 Q15 5 28 5 Q41 5 41 18 Z" fill="#990000" stroke="var(--color-ink)" strokeWidth={2} />
            <circle cx={28} cy={4} r={3} fill="#fff" stroke="var(--color-ink)" strokeWidth={1.5} />
          </>
        )}
        {a.hat === "phones" && (
          <>
            <path d="M14 22 Q14 6 28 6 Q42 6 42 22" fill="none" stroke="var(--color-ink)" strokeWidth={3} />
            <rect x={11} y={18} width={6} height={9} rx={2} fill="#8b7cf6" stroke="var(--color-ink)" strokeWidth={1.5} />
            <rect x={39} y={18} width={6} height={9} rx={2} fill="#8b7cf6" stroke="var(--color-ink)" strokeWidth={1.5} />
          </>
        )}
      </g>
    </svg>
  );
}
