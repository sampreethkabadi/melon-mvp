import { BriefcaseBusiness, GraduationCap } from "lucide-react";
import type { Role } from "@/lib/types";

// A face for each person on the student's team, so names don't have to be repeated everywhere.
// Initials for now; a photo can drop in here later. The badge says what they help with.

export const ROLE_COLOR: Record<string, { bg: string; tint: string }> = {
  coach: { bg: "#5B4BD1", tint: "#F3F1FF" },
  advisor: { bg: "#1E5B3A", tint: "#E3F3E7" },
};

export function initialsOf(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function roleLabel(role: Role | string) {
  return role === "coach" ? "Career coach" : role === "advisor" ? "Academic advisor" : "Staff";
}

export function Avatar({ name, role, size = 56, badge = true }: { name: string; role: Role | string; size?: number; badge?: boolean }) {
  const color = ROLE_COLOR[role]?.bg ?? "#3A4640";
  const Icon = role === "coach" ? BriefcaseBusiness : GraduationCap;
  const b = Math.max(20, Math.round(size * 0.4));
  return (
    <span
      role="img"
      aria-label={`${name}, ${roleLabel(role).toLowerCase()}`}
      title={`${name} · ${roleLabel(role)}`}
      className="relative inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.34) }}
    >
      {initialsOf(name)}
      {badge && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(20,33,27,.18)]"
          style={{ width: b, height: b, color }}
        >
          <Icon size={Math.round(b * 0.56)} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );
}
