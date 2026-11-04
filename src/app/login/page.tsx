import { redirect } from "next/navigation";
import { RingMark } from "@/components/Logo";
import { getCurrentProfile, homeFor } from "@/lib/auth";
import { ALLOWED_EMAIL_DOMAINS, isConfigured } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in · Melon" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (!isConfigured()) redirect("/");
  const profile = await getCurrentProfile();
  if (profile) redirect(homeFor(profile.role));
  const { next, error } = await searchParams;

  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <section className="flex flex-col gap-6 p-8 text-white md:p-14" style={{ background: "var(--school)" }}>
        <div className="flex items-center gap-3">
          <RingMark size={44} variant="onDark" />
          <span className="font-brand text-3xl font-semibold tracking-[-0.04em]">melon</span>
        </div>
        <h1 className="mt-6 max-w-md text-4xl font-extrabold leading-tight tracking-tight md:mt-16 md:text-5xl">
          Your career path, built around you.
        </h1>
        <ul className="flex flex-col gap-4 text-base font-semibold">
          <li>A roadmap that grows with every advising session</li>
          <li>Free resources picked for your goals</li>
          <li>Real swag for showing up</li>
        </ul>
      </section>
      <section className="flex items-center justify-center p-6 md:p-12">
        <LoginForm next={next ?? "/"} initialError={error} domains={ALLOWED_EMAIL_DOMAINS} />
      </section>
    </main>
  );
}
