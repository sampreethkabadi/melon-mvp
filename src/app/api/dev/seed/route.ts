import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { earlierConversation } from "@/lib/sessions/demo";
import { buildFirstRoadmap } from "@/lib/roadmap/template";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SEED_APPOINTMENTS,
  SEED_COURSES,
  SEED_DONE_ANSWERS,
  SEED_INTEGRATIONS,
  SEED_RESOURCES,
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
  for (const table of ["sessions", "advice_items", "activities", "profile_events", "roadmap_changes", "roadmap_items", "roadmap_paths", "staff_assignments", "appointments"]) {
    const { error } = await db.from(table).delete().in("student_id", studentIds);
    if (error) return fail(`reset ${table}: ${error.message}`);
  }
  await db.from("notifications").delete().in("user_id", Object.values(ids));
  await db.from("roadmaps").update({ status: "none", version: 0, published_at: null, published_by: null }).in("student_id", studentIds);
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
        updated_at: new Date().toISOString(),
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

  // Today's appointments, each with that student's advisor
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const offset = tzOffset(new Date());
  const appts = SEED_APPOINTMENTS.map(([email, hhmm, type, modality, location]) => ({
    school_id: schoolId,
    student_id: ids[email],
    staff_id: ids[SEED_STUDENTS.find((s) => s.email === email)!.advisor],
    starts_at: new Date(`${today}T${hhmm}:00${offset}`).toISOString(),
    type,
    modality,
    location,
    external_ref: "seed",
  }));
  const { error: apErr } = await db.from("appointments").insert(appts);
  if (apErr) return fail(`appointments: ${apErr.message}`);
  log.push(`${appts.length} appointments today`);

  // Maya's courses (from "school records")
  const maya = ids["maya@melon.test"];
  await db.from("student_courses").delete().eq("student_id", maya);
  await db.from("student_courses").insert(
    SEED_COURSES.map(([code, title, term, status]) => ({ school_id: schoolId, student_id: maya, code, title, term, status })),
  );

  // Resource library, rewards, integrations
  await db.from("resources").delete().eq("school_id", schoolId).contains("tags", ["seed"]);
  const { error: resErr } = await db
    .from("resources")
    .insert(SEED_RESOURCES.map((r) => ({ ...r, interests: [...r.interests], school_id: schoolId, tags: ["seed"] })));
  if (resErr) return fail(`resources: ${resErr.message}`);

  await db.from("rewards").delete().eq("school_id", schoolId);
  const { error: rwErr } = await db.from("rewards").insert(SEED_REWARDS.map((r) => ({ ...r, school_id: schoolId })));
  if (rwErr) return fail(`rewards: ${rwErr.message}`);

  const { error: inErr } = await db
    .from("integrations")
    .upsert(SEED_INTEGRATIONS.map((i) => ({ ...i, school_id: schoolId })), { onConflict: "school_id,system" });
  if (inErr) return fail(`integrations: ${inErr.message}`);
  log.push(`${SEED_RESOURCES.length} resources, ${SEED_REWARDS.length} rewards, ${SEED_INTEGRATIONS.length} integrations`);

  // Demo history. Priya has a draft waiting for review. Maya has a published roadmap and one reviewed session,
  // which is what makes her briefing worth reading when she moves to a new advisor.
  const { data: library } = await db.from("resources").select("id, type, title, interests").eq("school_id", schoolId).order("title");
  for (const [email, done] of Object.entries(SEED_DONE_ANSWERS)) {
    const s = SEED_STUDENTS.find((x) => x.email === email)!;
    const { paths, items } = buildFirstRoadmap({ ...s, ...done, resources: library ?? [] });
    const { error } = await db.rpc("replace_draft_roadmap", { p_student: ids[email], p_paths: paths, p_items: items });
    if (error) return fail(`draft ${email}: ${error.message}`);
  }
  const lee = ids["lee@melon.test"];
  const { error: pubErr } = await db.rpc("_publish_roadmap", { p_student: maya, p_actor: lee });
  if (pubErr) return fail(`publish: ${pubErr.message}`);
  const history = await seedMayaSession(db, schoolId, maya, lee);
  if (history) return fail(`Maya's history: ${history}`);
  await db.from("roadmap_changes").update({ seen_at: new Date().toISOString() }).eq("student_id", maya);
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

/** A past reviewed session for Maya. Returns an error message if it fails. */
async function seedMayaSession(db: ReturnType<typeof createAdminClient>, schoolId: string, student: string, staff: string) {
  const when = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
  const { data: session, error } = await db
    .from("sessions")
    .insert({ school_id: schoolId, student_id: student, staff_id: staff, status: "ready_for_review", transcript_source: "sample", started_at: when, ended_at: when, created_at: when })
    .select("id")
    .single();
  if (error || !session) return error?.message ?? "no session";
  const sample = earlierConversation("Maya");
  const { data: segments, error: segErr } = await db
    .from("transcript_segments")
    .insert(sample.segments.map((s) => ({ ...s, school_id: schoolId, session_id: session.id, student_id: student })))
    .select("id, idx");
  if (segErr || !segments) return segErr?.message ?? "no transcript";
  for (const insight of sample.insights) {
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
        created_at: when,
      })
      .select("id")
      .single();
    if (insErr || !row) return insErr?.message ?? "no insight";
    await db.from("insight_evidence").insert(insight.evidence.map((idx) => ({ insight_id: row.id, segment_id: segments.find((s) => s.idx === idx)!.id })));
  }
  const { error: applyErr } = await db.rpc("_apply_session_review", { p_session: session.id });
  return applyErr?.message ?? null;
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
