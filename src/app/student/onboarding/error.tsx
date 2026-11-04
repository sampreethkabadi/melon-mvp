"use client";

export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-3 px-4 py-16">
      <h1 className="text-2xl font-extrabold">That didn&apos;t work</h1>
      <p className="text-ink-2">Your earlier steps are saved. Please try again.</p>
      <button onClick={reset} className="rounded-full bg-ink px-6 py-3 font-extrabold text-white">
        Try again
      </button>
    </main>
  );
}
