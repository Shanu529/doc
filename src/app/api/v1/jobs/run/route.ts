import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processDocument } from "@/lib/process";
import { storage } from "@/lib/storage";
export const maxDuration = 300; // OCR of long scans runs in sequential batches; Vercel Hobby caps functions at 60s
// Call from a cron (Vercel Cron / GitHub Actions) with header x-worker-secret. Also purges expired trash.
export async function POST(req: Request) {
  if (!process.env.WORKER_SECRET || req.headers.get("x-worker-secret") !== process.env.WORKER_SECRET) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sb = supabaseAdmin();
  const { data: jobs } = await sb.from("processing_jobs").select("id,document_id").eq("status", "queued").lt("attempts", 3).limit(5);
  for (const j of jobs ?? []) { await sb.from("processing_jobs").update({ attempts: 1 }).eq("id", j.id); await processDocument(j.document_id); }
  const cutoff = new Date(Date.now() - Number(process.env.TRASH_RETENTION_DAYS ?? 30) * 864e5).toISOString();
  const { data: old } = await sb.from("documents").select("id,storage_key").lt("deleted_at", cutoff).limit(50);
  let purged = 0; for (const d of old ?? []) { try { await storage.remove(d.storage_key); await sb.from("documents").delete().eq("id", d.id); purged++; } catch {} } // a failed file delete keeps the row so the purge is retried
  return NextResponse.json({ processed: jobs?.length ?? 0, purged });
}
