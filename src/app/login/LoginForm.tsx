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
  const [code, setCode] = useState("");
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

  // School mail filters often open emailed links before the student does, which uses them up.
  // A typed code can't be used up that way, so it's the main path and the link is the backup.
  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setError("That code didn't work, or it has expired. Check it, or send a new one.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (sent) {
    return (
      <form onSubmit={onVerify} className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-white p-8 shadow-lg">
        <h2 className="text-2xl font-extrabold">Check your email</h2>
        <p className="text-ink-2">
          We sent a sign-in email to <b>{email}</b>. Enter its code here, or open its link on this device. It can take a minute to arrive, so check your junk folder too.
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Sign-in code
          <input
            id="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="rounded-xl border border-line px-3 py-2.5 text-base font-normal tracking-widest"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
            {error}
          </p>
        )}
        <button disabled={busy} className="rounded-full bg-ink px-5 py-3 text-base font-extrabold text-white disabled:opacity-50">
          {busy ? "One moment…" : "Sign in"}
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-link"
          onClick={() => {
            setSent(false);
            setCode("");
            setError("");
          }}
        >
          Use a different email or send a new code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-white p-8 shadow-lg">
      <h2 className="text-2xl font-extrabold">Welcome to Melon</h2>
      <p className="text-ink-2">
        {mode === "link"
          ? "Sign in with your school email. We'll email you a way in, so there's no password to remember."
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
        {busy ? "One moment…" : mode === "link" ? "Email me a way to sign in" : "Sign in"}
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
  if (/rate limit|security purposes/i.test(message)) return "Too many emails sent just now. Wait a minute and try again.";
  if (/sending|smtp|email provider/i.test(message)) return "We couldn't send the email just now. Try again in a few minutes.";
  if (/signups? not allowed/i.test(message)) return "New sign-ups are turned off right now. Ask the Melon team to turn them on.";
  return message;
}
