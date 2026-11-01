import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase/server";
import { hashToken, proofCookie, safeEq } from "./token";
export { newToken, hashToken } from "./token";

export type GateLink = { token_hash: string; expires_at: string; revoked_at: string | null; pin_hash: string | null; recipient_email: string | null };
/** Pure access decision, tested directly. */
export function gateStatus(l: GateLink | null, now: Date, proofs: { pin?: string; email?: string }): "invalid" | "email" | "pin" | "ok" {
  if (!l || l.revoked_at || new Date(l.expires_at) <= now) return "invalid";
  if (l.recipient_email && !safeEq(proofs.email, proofCookie("email", l.token_hash))) return "email";
  if (l.pin_hash && !safeEq(proofs.pin, proofCookie("pin", l.token_hash))) return "pin";
  return "ok";
}
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
/** Only documents owned by the link's creator are ever described. */
export async function entriesFor(sb: any, ids: string[], userId: string) {
  if (!ids.length) return [];
  const { data } = await sb.from("documents").select("title,doc_type,doc_date,created_at,metadata_status").in("id", ids).eq("user_id", userId);
  return (data ?? []).map((d: any) => ({ date: d.doc_date ?? String(d.created_at).slice(0, 10), type: d.doc_type ?? "document", title: d.title, confirmed: d.metadata_status === "user_confirmed" })).sort((a: any, b: any) => a.date.localeCompare(b.date));
}
export type ShareResult = { status: "invalid" } | { status: "pin"; linkId: string } | { status: "email"; linkId: string; hint: string } | { status: "ok"; linkId: string; docs: any[]; summary: any | null };
export async function resolveShareWith(token: string, proofs: { pin?: string; email?: string }, log = false): Promise<ShareResult> {
  const sb = supabaseAdmin(); const th = hashToken(token);
  const { data: l } = await sb.from("share_links").select("id,user_id,expires_at,revoked_at,pin_hash,recipient_email,summary_id").eq("token_hash", th).maybeSingle();
  const g = gateStatus(l ? { ...l, token_hash: th } : null, new Date(), proofs);
  if (g === "invalid" || !l) return { status: "invalid" };
  if (g === "pin") return { status: "pin", linkId: l.id };
  if (g === "email") return { status: "email", linkId: l.id, hint: maskEmail(l.recipient_email!) };
  const { data } = await sb.from("share_link_documents").select("documents(id,title,doc_type,storage_key,original_name,deleted_at,user_id)").eq("share_link_id", l.id);
  const docs = (data ?? []).map((r: any) => r.documents).filter((d: any) => d && !d.deleted_at && d.user_id === l.user_id);
  let summary: any = null;
  if (l.summary_id) { const { data: sm } = await sb.from("ai_summaries").select("id,title,body,kind,document_ids").eq("id", l.summary_id).eq("user_id", l.user_id).maybeSingle(); if (sm) summary = { ...sm, entries: await entriesFor(sb, sm.document_ids, l.user_id) }; }
  if (log) await sb.from("audit_events").insert({ user_id: l.user_id, event: "share.access", ref_id: l.id });
  return { status: "ok", linkId: l.id, docs, summary };
}
export async function resolveShare(token: string, log = false) {
  const th = hashToken(token).slice(0, 12); const jar = await cookies();
  return resolveShareWith(token, { pin: jar.get("sp_" + th)?.value, email: jar.get("se_" + th)?.value }, log);
}
