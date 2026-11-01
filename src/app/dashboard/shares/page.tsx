"use client";
import { useEffect, useState } from "react";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "never");
export default function Shares() {
  const [shares, setShares] = useState<any[] | null>(null); const [err, setErr] = useState("");
  const load = async () => { const r = await fetch("/api/v1/shares"); const j = await r.json(); r.ok ? setShares(j.shares) : setErr(j.error); };
  useEffect(() => { load(); }, []);
  async function revoke(id: string) { if (!confirm("Revoke this link now?")) return; await fetch(`/api/v1/shares/${id}`, { method: "DELETE" }); load(); }
  return (
    <main className="wide"><header className="bar"><h1>Share history</h1><a href="/dashboard">Back to documents</a></header>
      <p className="muted">Every link you have created. Access events record the time only, not the visitor's address. Links cannot be re-displayed because only a hash is stored.</p>
      {err && <p role="alert">{err}</p>}
      {shares && shares.length === 0 && <p className="empty">You haven't shared anything yet.</p>}
      {shares?.map((s) => (
        <section key={s.id} className="card"><div className="bar"><strong>{s.summary ? `${s.summary.title} (summary)` : `${s.documents.length} document${s.documents.length === 1 ? "" : "s"}`}</strong>
          <span className={`badge ${s.status === "active" ? "ok" : ""}`}>{s.status}</span></div>
          {s.documents.length > 0 && <small>{s.documents.join(", ")}</small>}
          <small>Created {fmt(s.createdAt)} · Expires {fmt(s.expiresAt)}{s.revokedAt ? ` · Revoked ${fmt(s.revokedAt)}` : ""}</small>
          <small>Recipient: {s.recipientEmail ?? "anyone with the link"} · {s.pinProtected ? "PIN protected" : "no PIN"} · Opened {s.accessCount} time{s.accessCount === 1 ? "" : "s"}, last {fmt(s.lastAccess)}</small>
          {s.events.length > 0 && <details><summary>Access history</summary><ul>{s.events.map((e: any, i: number) => <li key={i}>{fmt(e.at)}: {e.event.replace("share.", "").replace(/_/g, " ")}</li>)}</ul></details>}
          {s.status === "active" && <button className="btn" onClick={() => revoke(s.id)}>Revoke</button>}</section>))}
    </main>);
}
