import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const { error } = await a.sb.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not revoke." }, { status: 500 });
  await a.sb.from("audit_events").insert({ user_id: a.user.id, event: "share.revoke", ref_id: id });
  return NextResponse.json({ ok: true });
}
