import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveShare } from "@/lib/share";
import { buildPdf } from "@/lib/pdf";
import { allow, clientIp } from "@/lib/ratelimit";
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await allow(`sv:${clientIp(await headers())}`, 120, 60))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const s = await resolveShare(token);
  if (s.status !== "ok" || !s.summary) return NextResponse.json({ error: "This link is invalid, expired or revoked." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const bytes = await buildPdf({ title: s.summary.title ?? "Summary", body: s.summary.body, entries: s.summary.entries });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="summary.pdf"', "Cache-Control": "no-store" } });
}
