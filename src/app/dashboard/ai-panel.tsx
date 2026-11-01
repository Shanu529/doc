"use client";
import { useState } from "react";
import SummaryCard, { Summary } from "./summary-card";
const post = async (u: string, b: unknown) => { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { ok: r.ok, j: await r.json().catch(() => ({})) }; };
export default function AiPanel({ selected, onPreview }: { selected: string[]; onPreview: (id: string) => void }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [ans, setAns] = useState<{ answer: string; sources: any[]; warnings?: string[] } | null>(null); const [sum, setSum] = useState<Summary | null>(null);
  async function ask(e: React.FormEvent) { e.preventDefault(); setBusy(true); setErr(""); setSum(null); const { ok, j } = await post("/api/v1/ai/ask", { question: q, ...(selected.length ? { documentIds: selected.slice(0, 20) } : {}) }); setBusy(false); ok ? setAns(j) : setErr(j.error); }
  async function summarize(kind: string) { setBusy(true); setErr(""); setAns(null); const { ok, j } = await post("/api/v1/ai/summarize", { documentIds: selected.slice(0, 15), kind }); setBusy(false); ok ? setSum(j.summary) : setErr(j.error); }
  return (
    <section className="card"><h2 style={{ margin: 0 }}>Ask your documents</h2>
      <p className="muted">Answers use only text from your own processed documents and cite their sources. {selected.length ? `Limited to the ${selected.length} selected.` : "Searching all your documents."} Relevant excerpts are sent to the configured AI provider.</p>
      <form onSubmit={ask} className="acts"><input style={{ flex: "1 1 16rem" }} aria-label="Question" placeholder="e.g. What was my last hemoglobin result?" value={q} onChange={(e) => setQ(e.target.value)} required minLength={3} />
        <button className="btn primary" disabled={busy}>{busy ? "Working…" : "Ask"}</button></form>
      <span className="acts"><button className="btn" disabled={busy || !selected.length} onClick={() => summarize("summary")}>Summarize selected</button>
        <button className="btn" disabled={busy || !selected.length} onClick={() => summarize("medical")}>Medical history summary (selected)</button></span>
      {err && <p role="alert">{err}</p>}
      {ans && <div className="stack"><div className="pre">{ans.answer}</div>{(ans as any).warnings?.map((w: string) => <p role="alert" key={w}>{w}</p>)}{ans.sources.length > 0 && <ul className="list">{ans.sources.map((s) => <li key={s.n}><span>[{s.n}]{s.cited ? " (cited)" : ""} {s.title}{s.page ? `, page ${s.page}` : ""}<small>{s.excerpt}…</small></span><button className="btn" onClick={() => onPreview(s.documentId)}>Open</button></li>)}</ul>}</div>}
      {sum && <SummaryCard s={sum} />}
    </section>);
}
