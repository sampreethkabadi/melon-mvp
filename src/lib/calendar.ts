import { addDays } from "./clock.ts";

// The career center's fall calendar, built around the Fall Career Fair (the biggest fair of the year,
// held on the third Thursday and Friday of September). Dates are invented for the demo.

/** Third Thursday of September, as YYYY-MM-DD. */
export function fallFairDay1(year: number): string {
  const first = new Date(Date.UTC(year, 8, 1)).getUTCDay(); // 0 = Sunday
  const firstThursday = 1 + ((4 - first + 7) % 7);
  return `${year}-09-${String(firstThursday + 14).padStart(2, "0")}`;
}

export type CalendarKey =
  | "dropW"
  | "resumeDropIn"
  | "pitchWorkshop"
  | "infoSession"
  | "mockFair"
  | "fairRegister"
  | "fair1"
  | "fair2"
  | "headshots"
  | "alumniChat"
  | "appCloses"
  | "networkingNight"
  | "gradApply"
  | "minorForm"
  | "springRegistration";

export function careerCalendar(year: number): Record<CalendarKey, string> {
  const fair1 = fallFairDay1(year);
  return {
    dropW: addDays(fair1, -11),
    resumeDropIn: addDays(fair1, -8),
    pitchWorkshop: addDays(fair1, -7),
    infoSession: addDays(fair1, -7),
    mockFair: addDays(fair1, -3),
    fairRegister: addDays(fair1, -2),
    fair1,
    fair2: addDays(fair1, 1),
    headshots: fair1,
    alumniChat: addDays(fair1, 5),
    appCloses: `${year}-09-30`,
    networkingNight: addDays(fair1, 19),
    gradApply: `${year}-10-01`,
    minorForm: `${year}-10-01`,
    springRegistration: addDays(fair1, 39),
  };
}
