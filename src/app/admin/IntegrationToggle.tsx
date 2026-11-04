"use client";

import { useOptimistic, useTransition } from "react";
import { setIntegration } from "./actions";

export function IntegrationToggle({ id, label, enabled }: { id: string; label: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(enabled);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          await setIntegration(id, !on);
        })
      }
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-done" : "bg-[#C9D0CC]"}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}
