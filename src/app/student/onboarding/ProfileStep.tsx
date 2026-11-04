"use client";

import { useActionState, useState } from "react";
import { INTEREST_COLORS } from "@/components/Backdrop";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";
import { BackButton, ErrorNote, SubmitButton } from "./parts";
import { saveProfile } from "./actions";

export type ProfileValues = {
  full_name: string;
  class_year: string;
  program: string;
  majors: string;
  minors: string;
  expected_grad_term: string;
  clubs: string;
  skills: string;
  interests: string[];
  linkedin: string;
  github: string;
  portfolio: string;
};

export function ProfileStep({ values, resumeNote }: { values: ProfileValues; resumeNote: string | null }) {
  const [state, action] = useActionState(saveProfile, {});
  const [interests, setInterests] = useState(values.interests);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Check your profile</h1>
        <p className="mt-1 text-ink-2">{resumeNote ?? "Tell us a little about you. Your advisor and coach will see this."}</p>
      </div>
      <div className="grid gap-4 rounded-3xl border border-line bg-white/95 p-6 sm:grid-cols-2">
        <Field name="full_name" label="Full name" value={values.full_name} required autoComplete="name" />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Year
          <select name="class_year" defaultValue={values.class_year} required className="rounded-xl border border-line bg-white px-3 py-2.5 text-base font-normal">
            <option value="" disabled>
              Choose your year
            </option>
            {(Object.keys(YEAR_LABEL) as ClassYear[]).map((y) => (
              <option key={y} value={y}>
                {YEAR_LABEL[y]}
              </option>
            ))}
          </select>
        </label>
        <Field name="program" label="Degree program" value={values.program} placeholder="B.S. Data Science" />
        <Field name="expected_grad_term" label="Expected graduation" value={values.expected_grad_term} placeholder="May 2028" />
        <Field name="majors" label="Majors" value={values.majors} hint="Separate with commas" />
        <Field name="minors" label="Minors" value={values.minors} hint="Separate with commas" />
        <Field name="clubs" label="Clubs and activities" value={values.clubs} hint="Separate with commas" />
        <Field name="skills" label="Skills" value={values.skills} hint="Separate with commas" />
      </div>

      <fieldset className="rounded-3xl border border-line bg-white/95 p-6">
        <legend className="px-1 text-sm font-semibold">What careers interest you?</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(INTEREST_COLORS).map(([id, { label, color }]) => {
            const on = interests.includes(id);
            return (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:outline-3 ${on ? "border-ink bg-soft" : "border-line bg-white"}`}
              >
                <input
                  type="checkbox"
                  name="interests"
                  value={id}
                  checked={on}
                  onChange={() => setInterests(on ? interests.filter((i) => i !== id) : [...interests, id])}
                  className="sr-only"
                />
                <span aria-hidden="true" className="size-3 rounded-full" style={{ background: color }} />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 rounded-3xl border border-line bg-white/95 p-6 sm:grid-cols-3">
        <Field name="linkedin" label="LinkedIn" value={values.linkedin} placeholder="linkedin.com/in/you" />
        <Field name="github" label="GitHub" value={values.github} placeholder="github.com/you" />
        <Field name="portfolio" label="Portfolio" value={values.portfolio} />
      </div>

      <ErrorNote message={state.error} />
      <div className="flex items-center justify-between gap-3">
        <BackButton step="resume" />
        <SubmitButton label="Looks right" />
      </div>
    </form>
  );
}

function Field(props: { name: string; label: string; value: string; hint?: string; placeholder?: string; required?: boolean; autoComplete?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      <span>
        {props.label}
        {props.hint && <span className="ml-1 font-normal text-muted">· {props.hint}</span>}
      </span>
      <input
        name={props.name}
        defaultValue={props.value}
        placeholder={props.placeholder}
        required={props.required}
        autoComplete={props.autoComplete ?? "off"}
        className="rounded-xl border border-line px-3 py-2.5 text-base font-normal"
      />
    </label>
  );
}
