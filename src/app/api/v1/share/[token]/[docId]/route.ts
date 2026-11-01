import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveShare } from "@/lib/share";
import { storage } from "@/lib/storage";
import { allow, clientIp } from "@/lib/ratelimit";
export async function GET(_: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  if (!(await allow(`sv:${clientIp(await headers())}`, 120, 60))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const s = await resolveShare(token);
  const doc = s.status === "ok" ? s.docs.find((d: any) => d.id === docId) : null;
  if (!doc) return NextResponse.json({ error: "This link is invalid, expired or revoked." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const res = NextResponse.redirect(await storage.signedGetUrl(doc.storage_key, doc.original_name, 60)); res.headers.set("Cache-Control", "no-store"); return res;
}
