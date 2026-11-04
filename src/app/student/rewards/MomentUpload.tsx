"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveMoment } from "../actions";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
const MAX_BYTES = 5 * 1024 * 1024;

/** Uploads straight from the browser to the student's own folder, then saves the row. */
export function MomentUpload({ studentId }: { studentId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function upload(file: File) {
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = TYPES[ext];
    if (!contentType) return setError("Please choose a JPG, PNG, WebP or HEIC photo.");
    if (file.size > MAX_BYTES) return setError("That photo is over 5 MB. Please choose a smaller one.");
    start(async () => {
      const path = `${studentId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient().storage.from("moments").upload(path, file, { contentType });
      if (uploadError) return setError("The upload didn't work. Check your connection and try again.");
      try {
        await saveMoment(path, caption);
        setCaption("");
        if (input.current) input.current.value = "";
      } catch {
        setError("Couldn't save that photo. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={140}
          placeholder="Caption (optional), like “Fall career fair”"
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="rounded-full bg-ink px-5 py-2 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Add a photo"}
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {error && <p className="text-sm font-semibold text-firm">{error}</p>}
    </div>
  );
}
