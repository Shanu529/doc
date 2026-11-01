"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
export default function Settings() {
  const [msg, setMsg] = useState("");
  async function del(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!confirm("Delete your account and every document permanently?")) return;
    const r = await fetch("/api/v1/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) });
    const j = await r.json(); if (r.ok) { await supabaseBrowser().auth.signOut(); location.href = "/"; } else setMsg(j.error);
  }
  return <main className="narrow"><h1>Account settings</h1>
    <p><a className="btn" href="/api/v1/account/export">Export my data (JSON)</a></p><p className="muted">Exports metadata, extracted text and activity. Original files are downloaded from the dashboard.</p>
    <p><button className="btn" onClick={async () => { await supabaseBrowser().auth.signOut(); location.href = "/login"; }}>Sign out</button></p>
    <h2>Delete account</h2><form onSubmit={del} className="stack"><label>Confirm with your password<input name="password" type="password" required /></label><button className="btn">Delete account permanently</button><p role="alert">{msg}</p></form>
    <p><a href="/dashboard">Back to documents</a></p></main>;
}
