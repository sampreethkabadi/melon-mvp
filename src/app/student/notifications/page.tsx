import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { longDate, timeOf } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "../actions";

export const metadata = { title: "Notifications · Melon" };

type Note = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data }] = await Promise.all([
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase.from("notifications").select("id, type, title, body, link, read_at, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const notes = (data ?? []) as Note[];
  const unread = notes.filter((n) => !n.read_at).length;

  return (
    <main className="relative mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Notifications</h1>
          <p className="mt-1 text-ink-2">{unread ? `${unread} new` : "You're all caught up."}</p>
        </div>
        {unread > 0 && (
          <form action={markNotificationsRead}>
            <SubmitButton label="Mark all as read" variant="secondary" />
          </form>
        )}
      </div>
      {notes.length ? (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => {
            const body = (
              <>
                <span className="flex items-start justify-between gap-3">
                  <b className="flex items-center gap-2">
                    {!n.read_at && <span className="size-2 shrink-0 rounded-full bg-melon" aria-label="New" />}
                    {n.title}
                  </b>
                  <span className="shrink-0 text-xs text-muted">
                    {longDate(n.created_at)} · {timeOf(n.created_at)}
                  </span>
                </span>
                {n.body && <span className="mt-1 block text-sm text-ink-2">{n.body}</span>}
              </>
            );
            const cls = `block rounded-2xl border px-4 py-3 ${n.read_at ? "border-line bg-white/85" : "border-ink/20 bg-white shadow-sm"}`;
            return (
              <li key={n.id}>
                {n.link?.startsWith("/student") ? (
                  <Link href={n.link} className={`${cls} hover:border-ink`}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-muted">
          Nothing yet. You&apos;ll hear here when your roadmap changes or a session summary is ready.
        </p>
      )}
    </main>
  );
}
