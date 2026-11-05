import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { earlierConversation, sampleConversation } from "@/lib/sessions/demo";
import { sampleForStudent } from "@/lib/sessions/sample-for-student";
import type { DraftInsight, Segment } from "@/lib/sessions/types";
import { buildFirstRoadmap } from "@/lib/roadmap/template";
import { ALUMNI, CLUBS, careerEvents, jobResources, ladderResources } from "@/lib/catalog";
import { addDays, appNow, DEMO_TODAY, localDate } from "@/lib/clock";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SEED_APPOINTMENTS,
  SEED_DONE_ANSWERS,
  SEED_HISTORY,
  SEED_INTEGRATIONS,
  SEED_MAYA_WINS,
  SEED_REWARDS,
  SEED_SCHOOL,
  SEED_STAFF,
  SEED_STUDENTS,
} from "@/lib/seed-data";

export const dynamic = "force-dynamic";

const TZ = "America/Indiana/Indianapolis";

/**
 * Creates the test school, test accounts and sample data. Safe to run more than once.
 * Open /api/dev/seed?secret=YOUR_SEED_SECRET in a browser after deploying.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.SEED_SECRET ?? "";
  const given = request.nextUrl.searchParams.get("secret") ?? "";
  if (!secret || !safeEqual(secret, given)) {
    return NextResponse.json({ error: "Not allowed. Check the secret." }, { status: 403 });
  }
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) {
    return NextResponse.json({ error: "Set SEED_PASSWORD (10+ characters) in your environment first." }, { status: 400 });
  }

  const db = createAdminClient();
  const log: string[] = [];

  // The demo clock, in step with NEXT_PUBLIC_DEMO_TODAY.
  const { error: clockErr } = await db.from("app_settings").upsert({ id: true, demo_today: DEMO_TODAY });
  if (clockErr) return fail(`demo date: ${clockErr.message}. Run migration 0006 first.`);
  const today = localDate(appNow());
  log.push(DEMO_TODAY ? `Demo date: ${DEMO_TODAY}` : "Using the real date");

  // School
  const { data: school, error: schoolErr } = await db
    .from("schools")
    .upsert(SEED_SCHOOL, { onConflict: "slug" })
    .select("id")
    .single();
  if (schoolErr || !school) return fail(`school: ${schoolErr?.message}`);
  const schoolId = school.id as string;
  log.push("School ready");

  // Accounts (a database trigger creates each profile as a student). Staff go first so that re-running
  // the seed finds them already in place, and any students created by the trigger get re-assigned below.
  const ids: Record<string, string> = {};
  for (const person of [...SEED_STAFF, ...SEED_STUDENTS]) {
    const { data, error } = await db.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: person.full_name },
    });
    if (data?.user) {
      ids[person.email] = data.user.id;
    } else {
      const { data: existing } = await db.from("profiles").select("id").eq("email", person.email).maybeSingle();
      if (!existing) return fail(`account ${person.email}: ${error?.message}`);
      ids[person.email] = existing.id as string;
      await db.auth.admin.updateUserById(existing.id as string, { password });
    }
  }
  log.push(`${Object.keys(ids).length} accounts ready`);

  // Staff roles
  for (const s of SEED_STAFF) {
    const id = ids[s.email];
    await db.from("profiles").update({ role: s.role, title: s.title, full_name: s.full_name }).eq("id", id);
    await db.from("student_profiles").delete().eq("user_id", id);
    await db.from("roadmaps").delete().eq("student_id", id);
    await db.from("staff_assignments").delete().eq("student_id", id);
  }

  // Back to a clean start for every test student, so each rehearsal begins the same way.
  const studentIds = SEED_STUDENTS.map((s) => ids[s.email]);
  for (const table of ["roadmap_suggestions", "sessions", "advice_items", "activities", "profile_events", "roadmap_changes", "roadmap_items", "roadmap_paths", "staff_assignments", "appointments", "reward_claims", "student_moments"]) {
    const { error } = await db.from(table).delete().in("student_id", studentIds);
    if (error) return fail(`reset ${table}: ${error.message}`);
  }
  await db.from("notifications").delete().in("user_id", Object.values(ids));
  await db.from("roadmaps").update({ status: "none", version: 0, published_at: null, published_by: null, approved_at: null, approved_by: null, accepted_at: null }).in("student_id", studentIds);
  log.push("Test students reset");

  // Student details
  for (const s of SEED_STUDENTS) {
    const id = ids[s.email];
    await db.from("profiles").update({ full_name: s.full_name, role: "student" }).eq("id", id);
    const done = SEED_DONE_ANSWERS[s.email];
    const { error } = await db
      .from("student_profiles")
      .update({
        class_year: s.class_year,
        program: s.program,
        majors: s.majors,
        minors: s.minors,
        expected_grad_term: s.expected_grad_term,
        interests: s.interests,
        onboarding_step: s.onboarding_step,
        answers: done?.answers ?? {},
        target_roles: done?.target_roles ?? [],
        locations: [],
        clubs: [],
        links: {},
        resume_path: null,
        resume_parsed: null,
        updated_at: appNow().toISOString(),
      })
      .eq("user_id", id);
    if (error) return fail(`student ${s.email}: ${error.message}`);
  }

  // Four students per advisor, and everyone gets the coach
  const coach = ids["rivera@melon.test"];
  const assignments = SEED_STUDENTS.flatMap((s) => [
    { school_id: schoolId, student_id: ids[s.email], staff_id: ids[s.advisor], kind: "advisor", active: true },
    { school_id: schoolId, student_id: ids[s.email], staff_id: coach, kind: "coach", active: true },
  ]);
  const { error: asgErr } = await db.from("staff_assignments").insert(assignments);
  if (asgErr) return fail(`assignments: ${asgErr.message}`);
  log.push(`${assignments.length} advisor/coach assignments`);

  // The demo day's appointments. The student picked each type when booking.
  const offset = tzOffset(new Date(`${today}T12:00:00Z`));
  const appts = SEED_APPOINTMENTS.map(([email, hhmm, type, modality, location, withWhom]) => ({
    school_id: schoolId,
    student_id: ids[email],
    staff_id: withWhom === "coach" ? coach : ids[SEED_STUDENTS.find((s) => s.email === email)!.advisor],
    starts_at: new Date(`${today}T${hhmm}:00${offset}`).toISOString(),
    type,
    modality,
    location,
    external_ref: "seed",
  }));
  const { error: apErr } = await db.from("appointments").insert(appts);
  if (apErr) return fail(`appointments: ${apErr.message}`);
  log.push(`${appts.length} appointments on ${today}`);

  // Past semesters for the road: courses from "school records", and resume history.
  await db.from("student_courses").delete().in("student_id", studentIds);
  for (const [email, h] of Object.entries(SEED_HISTORY)) {
    const id = ids[email];
    const { error: cErr } = await db
      .from("student_courses")
      .insert(h.courses.map(([code, title, term, status]) => ({ school_id: schoolId, student_id: id, code, title, term, status })));
    if (cErr) return fail(`courses ${email}: ${cErr.message}`);
    const { data: sp } = await db.from("student_profiles").select("resume_parsed").eq("user_id", id).single();
    await db
      .from("student_profiles")
      .update({ clubs: h.clubs, resume_parsed: { ...((sp?.resume_parsed as object | null) ?? {}), experience: h.experience, clubs: h.clubs } })
      .eq("user_id", id);
    if (h.events?.length) {
      await db.from("activities").insert(h.events.map(([title, occurred_at]) => ({ school_id: schoolId, student_id: id, kind: "event", title, minutes: 120, occurred_at })));
    }
  }
  const maya = ids["maya@melon.test"];

  // Resource library: a short ladder per path and year, clubs on beInvolved, and career services events.
  await db.from("resources").delete().eq("school_id", schoolId).contains("tags", ["seed"]);
  const ladder = ladderResources();
  const clubs = CLUBS.filter((c) => !ladder.some((r) => r.title === c.name)).map((c) => ({
    type: "club" as const,
    title: c.name,
    provider: "beInvolved",
    url: `https://beinvolved.indiana.edu/organizations?query=${encodeURIComponent(c.name)}`,
    interests: c.interests,
    source: "library" as const,
    tags: ["seed", "club"],
  }));
  const library = [...ladder, ...jobResources(), ...clubs, ...careerEvents(Number(today.slice(0, 4)))];
  const { error: resErr } = await db.from("resources").insert(library.map((r) => ({ ...r, school_id: schoolId, is_free: true })));
  if (resErr) return fail(`resources: ${resErr.message}`);

  await db.from("alumni").delete().eq("school_id", schoolId);
  const { error: alErr } = await db.from("alumni").insert(ALUMNI.map((a) => ({ ...a, school_id: schoolId })));
  if (alErr) return fail(`alumni: ${alErr.message}`);

  await db.from("rewards").delete().eq("school_id", schoolId);
  const { error: rwErr } = await db.from("rewards").insert(SEED_REWARDS.map((r) => ({ ...r, school_id: schoolId })));
  if (rwErr) return fail(`rewards: ${rwErr.message}`);

  const { error: inErr } = await db
    .from("integrations")
    .upsert(SEED_INTEGRATIONS.map((i) => ({ ...i, school_id: schoolId })), { onConflict: "school_id,system" });
  if (inErr) return fail(`integrations: ${inErr.message}`);
  log.push(`${library.length} resources, ${ALUMNI.length} alumni, ${SEED_REWARDS.length} rewards, ${SEED_INTEGRATIONS.length} integrations`);

  // Demo history. Priya has a draft waiting for review. Maya has an accepted roadmap and reviewed sessions,
  // which is what makes her briefing worth reading when she moves to a new advisor.
  const { data: libraryRows } = await db.from("resources").select("id, type, title, interests").eq("school_id", schoolId).order("title");
  for (const [email, done] of Object.entries(SEED_DONE_ANSWERS)) {
    const s = SEED_STUDENTS.find((x) => x.email === email)!;
    const { paths, items } = buildFirstRoadmap({ ...s, ...done, resources: libraryRows ?? [], now: appNow() });
    const { error } = await db.rpc("replace_draft_roadmap", { p_student: ids[email], p_paths: paths, p_items: items });
    if (error) return fail(`draft ${email}: ${error.message}`);
  }
  const lee = ids["lee@melon.test"];
  const { error: pubErr } = await db.rpc("_publish_roadmap", { p_student: maya, p_actor: lee });
  if (pubErr) return fail(`publish: ${pubErr.message}`);
  const history = await seedMayaHistory(db, schoolId, maya, coach, today);
  if (history) return fail(`Maya's history: ${history}`);
  await db.from("roadmap_changes").update({ seen_at: appNow().toISOString() }).eq("student_id", maya);
  // Maya and her team signed off before her first session, so her timeline reads in order.
  const { data: firstSession } = await db.from("sessions").select("created_at").eq("student_id", maya).order("created_at").limit(1).maybeSingle();
  const signedOff = firstSession?.created_at ?? appNow().toISOString();
  const { error: signErr } = await db
    .from("roadmaps")
    .update({ published_at: signedOff, approved_at: signedOff, approved_by: lee, accepted_at: signedOff })
    .eq("student_id", maya);
  if (signErr) return fail(`sign-off: ${signErr.message}`);
  // A session from yesterday still waiting for Lee's approval, so Reviews has something to show.
  const yesterday = new Date(`${addDays(today, -1)}T19:00:00Z`).toISOString();
  const waiting = await seedWaitingSession(db, schoolId, ids["priya@melon.test"], lee, "Course planning", yesterday);
  if (waiting) return fail(`waiting session: ${waiting}`);
  log.push("Demo history ready");

  return NextResponse.json({
    ok: true,
    log,
    sign_in: "Use 'Have a test account? Use a password' on the login page, with SEED_PASSWORD.",
    accounts: [
      ...SEED_STAFF.map((s) => ({ email: s.email, role: s.role })),
      ...SEED_STUDENTS.map((s) => ({ email: s.email, role: "student", year: s.class_year, onboarding: s.onboarding_step })),
    ],
  });

  function fail(message: string) {
    return NextResponse.json({ ok: false, log, error: message }, { status: 500 });
  }
}

/**
 * Maya's story so far: a resume review with the coach last spring, a career exploration session a week ago
 * (2 steps, both done since), and a few events, so Home has something to compare with. With today's
 * career fair session she reaches 3 sessions, which unlocks the sticker pack live in the demo.
 */
async function seedMayaHistory(db: ReturnType<typeof createAdminClient>, schoolId: string, student: string, staff: string, today: string) {
  const year = Number(today.slice(0, 4));
  const resume = sampleConversation(await sampleForStudent(student, "Resume, cover letter or portfolio review"));
  const spring = await seedPastSession(db, schoolId, student, staff, "Resume, cover letter or portfolio review", `${year}-03-04T19:00:00Z`, {
    segments: resume.segments,
    insights: resume.insights.filter((i) => i.kind === "summary" || i.kind === "advice"),
  });
  if (spring) return spring;
  const fall = await seedPastSession(db, schoolId, student, staff, "Career exploration", new Date(`${addDays(today, -7)}T19:00:00Z`).toISOString(), earlierConversation("Maya"));
  if (fall) return fall;

  // Both steps from the fall session are done since.
  const { data: steps } = await db.from("roadmap_items").select("id").eq("student_id", student).eq("source", "staff").order("created_at");
  for (const [i, step] of (steps ?? []).entries()) {
    const doneAt = new Date(`${addDays(today, -5 + i * 2)}T21:00:00Z`).toISOString();
    await db.from("roadmap_items").update({ status: "done", completed_at: doneAt }).eq("id", step.id);
    await db.from("advice_items").update({ status: "done" }).eq("roadmap_item_id", step.id);
  }
  // Earlier semesters, so her road shows what she's already done.
  const { data: rm } = await db.from("roadmaps").select("id").eq("student_id", student).single();
  if (!rm) return "no roadmap";
  const { error: winErr } = await db.from("roadmap_items").insert(
    SEED_MAYA_WINS.map((w, i) => ({
      school_id: schoolId,
      roadmap_id: rm.id,
      student_id: student,
      term: `${w.season} ${year + w.yearOffset}`,
      kind: w.kind,
      title: w.title,
      description: w.description,
      outcomes: w.outcomes,
      status: "done",
      source: w.source,
      approval: "not_needed",
      sort: 800 + i,
      completed_at: new Date(Date.UTC(year + w.yearOffset, w.month - 1, 15, 17)).toISOString(),
    })),
  );
  if (winErr) return winErr.message;

  const { error: actErr } = await db.from("activities").insert([
    { school_id: schoolId, student_id: student, kind: "workshop", title: "Resume workshop", minutes: 60, occurred_at: `${year}-02-11T22:00:00Z` },
    { school_id: schoolId, student_id: student, kind: "event", title: "Spring career fair", minutes: 120, occurred_at: `${year}-02-25T17:00:00Z` },
    { school_id: schoolId, student_id: student, kind: "event", title: "the Data Science Club meetup", minutes: 60, occurred_at: `${addDays(today, -9)}T23:00:00Z` },
  ]);
  // Old news is already read, so the bell lights up only for what happens in the demo.
  await db.from("notifications").update({ read_at: appNow().toISOString() }).eq("user_id", student);
  return actErr?.message ?? null;
}

/** A finished session with its suggestions drafted, waiting for the advisor to approve them. Returns an error or null. */
async function seedWaitingSession(db: ReturnType<typeof createAdminClient>, schoolId: string, student: string, staff: string, type: string, when: string) {
  const sample = sampleConversation(await sampleForStudent(student, type));
  const { data: session, error } = await db
    .from("sessions")
    .insert({ school_id: schoolId, student_id: student, staff_id: staff, status: "ready_for_review", transcript_source: "sample", session_type: type, started_at: when, ended_at: when, created_at: when })
    .select("id")
    .single();
  if (error || !session) return error?.message ?? "no session";
  const { data: segments, error: segErr } = await db
    .from("transcript_segments")
    .insert(sample.segments.map((s) => ({ ...s, school_id: schoolId, session_id: session.id, student_id: student })))
    .select("id, idx");
  if (segErr || !segments) return segErr?.message ?? "no transcript";
  for (const [n, insight] of sample.insights.entries()) {
    const { data: row, error: insErr } = await db
      .from("insights")
      .insert({
        school_id: schoolId,
        session_id: session.id,
        student_id: student,
        kind: insight.kind,
        payload: { text: insight.text, roadmap_kind: insight.roadmap_kind ?? null },
        model_ref: "saved-sample-v1",
        created_at: new Date(Date.parse(when) + n * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !row) return insErr?.message ?? "no insight";
    await db.from("insight_evidence").insert(insight.evidence.map((idx) => ({ insight_id: row.id, segment_id: segments.find((s) => s.idx === idx)!.id })));
  }
  return null;
}

/** One reviewed session in the past, with its transcript and approved highlights. Returns an error or null. */
async function seedPastSession(
  db: ReturnType<typeof createAdminClient>,
  schoolId: string,
  student: string,
  staff: string,
  type: string,
  when: string,
  sample: { segments: Segment[]; insights: DraftInsight[] },
) {
  const { data: session, error } = await db
    .from("sessions")
    .insert({ school_id: schoolId, student_id: student, staff_id: staff, status: "ready_for_review", transcript_source: "sample", session_type: type, started_at: when, ended_at: when, created_at: when })
    .select("id")
    .single();
  if (error || !session) return error?.message ?? "no session";
  const { data: segments, error: segErr } = await db
    .from("transcript_segments")
    .insert(sample.segments.map((s) => ({ ...s, school_id: schoolId, session_id: session.id, student_id: student })))
    .select("id, idx");
  if (segErr || !segments) return segErr?.message ?? "no transcript";
  for (const [n, insight] of sample.insights.entries()) {
    const { data: row, error: insErr } = await db
      .from("insights")
      .insert({
        school_id: schoolId,
        session_id: session.id,
        student_id: student,
        kind: insight.kind,
        payload: { text: insight.text, roadmap_kind: insight.roadmap_kind ?? null },
        status: "accepted",
        reviewed_by: staff,
        reviewed_at: when,
        model_ref: "saved-sample-v1",
        created_at: new Date(Date.parse(when) + n * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !row) return insErr?.message ?? "no insight";
    await db.from("insight_evidence").insert(insight.evidence.map((idx) => ({ insight_id: row.id, segment_id: segments.find((s) => s.idx === idx)!.id })));
  }
  const { error: applyErr } = await db.rpc("_apply_session_review", { p_session: session.id });
  if (applyErr) return applyErr.message;
  // Dates as they really happened.
  await db.from("activities").update({ occurred_at: when }).eq("student_id", student).eq("kind", "session").eq("title", type);
  await db.from("roadmap_changes").update({ created_at: when, seen_at: when }).eq("session_id", session.id);
  await db.from("profile_events").update({ occurred_at: when }).eq("source_ref", session.id);
  return null;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Offset like "-05:00" for the school's time zone on a given date. */
function tzOffset(d: Date) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-5"
  const m = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "-05:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
}
