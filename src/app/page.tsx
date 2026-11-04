import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentProfile, homeFor } from "@/lib/auth";
import { isConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isConfigured()) return <SetupNeeded />;
  const profile = await getCurrentProfile();
  redirect(profile ? homeFor(profile.role) : "/login");
}

function SetupNeeded() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-16">
      <Logo size={44} />
      <h1 className="text-3xl font-extrabold tracking-tight">Almost there</h1>
      <p className="text-ink-2">
        The app is running, but it isn&apos;t connected to the database yet. Add these settings in Vercel under
        Settings &gt; Environment Variables, then redeploy:
      </p>
      <ul className="list-disc space-y-1 pl-5 font-mono text-sm">
        <li>NEXT_PUBLIC_SUPABASE_URL</li>
        <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
        <li>SUPABASE_SERVICE_ROLE_KEY</li>
        <li>SEED_SECRET</li>
        <li>SEED_PASSWORD</li>
      </ul>
      <p className="text-sm text-muted">The README in the code repository walks through each one.</p>
    </main>
  );
}
