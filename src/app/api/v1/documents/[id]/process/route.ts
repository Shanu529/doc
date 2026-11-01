import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { processDocument } from "@/lib/process";
export const maxDuration = 60;
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const { data: d } = await a.sb.from("documents").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await processDocument(id);
  return NextResponse.json({ ok: true });
}
