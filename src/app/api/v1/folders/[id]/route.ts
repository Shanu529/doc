import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const p = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a folder name." }, { status: 400 });
  const { id } = await params; const { data } = await a.sb.from("folders").update({ name: p.data.name }).eq("id", id).select("id").maybeSingle();
  return data ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
// Deleting a folder keeps its documents (folder_id set null).
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params; await a.sb.from("folders").delete().eq("id", id); return NextResponse.json({ ok: true });
}
