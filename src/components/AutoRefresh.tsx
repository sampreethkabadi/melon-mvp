"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reloads the page's data on a timer, for screens waiting on the other person. */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), ms);
    return () => clearInterval(timer);
  }, [router, ms]);
  return null;
}
