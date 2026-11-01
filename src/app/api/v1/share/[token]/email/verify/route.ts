import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hashToken, hashCode, proofCookie, safeEq } from "@/lib/token";
import { allow, clientIp } from "@/lib/ratelimit";
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const th = hashToken(token); const sb = supabaseAdmin();
  const back = (q = "") => NextResponse.redirect(new URL(`/s/${token}${q}`, process.env.APP_URL), 303);
  if (!(await allow(`emv:${clientIp(req.headers)}`, 10, 600))) return back("?e=rate");
  const code = String((await req.formData()).get("code") ?? "").trim();
  const { data: l } = await sb.from("share_links").select("id,user_id,expires_at,revoked_at,recipient_email").eq("token_hash", th).maybeSingle();
  if (!l || !l.recipient_email || l.revoked_at || new Date(l.expires_at) < new Date()) return back();
  const { data: c } = await sb.from("share_email_codes").select("code_hash,expires_at,attempts").eq("link_id", l.id).maybeSingle();
  if (!c || new Date(c.expires_at) < new Date() || c.attempts >= 5) return back("?e=code");
  if (!safeEq(c.code_hash, hashCode(l.id, code))) { await sb.from("share_email_codes").update({ attempts: c.attempts + 1 }).eq("link_id", l.id); await sb.from("audit_events").insert({ user_id: l.user_id, event: "share.email_fail", ref_id: l.id }); return back("?e=code"); }
  await sb.from("share_email_codes").delete().eq("link_id", l.id);
  await sb.from("audit_events").insert({ user_id: l.user_id, event: "share.email_ok", ref_id: l.id });
  const res = back(); res.cookies.set("se_" + th.slice(0, 12), proofCookie("email", th), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600, path: "/" }); return res;
}
