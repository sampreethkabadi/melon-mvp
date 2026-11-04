"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "link" | "password";

export function LoginForm({ next, initialError, domains }: { next: string; initialError?: string; domains: string[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialError ? "That sign-in link didn't work. Try again." : "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = email.trim().toLowerCase();
    const domain = clean.split("@")[1] ?? "";
    if (mode === "link" && domains.length && !domains.includes(domain)) {
      setError(`Use your school email (${domains.map((d) => "@" + d).join(" or ")}).`);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    if (mode === "link") {
      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      setBusy(false);
      if (error) setError(friendly(error.message));
      else setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
      setBusy(false);
      if (error) setError(friendly(error.message));
      else {
        router.replace(next);
        router.refresh();
      }
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-lg">
        <h2 className="text-2xl font-extrabold">Check your email</h2>
        <p className="mt-2 text-ink-2">
          We sent a sign-in link to <b>{email}</b>. Open it on this device. It works once and expires in an hour.
        </p>
        <button className="mt-6 text-sm font-semibold text-link" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-white p-8 shadow-lg">
      <h2 className="text-2xl font-extrabold">Welcome to Melon</h2>
      <p className="text-ink-2">
        {mode === "link"
          ? "Sign in with your school email. We'll email you a link, so there's no password to remember."
          : "Test accounts only: sign in with the email and password your team shared."}
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        School email
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={`you@${domains[0] ?? "school.edu"}`}
          className="rounded-xl border border-line px-3 py-2.5 text-base font-normal"
        />
      </label>
      {mode === "password" && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Password
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-line px-3 py-2.5 text-base font-normal"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="rounded-full bg-ink px-5 py-3 text-base font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "One moment…" : mode === "link" ? "Email me a sign-in link" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "link" ? "password" : "link");
          setError("");
        }}
        className="text-sm font-semibold text-link"
      >
        {mode === "link" ? "Have a test account? Use a password" : "Use an email link instead"}
      </button>
    </form>
  );
}

function friendly(message: string): string {
  if (/school email/i.test(message) || /database error saving new user/i.test(message)) {
    return "Please sign in with your school email address.";
  }
  if (/invalid login credentials/i.test(message)) return "That email and password don't match.";
  if (/rate limit/i.test(message)) return "Too many emails sent just now. Wait a minute and try again.";
  return message;
}
