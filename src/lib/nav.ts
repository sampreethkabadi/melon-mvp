export type NavItem = { href: string; label: string; soon?: boolean };

// "soon" items show greyed out until their build step lands.
export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "Home" },
  { href: "/student/roadmap", label: "Roadmap" },
  { href: "/student/tasks", label: "Action items" },
  { href: "/student/sessions", label: "Sessions" },
  { href: "/student/rewards", label: "Rewards" },
  { href: "/student/resources", label: "Resources" },
];

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "Today" },
  { href: "/staff/students", label: "Students" },
  { href: "/staff/reviews", label: "Reviews" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Integrations" },
  { href: "/admin/students", label: "Advisors" },
  { href: "/staff", label: "Staff view" },
];
