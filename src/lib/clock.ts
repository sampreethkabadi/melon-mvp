// The demo clock. For rehearsals the app pretends today is NEXT_PUBLIC_DEMO_TODAY (default: two weeks before
// the Fall Career Fair). The time of day stays real. Set NEXT_PUBLIC_DEMO_TODAY=off to use the real date.
// The database has the same setting in app_settings.demo_today, which the seed link keeps in step.

export const TZ = "America/Indiana/Indianapolis";
const RAW = process.env.NEXT_PUBLIC_DEMO_TODAY ?? "2026-09-03";
export const DEMO_TODAY: string | null = /^\d{4}-\d{2}-\d{2}$/.test(RAW) ? RAW : null;

const DAY = 24 * 3600 * 1000;

/** Today's date in the school's time zone, as YYYY-MM-DD. */
export function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function appNow(real = new Date()): Date {
  if (!DEMO_TODAY) return real;
  const shift = Date.parse(`${localDate(real)}T00:00:00Z`) - Date.parse(`${DEMO_TODAY}T00:00:00Z`);
  return new Date(real.getTime() - shift);
}

export const appNowIso = () => appNow().toISOString();

/** YYYY-MM-DD plus n days. */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}
