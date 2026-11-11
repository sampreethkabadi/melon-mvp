import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sessions became Appointments. Old links (emails, notifications) still land in the right place.
  async redirects() {
    return [{ source: "/student/sessions", destination: "/student/appointments", permanent: false }];
  },
};

export default nextConfig;
