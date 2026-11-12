import "server-only";

// Video calls run on Daily (daily.co). Rooms are private: nobody gets in without a meeting token, and Melon only
// hands tokens to the session's student and its advisor or coach. Set DAILY_API_KEY to turn calls on.

const API = "https://api.daily.co/v1";

export const isDailyConfigured = () => Boolean(process.env.DAILY_API_KEY);

async function daily<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Daily said ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

/** Room names are derived from the session, so a retry finds the same room. */
export const roomNameFor = (sessionId: string) => `melon-${sessionId}`;

/** Creates the session's private room (or finds it if it's already there). Rooms close after 3 hours. */
export async function ensureRoom(sessionId: string): Promise<{ name: string; url: string }> {
  const name = roomNameFor(sessionId);
  try {
    return await daily<{ name: string; url: string }>(`/rooms/${name}`);
  } catch {
    // Not there yet: create it.
  }
  return daily<{ name: string; url: string }>("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        exp: Math.floor(Date.now() / 1000) + 3 * 3600,
        eject_at_room_exp: true,
        max_participants: 4,
        enable_prejoin_ui: false,
        enable_chat: true,
        enable_screenshare: true,
      },
    }),
  });
}

/** A token for one person in one room. The advisor or coach is the room's owner. */
export async function meetingToken(room: string, userName: string, owner: boolean): Promise<string> {
  const { token } = await daily<{ token: string }>("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: { room_name: room, user_name: userName, is_owner: owner, exp: Math.floor(Date.now() / 1000) + 3 * 3600 },
    }),
  });
  return token;
}
