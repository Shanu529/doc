import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
export async function GET() {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const t = async (n: string) => (await a.sb.from(n).select("*")).data ?? [];
  const body = { exported_at: new Date().toISOString(), account: { id: a.user.id, email: a.user.email }, folders: await t("folders"), documents: await t("documents"), extracted_text: await t("extracted_document_data"), ai_summaries: await t("ai_summaries"), share_links: (await a.sb.from("share_links").select("id,created_at,expires_at,revoked_at,recipient_email,summary_id")).data ?? [], audit_events: await t("audit_events") };
  return new NextResponse(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="vault-export.json"', "Cache-Control": "no-store" } });
}
