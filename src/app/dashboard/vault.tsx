"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AiPanel from "./ai-panel";
type Doc = { doc_date?: string | null; id: string; title: string; doc_type: string | null; tags: string[]; notes: string | null; folder_id: string | null; mime_type: string; size_bytes: number; processing_status: string; processing_error: string | null; partial?: boolean; processing_note?: string | null; metadata_status: string };
type Folder = { id: string; name: string };
const api = async (url: string, method = "GET", body?: unknown) => { const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); return { ok: r.ok, j: await r.json().catch(() => ({})) }; };

export default function Vault({ folders: f0, email }: { folders: Folder[]; email: string }) {
  const [folders, setFolders] = useState(f0); const [docs, setDocs] = useState<Doc[]>([]);
  const [view, setView] = useState("active"); const [folder, setFolder] = useState(""); const [type, setType] = useState(""); const [status, setStatus] = useState(""); const [sort, setSort] = useState("newest");
  const [q, setQ] = useState(""); const [hits, setHits] = useState<any[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Doc | null>(null); const [share, setShare] = useState<any>(null); const [hours, setHours] = useState(24); const [pin, setPin] = useState(""); const [rcpt, setRcpt] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string; title: string } | null>(null);
  async function openPreview(id: string) { const { ok, j } = await api(`/api/v1/documents/${id}/preview`); if (ok) setPreview(j); else setMsg(j.error); }

  const load = useCallback(async () => {
    const p = new URLSearchParams({ view, sort }); if (folder) p.set("folder", folder); if (type) p.set("type", type); if (status) p.set("status", status);
    const { ok, j } = await api(`/api/v1/documents?${p}`); if (ok) setDocs(j.documents); else setMsg(j.error);
  }, [view, folder, type, status, sort]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (q.trim().length < 2) { setHits(null); return; } const t = setTimeout(async () => { const { ok, j } = await api(`/api/v1/search?q=${encodeURIComponent(q)}`); setHits(ok ? j.results : []); }, 300); return () => clearTimeout(t); }, [q]);

  // Uploads go one file at a time so each can show progress and be retried on failure.
  function sendOne(file: File) {
    return new Promise<string | null>((res) => {
      const x = new XMLHttpRequest(); const fd = new FormData(); fd.append("files", file);
      x.upload.onprogress = (e) => e.lengthComputable && setMsg(`Uploading ${file.name}… ${Math.round((e.loaded / e.total) * 100)}%`);
      x.onload = () => { try { const r = JSON.parse(x.responseText).results?.[0]; res(x.status < 300 && !r?.error ? null : r?.error ?? "Upload failed."); } catch { res("Upload failed."); } };
      x.onerror = () => res("Network error."); x.open("POST", "/api/v1/documents"); x.send(fd);
    });
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return; setBusy(true); const failed: string[] = [];
    for (const file of Array.from(files)) { let err = await sendOne(file); if (err === "Network error.") err = await sendOne(file); if (err) failed.push(`${file.name}: ${err}`); }
    setBusy(false); setMsg(failed.length ? `Some files failed. ${failed.join(" ")} Choose them again to retry.` : "Upload complete. Text extraction runs in the background."); load();
  }
  async function act(id: string, body: object) { const { ok, j } = await api(`/api/v1/documents/${id}`, "PATCH", body); setMsg(ok ? "Saved." : j.error); load(); }
  async function purge(id: string) { if (!confirm("Delete this document and its file permanently?")) return; const { ok, j } = await api(`/api/v1/documents/${id}`, "DELETE"); setMsg(ok ? "Deleted permanently." : j.error); load(); }
  async function retry(id: string) { setMsg("Processing…"); const { ok, j } = await api(`/api/v1/documents/${id}/process`, "POST"); setMsg(ok ? "Processing finished." : j.error); load(); }
  async function addFolder() { const name = prompt("Folder name"); if (!name) return; const { ok, j } = await api("/api/v1/folders", "POST", { name }); if (ok) setFolders([...folders, j.folder]); else setMsg(j.error); }
  async function renameFolder() { const cur = folders.find((x) => x.id === folder); const name = cur && prompt("New name", cur.name); if (!cur || !name) return; await api(`/api/v1/folders/${cur.id}`, "PATCH", { name }); setFolders(folders.map((x) => (x.id === cur.id ? { ...x, name } : x))); }
  async function delFolder() { if (!folder || !confirm("Delete this folder? Its documents stay in your vault.")) return; await api(`/api/v1/folders/${folder}`, "DELETE"); setFolders(folders.filter((x) => x.id !== folder)); setFolder(""); }
  async function createShare() { const { ok, j } = await api("/api/v1/shares", "POST", { documentIds: [...sel], expiresInHours: hours, ...(pin ? { pin } : {}), ...(rcpt ? { recipientEmail: rcpt } : {}) }); if (ok) { setShare(j); setPin(""); } else setMsg(j.error); }
  async function saveEdit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (!edit) return; const f = new FormData(e.currentTarget);
    await act(edit.id, { title: f.get("title"), doc_type: String(f.get("doc_type") || "") || null, notes: String(f.get("notes") || "") || null, doc_date: String(f.get("doc_date") || "") || null, folder_id: String(f.get("folder_id") || "") || null, tags: String(f.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean), ...(f.get("confirm") ? { confirm_metadata: true } : {}) }); setEdit(null); }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const shown = hits ? hits.map((h) => ({ ...h, search: true })) : docs;

  return (
    <main className="wide">
      <header className="bar"><h1>Your documents</h1><span className="muted">{email} · <a href="/dashboard/shares">Share history</a> · <a href="/dashboard/timeline">Medical timeline</a> · <a href="/dashboard/settings">Settings</a></span></header>
      <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
        <p>Drop PDFs or images here, or</p><button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Choose files"}</button>
        <input ref={input} type="file" hidden multiple accept="application/pdf,image/png,image/jpeg" onChange={(e) => upload(e.target.files)} /></div>
      <p role="status" className="muted">{msg}</p>
      <AiPanel selected={[...sel]} onPreview={openPreview} />
      <div className="filters">
        <input type="search" aria-label="Search documents" placeholder="Search text, titles and types" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="View" value={view} onChange={(e) => setView(e.target.value)}><option value="active">Documents</option><option value="archived">Archive</option><option value="trash">Trash</option></select>
        <select aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">All folders</option><option value="none">No folder</option>{folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">Any type</option>{["lab_report", "prescription", "discharge_summary", "insurance", "passport", "certificate", "invoice", "contract", "other"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{["pending", "processing", "done", "failed"].map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option></select>
        <button className="btn" onClick={addFolder}>New folder</button>{folder && folder !== "none" && <><button className="btn" onClick={renameFolder}>Rename folder</button><button className="btn" onClick={delFolder}>Delete folder</button></>}
      </div>
      {shown.length === 0 ? <p className="empty">{hits ? "No matches. Search covers documents whose text has been extracted." : view === "trash" ? "Trash is empty." : "No documents here yet. Upload a passport, certificate or lab report to get started."}</p> : (
        <ul className="list">{shown.map((d: any) => (
          <li key={d.id}>
            <label className="row"><input type="checkbox" aria-label={`Select ${d.title}`} checked={sel.has(d.id)} onChange={() => toggle(d.id)} />
              <span>{d.title}<small>{d.doc_type?.replace("_", " ") ?? "Uncategorised"}{d.metadata_status === "user_confirmed" ? " (confirmed)" : d.doc_type && !d.search ? " (unverified)" : ""}{d.processing_status ? ` · ${d.processing_status}` : ""}{d.tags?.length ? ` · ${d.tags.join(", ")}` : ""}</small>
                {d.snippet && <small dangerouslySetInnerHTML={{ __html: String(d.snippet).replace(/<(?!\/?b>)[^>]*>/g, "") }} />}{d.processing_error && <small role="alert">{d.processing_error}</small>}{d.partial && <small role="alert">Partially processed: {d.processing_note}</small>}</span></label>
            <span className="acts">
              {view === "trash" ? <><button className="btn" onClick={() => act(d.id, { trashed: false })}>Restore</button><button className="btn" onClick={() => purge(d.id)}>Delete forever</button></> : <>
                <button className="btn" onClick={() => openPreview(d.id)}>Preview</button><a className="btn" href={`/api/v1/documents/${d.id}/download`}>Download</a><button className="btn" onClick={() => setEdit(d)}>Edit</button>
                {d.processing_status === "failed" && <button className="btn" onClick={() => retry(d.id)}>Retry</button>}
                <button className="btn" onClick={() => act(d.id, { archived: view !== "archived" })}>{view === "archived" ? "Unarchive" : "Archive"}</button><button className="btn" onClick={() => act(d.id, { trashed: true })}>Trash</button></>}
            </span></li>))}</ul>)}
      {sel.size > 0 && view !== "trash" && (
        <div className="sharebar"><span>{sel.size} selected</span>
          <label>Expires in <select value={hours} onChange={(e) => setHours(+e.target.value)}><option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label>
          <label>PIN (optional)<input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="4–8 digits" /></label>
          <label>Recipient email (optional)<input type="email" value={rcpt} onChange={(e) => setRcpt(e.target.value)} placeholder="requires code by email" /></label><button className="btn primary" onClick={createShare}>Create share link</button></div>)}
      {edit && <dialog open className="dialog"><form onSubmit={saveEdit} className="stack" style={{ width: "100%" }}><h2>Edit document</h2>
        <label>Title<input name="title" defaultValue={edit.title} required /></label><label>Type<input name="doc_type" defaultValue={edit.doc_type ?? ""} /></label><label>Document date<input name="doc_date" type="date" defaultValue={edit.doc_date ?? ""} /></label>
        <label>Folder<select name="folder_id" defaultValue={edit.folder_id ?? ""}><option value="">No folder</option>{folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Tags (comma separated)<input name="tags" defaultValue={edit.tags.join(", ")} /></label><label>Notes<input name="notes" defaultValue={edit.notes ?? ""} /></label>
        <label className="row"><input type="checkbox" name="confirm" /> I have checked the extracted type and it is correct</label>
        <span className="acts"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button></span></form></dialog>}
      {share && <dialog open className="dialog"><h2>Share link ready</h2><img src={share.qr} alt="QR code for the share link" width={200} height={200} /><input readOnly value={share.url} onFocus={(e) => e.target.select()} />
        <p className="muted">Copy this link now; it is not shown again. Anyone with it can view and download the selected files until it expires or you revoke it.</p>
        <span className="acts"><button className="btn" onClick={async () => { await api(`/api/v1/shares/${share.id}`, "DELETE"); setShare(null); setMsg("Link revoked."); }}>Revoke now</button><button className="btn" onClick={() => setShare(null)}>Close</button></span></dialog>}
      {preview && <dialog open className="dialog big"><h2>{preview.title}</h2>{preview.mime === "application/pdf" ? <iframe src={preview.url} title={preview.title} /> : <img src={preview.url} alt={preview.title} />}<button className="btn" onClick={() => setPreview(null)}>Close</button></dialog>}
    </main>
  );
}
