// Melon "Ring" logo (Round 2, system B). Shapes match the delivered SVG files.

const ARC = "M83.83 39.69 A36 36 0 1 1 53.79 16.20";
const LEAF = "M72 24 C 74 14 84 9 92 10 C 90 19 81 25 72 24 Z";
const SEEDS: Array<[number, number]> = [
  [50, 38],
  [63.3, 47.7],
  [58.2, 63.3],
  [41.8, 63.3],
  [36.7, 47.7],
];

type Variant = "color" | "onDark";

export function RingMark({ size = 32, variant = "color", title }: { size?: number; variant?: Variant; title?: string }) {
  const c =
    variant === "onDark"
      ? { rind: "#7BD389", leaf: "#C8F169" }
      : { rind: "#1E5B3A", leaf: "#2F8F5B" };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={ARC} fill="none" stroke={c.rind} strokeWidth={9} strokeLinecap="round" />
      <path d={LEAF} fill={c.leaf} />
      <circle cx={50} cy={52} r={26} fill="#F25C66" />
      {SEEDS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2.4} fill="#14211B" />
      ))}
    </svg>
  );
}

export function Logo({ size = 32, variant = "color" }: { size?: number; variant?: Variant }) {
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label="Melon">
      <RingMark size={size} variant={variant} />
      <span
        className="font-brand font-semibold leading-none tracking-[-0.04em]"
        style={{ fontSize: size * 0.75, color: variant === "onDark" ? "#FFF4F2" : "#14211B" }}
      >
        melon
      </span>
    </span>
  );
}
