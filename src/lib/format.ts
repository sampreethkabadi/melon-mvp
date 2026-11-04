// Date and term labels shared by the student tabs. Dates show in the school's time zone.

export const TZ = "America/Indiana/Indianapolis";

export function shortDate(iso: string) {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
}

export function longDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}

export function timeOf(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function shortTerm(term: string | null) {
  const m = term?.match(/^(Spring|Summer|Fall) (\d{4})$/);
  return m ? `${m[1]} '${m[2].slice(2)}` : term ?? "";
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}
