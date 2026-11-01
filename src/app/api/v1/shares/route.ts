import { NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { requireUser } from "@/lib/supabase/server";
import { newToken, hashToken, hashPin } from "@/lib/token";
import { allow } from "@/lib/ratelimit";
import { mailConfigured } from "@/lib/mail";
const Body = z.object({ documentIds: z.array(z.string().uuid()).max(50).default([]), summaryId: z.string().uuid().optional(), confirmSummary: z.boolean().optional(),
  expiresInHours: z.number().int().min(1).max(24 * 30), pin: z.string().regex(/^\d{4,8}$/).optional(), recipientEmail: z.string().email().max(200).optional() })
  .refine((b) => b.documentIds.length > 0 || b.summaryId, "Nothing selected").refine((b) => !b.summaryId || b.confirmSummary, "Confirm the summary before sharing");
export async function POST(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await allow(`sh:${a.user.id}`, 20, 3600))) return NextResponse.json({ error: "Too many share links created. Try again later." }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Select what to share, and confirm summaries before sharing." }, { status: 400 });
  if (p.data.recipientEmail && !mailConfigured()) return NextResponse.json({ error: "Email verification is not configured on this server." }, { status: 400 });
  if (p.data.documentIds.length) { const { data: owned } = await a.sb.from("documents").select("id").in("id", p.data.documentIds).is("deleted_at", null);
    if (!owned || owned.length !== p.data.documentIds.length) return NextResponse.json({ error: "One or more documents were not found." }, { status: 404 }); }
  if (p.data.summaryId) { const { data: s } = await a.sb.from("ai_summaries").select("id").eq("id", p.data.summaryId).maybeSingle(); if (!s) return NextResponse.json({ error: "Summary not found." }, { status: 404 }); }
  const token = newToken();
  const { data: link, error } = await a.sb.from("share_links").insert({ user_id: a.user.id, token_hash: hashToken(token), pin_hash: p.data.pin ? hashPin(p.data.pin) : null, recipient_email: p.data.recipientEmail?.toLowerCase() ?? null, summary_id: p.data.summaryId ?? null, expires_at: new Date(Date.now() + p.data.expiresInHours * 3600e3).toISOString() }).select("id").single();
  if (error) return NextResponse.json({ error: "Could not create the link." }, { status: 500 });
  if (p.data.documentIds.length) await a.sb.from("share_link_documents").insert(p.data.documentIds.map((id) => ({ share_link_id: link.id, document_id: id })));
  await a.sb.from("audit_events").insert({ user_id: a.user.id, event: p.data.summaryId ? "share.create.summary" : "share.create", ref_id: link.id });
  const url = `${process.env.APP_URL}/s/${token}`;
  return NextResponse.json({ id: link.id, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) });
}

/** Share history: every link with what it exposes, status, and its access trail. IPs are not stored. */
export async function GET() {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: links } = await a.sb.from("share_links").select("id,created_at,expires_at,revoked_at,recipient_email,pin_hash,summary_id").order("created_at", { ascending: false }).limit(100);
  const ids = (links ?? []).map((l: any) => l.id); if (!ids.length) return NextResponse.json({ shares: [] });
  const sids = (links ?? []).map((l: any) => l.summary_id).filter(Boolean);
  const [{ data: items }, { data: sums }, { data: ev }] = await Promise.all([
    a.sb.from("share_link_documents").select("share_link_id,documents(title)").in("share_link_id", ids),
    sids.length ? a.sb.from("ai_summaries").select("id,title,kind").in("id", sids) : Promise.resolve({ data: [] as any[] }),
    a.sb.from("audit_events").select("ref_id,event,created_at").in("ref_id", ids).like("event", "share.%").order("created_at", { ascending: false }).limit(1000)]);
  const now = Date.now();
  return NextResponse.json({ shares: (links ?? []).map((l: any) => {
    const events = (ev ?? []).filter((e: any) => e.ref_id === l.id); const acc = events.filter((e: any) => e.event === "share.access");
    return { id: l.id, createdAt: l.created_at, expiresAt: l.expires_at, revokedAt: l.revoked_at, status: l.revoked_at ? "revoked" : new Date(l.expires_at).getTime() < now ? "expired" : "active",
      recipientEmail: l.recipient_email, pinProtected: !!l.pin_hash, documents: (items ?? []).filter((i: any) => i.share_link_id === l.id).map((i: any) => i.documents?.title).filter(Boolean),
      summary: (sums ?? []).find((s: any) => s.id === l.summary_id) ?? null, accessCount: acc.length, lastAccess: acc[0]?.created_at ?? null, events: events.slice(0, 20).map((e: any) => ({ event: e.event, at: e.created_at })) }; }) });
}
