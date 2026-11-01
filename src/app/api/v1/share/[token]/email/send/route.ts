import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hashToken, newCode, hashCode } from "@/lib/token";
import { sendMail, mailConfigured } from "@/lib/mail";
import { allow, clientIp } from "@/lib/ratelimit";
/** Always answers the same way, so the page never reveals whether an address is the intended recipient. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const sb = supabaseAdmin();
  const back = (q = "?e=sent") => NextResponse.redirect(new URL(`/s/${token}${q}`, process.env.APP_URL), 303);
  if (!(await allow(`em:${clientIp(req.headers)}`, 5, 600))) return back("?e=rate");
  const email = String((await req.formData()).get("email") ?? "").trim().toLowerCase();
  const { data: l } = await sb.from("share_links").select("id,user_id,recipient_email,expires_at,revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!l || !l.recipient_email || l.revoked_at || new Date(l.expires_at) < new Date() || email !== l.recipient_email || !mailConfigured()) return back();
  if (!(await allow(`emlink:${l.id}`, 5, 3600))) return back("?e=rate");
  const code = newCode();
  await sb.from("share_email_codes").upsert({ link_id: l.id, code_hash: hashCode(l.id, code), expires_at: new Date(Date.now() + 10 * 60e3).toISOString(), attempts: 0, sent_at: new Date().toISOString() });
  try { await sendMail(email, "Your verification code", `Your verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`); await sb.from("audit_events").insert({ user_id: l.user_id, event: "share.email_code_sent", ref_id: l.id }); } catch {}
  return back();
}
