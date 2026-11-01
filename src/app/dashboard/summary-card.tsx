"use client";
import { useState } from "react";
export type Summary = { id: string; title: string; body: string; kind: string };
export default function SummaryCard({ s }: { s: Summary }) {
  const [ok, setOk] = useState(false); const [hours, setHours] = useState(24); const [pin, setPin] = useState(""); const [email, setEmail] = useState(""); const [share, setShare] = useState<any>(null); const [err, setErr] = useState("");
  async function go() {
    const r = await fetch("/api/v1/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summaryId: s.id, confirmSummary: true, expiresInHours: hours, ...(pin ? { pin } : {}), ...(email ? { recipientEmail: email } : {}) }) });
    const j = await r.json(); if (r.ok) setShare(j); else setErr(j.error);
  }
  return (
    <section className="card"><h3>{s.title}</h3>
      <p className="muted">AI-generated from your documents. Check it against the originals. Informational only, not medical advice.</p>
      <div className="pre">{s.body}</div>
      <span className="acts"><a className="btn" href={`/api/v1/summaries/${s.id}/pdf`}>Download PDF</a></span>
      <label className="row"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I reviewed this summary and want to share it, including the titles and dates of the documents it was built from.</label>
      {ok && <span className="acts"><select aria-label="Expiry" value={hours} onChange={(e) => setHours(+e.target.value)}><option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option></select>
        <input aria-label="Optional PIN" placeholder="PIN (optional)" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} /><input aria-label="Recipient email (optional)" type="email" placeholder="Recipient email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn primary" onClick={go}>Create share link</button></span>}
      <p role="alert">{err}</p>
      {share && <div className="stack"><img src={share.qr} alt="QR code for the share link" width={180} height={180} /><input readOnly value={share.url} onFocus={(e) => e.target.select()} /><p className="muted">Copy this link now; it is not shown again.</p>
        <button className="btn" onClick={async () => { await fetch(`/api/v1/shares/${share.id}`, { method: "DELETE" }); setShare(null); }}>Revoke now</button></div>}
    </section>);
}
