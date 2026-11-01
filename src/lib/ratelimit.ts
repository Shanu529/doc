import { supabaseAdmin } from "./supabase/server";
/** Returns false when over the limit OR when the limiter cannot be reached. It fails closed: no enforcement means no access. */
export async function allow(key: string, max: number, windowSec: number) {
  try { const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { k: key, max_hits: max, window_seconds: windowSec }); return !error && data === true; } catch { return false; }
}
export const clientIp = (h: Headers) => (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
