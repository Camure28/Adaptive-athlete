// Shared by the Edge Functions: keys, replies, and the signed-in caller.
//
// The caller's access token is checked with Supabase Auth, and their rows are read with that token,
// so row-level security limits every read to their own data. Writes that only the server may make
// use the project's secret key (provided to Edge Functions by Supabase; never in the app or repo).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = keyFrom("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secretKey = keyFrom("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

function keyFrom(jsonName: string, legacyName: string): string {
  const json = Deno.env.get(jsonName);
  const key = json ? (JSON.parse(json) as Record<string, string>).default : Deno.env.get(legacyName);
  if (!key) throw new Error(`Missing ${jsonName}`);
  return key;
}

export const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const admin = (): SupabaseClient => createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * The signed-in caller and the athlete's local date from the request body, or the reply to send.
 * The date is accepted only within a day of the server's (time zones), so it can't be backdated.
 */
export async function caller(req: Request, signInMessage: string): Promise<{ asUser: SupabaseClient; today: string; body: Record<string, unknown> } | Response> {
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: signInMessage });
  const asUser = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await asUser.auth.getUser(token);
  if (!auth.user) return reply(401, { error: signInMessage });

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const today = String(body.today ?? "");
  const serverDay = Date.parse(new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Math.abs(Date.parse(today) - serverDay) > 86_400_000) {
    return reply(400, { error: "Your phone's date looks wrong. Check it and try again." });
  }
  return { asUser, today, body };
}
