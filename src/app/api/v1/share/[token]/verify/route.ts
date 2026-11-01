import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hashToken, verifyPin, proofCookie } from "@/lib/token";
import { allow, clientIp } from "@/lib/ratelimit";
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const th = hashToken(token); const sb = supabaseAdmin();
  if (!(await allow(`pin:${clientIp(req.headers)}`, 10, 60))) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  const back = (q = "") => NextResponse.redirect(new URL(`/s/${token}${q}`, process.env.APP_URL), 303);
  const { data: l } = await sb.from("share_links").select("id,user_id,pin_hash,failed_attempts,expires_at,revoked_at").eq("token_hash", th).maybeSingle();
  if (!l || !l.pin_hash || l.revoked_at || new Date(l.expires_at) < new Date()) return back();
  if (l.failed_attempts >= 10) return back("?e=locked");
  const pin = String((await req.formData()).get("pin") ?? "");
  if (!verifyPin(pin, l.pin_hash)) { await sb.from("share_links").update({ failed_attempts: l.failed_attempts + 1 }).eq("id", l.id); await sb.from("audit_events").insert({ user_id: l.user_id, event: "share.pin_fail", ref_id: l.id }); return back("?e=pin"); }
  await sb.from("audit_events").insert({ user_id: l.user_id, event: "share.pin_ok", ref_id: l.id });
  const res = back(); res.cookies.set("sp_" + th.slice(0, 12), proofCookie("pin", th), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600, path: "/" }); return res;
}
