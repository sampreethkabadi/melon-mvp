import type { CSSProperties, ReactNode } from "react";
import type { Profile } from "@/lib/types";

/** Applies the signed-in person's school color to everything inside. */
export function SchoolTheme({ profile, children }: { profile: Profile; children: ReactNode }) {
  const style = { "--school": profile.schools?.color ?? "#990000" } as CSSProperties;
  return (
    <div style={style} className="min-h-dvh">
      {children}
    </div>
  );
}
