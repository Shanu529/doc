import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { embed } from "@/lib/ai";
import { allow } from "@/lib/ratelimit";
export async function GET(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (!(await allow(`s:${a.user.id}`, 60, 60))) return NextResponse.json({ error: "Too many searches. Wait a moment." }, { status: 429 });
  const { data, error } = await a.sb.rpc("search_documents", { q }); // full text, RLS-scoped
  if (error) return NextResponse.json({ error: "Search failed." }, { status: 500 });
  const results: any[] = [...data];
  try { // semantic matches are added when an embedding provider is configured; failure never breaks search
    const e = await embed([q]);
    if (e) { const { data: m } = await a.sb.rpc("match_chunks", { query_embedding: JSON.stringify(e[0]), match_count: 10 });
      const ids = [...new Set<string>((m ?? []).filter((x: any) => x.similarity > 0.3).map((x: any) => x.document_id))].filter((id) => !results.some((r) => r.id === id));
      if (ids.length) { const { data: docs } = await a.sb.from("documents").select("id,title,doc_type").in("id", ids).is("deleted_at", null);
        for (const d of docs ?? []) results.push({ ...d, snippet: (m.find((x: any) => x.document_id === d.id)?.content ?? "").slice(0, 160), rank: 0 }); } }
  } catch {}
  return NextResponse.json({ results });
}
