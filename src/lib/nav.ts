export type NavItem = { href: string; label: string; soon?: boolean };

// "soon" items show greyed out until their build step lands.
export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "Home" },
  { href: "/student/roadmap", label: "Roadmap", soon: true },
  { href: "/student/tasks", label: "Action items", soon: true },
  { href: "/student/sessions", label: "Sessions", soon: true },
  { href: "/student/rewards", label: "Rewards", soon: true },
  { href: "/student/resources", label: "Resources", soon: true },
];

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "Today" },
  { href: "/staff/students", label: "Students", soon: true },
  { href: "/staff/reviews", label: "Reviews", soon: true },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Integrations" },
  { href: "/staff", label: "Staff view" },
];
