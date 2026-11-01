"use client";
import { useState } from "react";
import SummaryCard, { Summary } from "../summary-card";
export default function Timeline({ docs }: { docs: any[] }) {
  const rows = [...docs].sort((a, b) => String(b.doc_date ?? b.created_at).localeCompare(String(a.doc_date ?? a.created_at)));
  const [sel, setSel] = useState(new Set<string>(rows.map((r) => r.id))); const [sum, setSum] = useState<Summary | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function gen() { setBusy(true); setErr(""); const r = await fetch("/api/v1/ai/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentIds: [...sel].slice(0, 15), kind: "medical" }) }); const j = await r.json(); setBusy(false); r.ok ? setSum(j.summary) : setErr(j.error); }
  return (
    <main className="wide"><header className="bar"><h1>Medical timeline</h1><a href="/dashboard">Back to documents</a></header>
      <p className="muted">Built from documents typed as lab report, prescription or discharge summary. Dates marked "upload date" were not found in the document. Extracted values are not verified until you confirm them in the document editor. This is a record organiser, not a diagnostic tool.</p>
      {rows.length === 0 ? <p className="empty">No medical documents yet. Upload records, then set each document's type to lab report, prescription or discharge summary.</p> : (
        <ul className="list">{rows.map((d) => (
          <li key={d.id}><label className="row"><input type="checkbox" checked={sel.has(d.id)} aria-label={`Include ${d.title}`} onChange={() => setSel((s) => { const n = new Set(s); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} />
            <span>{d.title}<small>{d.doc_date ?? `${String(d.created_at).slice(0, 10)} (upload date)`} · {d.doc_type.replace("_", " ")}</small></span></label>
            <span className="acts"><span className={`badge ${d.metadata_status === "user_confirmed" ? "ok" : ""}`}>{d.metadata_status === "user_confirmed" ? "Confirmed" : "Extracted, unverified"}</span><a className="btn" href={`/api/v1/documents/${d.id}/download`}>Original</a></span></li>))}</ul>)}
      <p><button className="btn primary" disabled={busy || sel.size === 0} onClick={gen}>{busy ? "Working…" : `Generate history summary (${sel.size} selected)`}</button></p>
      {err && <p role="alert">{err}</p>}{sum && <SummaryCard s={sum} />}
    </main>);
}
