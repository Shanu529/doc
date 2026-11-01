import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { storage } from "@/lib/storage";
const Patch = z.object({ title: z.string().trim().min(1).max(200), tags: z.array(z.string().trim().min(1).max(40)).max(20), doc_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), notes: z.string().max(5000).nullable(),
  doc_type: z.string().max(60).nullable(), folder_id: z.string().uuid().nullable(), archived: z.boolean(), trashed: z.boolean(), confirm_metadata: z.boolean() }).partial();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const p = Patch.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { id } = await params; const { archived, trashed, confirm_metadata, ...rest } = p.data; const u: any = { ...rest };
  if (rest.folder_id) { const { data: f } = await a.sb.from("folders").select("id").eq("id", rest.folder_id).maybeSingle(); if (!f) return NextResponse.json({ error: "Folder not found." }, { status: 404 }); }
  if (archived !== undefined) u.archived_at = archived ? new Date().toISOString() : null;
  if (trashed !== undefined) u.deleted_at = trashed ? new Date().toISOString() : null;
  if (confirm_metadata || rest.doc_type !== undefined || rest.doc_date !== undefined) u.metadata_status = "user_confirmed";
  const { data, error } = await a.sb.from("documents").update(u).eq("id", id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await a.sb.from("audit_events").insert({ user_id: a.user.id, event: "document.update", ref_id: id });
  return NextResponse.json({ ok: true });
}
/** Permanent deletion; only allowed from trash. Removes original file, text, chunks/embeddings, summaries refs (cascade), share entries. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const { data: d } = await a.sb.from("documents").select("storage_key,deleted_at").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!d.deleted_at) return NextResponse.json({ error: "Move the document to trash first." }, { status: 409 });
  await storage.remove(d.storage_key);
  await a.sb.from("ai_summaries").delete().contains("document_ids", [id]);
  await a.sb.from("documents").delete().eq("id", id);
  await a.sb.from("audit_events").insert({ user_id: a.user.id, event: "document.purge", ref_id: id });
  return NextResponse.json({ ok: true });
}
