import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { storage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const { data: d } = await a.sb.from("documents").select("storage_key,original_name").eq("id", id).is("deleted_at", null).maybeSingle(); // RLS + owner check
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(await storage.signedGetUrl(d.storage_key, d.original_name, 60));
}
