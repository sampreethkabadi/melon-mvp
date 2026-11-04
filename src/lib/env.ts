// Central place for configuration. Public values are safe in the browser; the rest are server-only.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Email domains students may sign in with, e.g. "iu.edu". Shown on the login page as a hint. */
export const ALLOWED_EMAIL_DOMAINS = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "iu.edu")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
