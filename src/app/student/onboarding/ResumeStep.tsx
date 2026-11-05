"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { goToStep, processResume } from "./actions";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const MAX_BYTES = 5 * 1024 * 1024;

export function ResumeStep({ studentId }: { studentId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function upload(file: File) {
    setError("");
    const contentType = TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
    if (!contentType) return setError("Please choose a PDF or Word (.docx) file.");
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Please choose a smaller one.");
    start(async () => {
      setStatus("Uploading…");
      // Goes straight to private storage. Access rules limit this to the student's own folder.
      const { error: uploadError } = await createClient()
        .storage.from("resumes")
        .upload(`${studentId}/resume`, file, { upsert: true, contentType });
      if (uploadError) {
        setStatus("");
        setError("The upload didn't work. Check your connection and try again.");
        return;
      }
      setStatus("Reading your resume…");
      try {
        await processResume();
      } catch {
        setStatus("");
        setError("We couldn't process that file. Try again, or fill in your details by hand.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Start with your resume</h1>
        <p className="mt-1 text-ink-2">We&apos;ll use it to fill in your profile, and you can check everything next. Only you and your advisor or coach can open it.</p>
      </div>
      <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-ink">
        This is a demo, so please don&apos;t upload a real resume. Download a sample, then upload it here:{" "}
        <a href="/samples/riya-mehta-data-science-junior.pdf" download className="underline">
          Data Science junior
        </a>
        ,{" "}
        <a href="/samples/ethan-brooks-computer-science-sophomore.pdf" download className="underline">
          Computer Science sophomore
        </a>{" "}
        or{" "}
        <a href="/samples/olivia-grant-business-senior.pdf" download className="underline">
          Business senior
        </a>
        .
      </p>
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx"
        aria-label="Resume file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        className="flex flex-col items-center gap-1 rounded-3xl border-2 border-dashed border-line bg-white/95 px-6 py-12 text-center hover:border-ink disabled:opacity-60"
      >
        <b className="text-lg">{status || "Choose your resume"}</b>
        {!status && <span className="text-sm text-muted">or drop it here. PDF or Word (.docx), up to 5 MB.</span>}
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => goToStep("profile"))}
        className="self-start text-sm font-semibold text-link disabled:opacity-60"
      >
        I don&apos;t have a resume yet. Skip this step
      </button>
    </div>
  );
}
