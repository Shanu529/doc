import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { buildPdf } from "@/lib/pdf";
import { entriesFor } from "@/lib/share";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const { data: s } = await a.sb.from("ai_summaries").select("title,body,document_ids").eq("id", id).maybeSingle();
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await buildPdf({ title: s.title ?? "Summary", body: s.body, entries: await entriesFor(a.sb, s.document_ids, a.user.id) });
  await a.sb.from("audit_events").insert({ user_id: a.user.id, event: "summary.pdf", ref_id: id });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="summary.pdf"', "Cache-Control": "no-store" } });
}
