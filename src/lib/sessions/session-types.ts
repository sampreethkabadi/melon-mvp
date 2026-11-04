// Session types a student picks when booking. Coaches cover careers; advisors cover courses and university policy.

export const COACH_SESSION_TYPES = [
  "Mock technical interview",
  "Mock behavioral interview",
  "Mock case interview",
  "Career exploration",
  "Resume, cover letter or portfolio review",
  "Interview preparation",
  "LinkedIn profile review",
  "Job offer negotiation",
  "Career fair preparation",
  "Internship search",
  "LinkedIn headshot",
  "Drop-in",
] as const;

export const ADVISOR_SESSION_TYPES = [
  "Course planning",
  "Degree progress check",
  "Declare or change a major or minor",
  "Academic policy question",
  "Advising drop-in",
] as const;

export type SessionType = (typeof COACH_SESSION_TYPES)[number] | (typeof ADVISOR_SESSION_TYPES)[number];

export function isCoachType(type: string | null | undefined) {
  return (COACH_SESSION_TYPES as readonly string[]).includes(type ?? "");
}

export function defaultType(role: "advisor" | "coach" | string): SessionType {
  return role === "coach" ? "Drop-in" : "Advising drop-in";
}
