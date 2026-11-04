"use client";

import { useFormStatus } from "react-dom";

const STYLES = {
  primary: "rounded-full bg-ink px-5 py-2.5 font-extrabold text-white disabled:opacity-50",
  secondary: "rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50",
  link: "text-sm font-semibold text-link disabled:opacity-50",
};

export function SubmitButton({ label, variant = "primary" }: { label: string; variant?: keyof typeof STYLES }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={STYLES[variant]}>
      {pending ? "One moment…" : label}
    </button>
  );
}
