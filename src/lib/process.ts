import { supabaseAdmin } from "./supabase/server";
import { storage } from "./storage";
import { classify, extractDate, chunkPages } from "./process-classify";
import { aiConfigured, ocr, embed } from "./ai";
import { allow } from "./ratelimit";

async function readPdfPages(buf: Buffer): Promise<string[]> {
  const pdf = (await import("pdf-parse/lib/pdf-parse.js" as any)).default; const pages: string[] = [];
  await pdf(buf, { pagerender: (p: any) => p.getTextContent().then((tc: any) => { const t = tc.items.map((i: any) => i.str).join(" "); pages.push(t.trim()); return t; }) });
  return pages;
}
/** One document through the pipeline. Safe to retry. Uses the service role; callers must have authorised the document first. */
export async function processDocument(docId: string) {
  const sb = supabaseAdmin();
  const { data: d } = await sb.from("documents").select("id,user_id,storage_key,mime_type,doc_type,doc_date").eq("id", docId).single(); if (!d) return;
  await sb.from("documents").update({ processing_status: "processing", processing_error: null, partial: false, processing_note: null }).eq("id", docId);
  try {
    const buf = await storage.get(d.storage_key);
    let pages = d.mime_type === "application/pdf" ? await readPdfPages(buf) : [];
    const notes: string[] = [];
    if (pages.join("").length >= 20) { const blank = pages.filter((p) => p.length < 20).length; if (blank) notes.push(`${blank} of ${pages.length} pages had no extractable text (possibly scanned) and were not read.`); }
    if (pages.join("").length < 20) {
      if (process.env.OCR_PROVIDER !== "anthropic" || !aiConfigured()) throw new Error("No readable text found and OCR is not configured.");
      if (!(await allow(`ocr:${d.user_id}`, Number(process.env.OCR_DAILY_LIMIT ?? 50), 86400))) throw new Error("Daily OCR limit reached. Retry tomorrow.");
      const o = await ocr(buf, d.mime_type); pages = o.pages; if (o.note) notes.push(o.note);
      if (pages.join("").length < 20) throw new Error("OCR found no readable text.");
    }
    const text = pages.join("\n\n"); const c = classify(text); const { chunks, truncated } = chunkPages(pages, 1200, Number(process.env.MAX_CHUNKS ?? 400));
    if (truncated) notes.push("The document is very long; only the first part is searchable and available to AI.");
    await sb.from("extracted_document_data").upsert({ document_id: d.id, user_id: d.user_id, full_text: text, confidence: c.confidence });
    await sb.from("document_chunks").delete().eq("document_id", d.id);
    let vectors: number[][] | null = null;
    try { vectors = []; for (let i = 0; i < chunks.length; i += 64) { const v = await embed(chunks.slice(i, i + 64).map((x) => x.content)); if (!v) { vectors = null; break; } vectors.push(...v); } } catch { vectors = null; } // search still works via full text
    if (chunks.length) await sb.from("document_chunks").insert(chunks.map((x, i) => ({ document_id: d.id, user_id: d.user_id, page: x.page, content: x.content, ...(vectors ? { embedding: JSON.stringify(vectors[i]) } : {}) })));
    const date = d.doc_date ? null : extractDate(text);
    await sb.from("documents").update({ processing_status: "done", partial: notes.length > 0, processing_note: notes.join(" ") || null, ...(d.doc_type ? {} : { doc_type: c.type, type_confidence: c.confidence }), ...(date ? { doc_date: date } : {}) }).eq("id", docId);
    await sb.from("processing_jobs").update({ status: "done", error: null }).eq("document_id", docId);
  } catch (e: any) {
    const msg = String(e?.message ?? "Processing failed").slice(0, 300);
    await sb.from("documents").update({ processing_status: "failed", processing_error: msg }).eq("id", docId);
    await sb.from("processing_jobs").update({ status: "failed", error: msg }).eq("document_id", docId);
  }
}
