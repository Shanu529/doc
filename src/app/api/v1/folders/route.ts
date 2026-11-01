import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
export async function GET() {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data } = await a.sb.from("folders").select("id,name,parent_id").order("name"); return NextResponse.json({ folders: data ?? [] });
}
export async function POST(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const p = z.object({ name: z.string().trim().min(1).max(80), parent_id: z.string().uuid().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a folder name." }, { status: 400 });
  const { data, error } = await a.sb.from("folders").insert({ user_id: a.user.id, name: p.data.name, parent_id: p.data.parent_id ?? null }).select("id,name,parent_id").single();
  return error ? NextResponse.json({ error: "Could not create folder." }, { status: 500 }) : NextResponse.json({ folder: data });
}
