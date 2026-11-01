import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { aiConfigured, complete } from "@/lib/ai";
import { retrieve } from "@/lib/retrieve";
import { allow } from "@/lib/ratelimit";
import { ASK_SYSTEM } from "@/lib/prompts";
import { checkCitations } from "@/lib/citations";
export const maxDuration = 60;
export async function POST(req: Request) {
  const a = await requireUser(); if (!a) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: "AI is not configured on this server." }, { status: 503 });
  const p = z.object({ question: z.string().trim().min(3).max(500), documentIds: z.array(z.string().uuid()).max(20).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a question." }, { status: 400 });
  if (!(await allow(`aim:${a.user.id}`, 10, 60)) || !(await allow(`aid:${a.user.id}`, Number(process.env.AI_DAILY_LIMIT ?? 30), 86400))) return NextResponse.json({ error: "AI usage limit reached. Try again later." }, { status: 429 });
  const chunks = await retrieve(a.sb, p.data.question, p.data.documentIds);
  if (!chunks.length) return NextResponse.json({ answer: "I couldn't find anything about that in your processed documents.", sources: [] });
  const ctx = chunks.map((c, i) => `[${i + 1}] ${c.title}${c.page ? `, page ${c.page}` : ""}\n${c.content}`).join("\n\n---\n\n");
  try {
    const raw = await complete(ASK_SYSTEM, `Sources:\n${ctx}\n\nQuestion: ${p.data.question}`, 900);
    const chk = checkCitations(raw, chunks.map((c) => c.content)); const warnings = [...chk.warnings];
    if (!chk.cited.length && !/\b(not|no|cannot|couldn't)\b/i.test(raw)) warnings.push("The answer cites no sources. Treat it as unverified.");
    return NextResponse.json({ answer: chk.clean, warnings, sources: chunks.map((c, i) => ({ n: i + 1, documentId: c.document_id, title: c.title, page: c.page, cited: chk.cited.includes(i + 1), excerpt: c.content.slice(0, 160) })) });
  } catch { return NextResponse.json({ error: "The AI provider is unavailable. Search still works." }, { status: 502 }); }
}
