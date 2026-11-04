export type Role = "student" | "advisor" | "coach" | "admin";

export type School = {
  id: string;
  name: string;
  short_mark: string;
  color: string;
};

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  title: string | null;
  school_id: string;
  schools: School | null;
};

export type ClassYear = "freshman" | "sophomore" | "junior" | "senior" | "grad";

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  advisor: "Academic advisor",
  coach: "Career coach",
  admin: "Career center admin",
};

export const YEAR_LABEL: Record<ClassYear, string> = {
  freshman: "Freshman",
  sophomore: "Sophomore",
  junior: "Junior",
  senior: "Senior",
  grad: "Grad student",
};
