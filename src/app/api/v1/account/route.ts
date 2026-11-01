import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { storage } from "@/lib/storage";
/** Account deletion. Requires re-entering the password (reauthentication). */
export async function DELETE(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { password } = await req.json().catch(() => ({}));
  const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await probe.auth.signInWithPassword({ email: a.user.email!, password: String(password ?? "") });
  if (error) return NextResponse.json({ error: "Password is incorrect." }, { status: 403 });
  const sb = supabaseAdmin();
  const { data: req0 } = await sb.from("deletion_requests").insert({ user_id: a.user.id }).select("id").single();
  const { data: docs } = await sb.from("documents").select("storage_key").eq("user_id", a.user.id);
  const failed: string[] = [];
  for (const d of docs ?? []) { try { await storage.remove(d.storage_key); } catch { failed.push(d.storage_key); } }
  if (failed.length) return NextResponse.json({ error: `${failed.length} stored file(s) could not be deleted, so your account was kept. Try again.` }, { status: 502 });
  const { error: delErr } = await sb.auth.admin.deleteUser(a.user.id); // cascades to every user-owned table
  if (delErr) return NextResponse.json({ error: "Account deletion failed. Try again." }, { status: 500 });
  if (req0) await sb.from("deletion_requests").update({ completed_at: new Date().toISOString() }).eq("id", req0.id);
  return NextResponse.json({ ok: true, note: "Files and database records are deleted now. Provider backups expire on their own schedule." });
}
