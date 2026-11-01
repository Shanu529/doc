import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/ratelimit";
import { randomUUID } from "crypto";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { storage } from "@/lib/storage";
import { sniffMime, MAX_BYTES } from "@/lib/files";

export async function GET(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const sp = new URL(req.url).searchParams; const view = sp.get("view") ?? "active";
  let q = a.sb.from("documents").select("id,title,doc_type,doc_date,tags,notes,folder_id,mime_type,size_bytes,processing_status,processing_error,partial,processing_note,metadata_status,created_at");
  q = view === "trash" ? q.not("deleted_at", "is", null) : view === "archived" ? q.is("deleted_at", null).not("archived_at", "is", null) : q.is("deleted_at", null).is("archived_at", null);
  const f = sp.get("folder"); if (f === "none") q = q.is("folder_id", null); else if (f) q = q.eq("folder_id", f);
  if (sp.get("type")) q = q.eq("doc_type", sp.get("type")!); if (sp.get("status")) q = q.eq("processing_status", sp.get("status")!);
  if (sp.get("from")) q = q.gte("created_at", sp.get("from")!);
  const sort = sp.get("sort"); q = sort === "title" ? q.order("title") : q.order("created_at", { ascending: sort === "oldest" });
  const { data, error } = await q;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ documents: data });
}

export async function POST(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await allow(`up:${a.user.id}`, 60, 60))) return NextResponse.json({ error: "Too many uploads. Wait a minute." }, { status: 429 });
  const files = (await req.formData()).getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  const results = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) { results.push({ name: f.name, error: "File is larger than the upload limit." }); continue; }
    const buf = Buffer.from(await f.arrayBuffer());
    const mime = sniffMime(buf);
    if (!mime) { results.push({ name: f.name, error: "Only PDF, PNG and JPEG files are supported." }); continue; }
    const key = `${randomUUID()}`; // random, non-sensitive object key
    await storage.put(key, buf, mime);
    const { data, error } = await a.sb.from("documents").insert({ user_id: a.user.id, title: f.name.replace(/\.[^.]+$/, ""), original_name: f.name, mime_type: mime, size_bytes: buf.length, storage_key: key }).select("id").single();
    if (error) { await storage.remove(key); results.push({ name: f.name, error: "Could not save the document." }); continue; }
    // Hook for async pipeline: enqueue OCR/extraction/classification here (see README).
    await supabaseAdmin().from("processing_jobs").insert({ document_id: data.id, user_id: a.user.id, kind: "extract" });
    await a.sb.from("audit_events").insert({ user_id: a.user.id, event: "document.upload", ref_id: data.id });
    results.push({ name: f.name, id: data.id });
  }
  return NextResponse.json({ results });
}
