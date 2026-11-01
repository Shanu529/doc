import { headers } from "next/headers";
import { resolveShare } from "@/lib/share";
import { allow, clientIp } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
const MSG: Record<string, string> = { pin: "Incorrect PIN.", locked: "Too many attempts. Ask the owner for a new link.", code: "That code is wrong or expired.", rate: "Too many attempts. Wait a few minutes.", sent: "If that address is the intended recipient, a code has been sent." };
export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params; const { e } = await searchParams;
  if (!(await allow(`sv:${clientIp(await headers())}`, 120, 60))) return <main className="narrow"><h1>Too many requests</h1><p>Please wait a minute and try again.</p></main>;
  const s = await resolveShare(token, true);
  if (s.status === "invalid") return <main className="narrow"><h1>Link unavailable</h1><p>This link is invalid, has expired, or was revoked by its owner.</p></main>;
  if (s.status === "email") return (
    <main className="narrow"><h1>Verify your email</h1><p className="muted">The owner shared this with {s.hint}. Enter that address to receive a one-time code.</p>
      <form method="post" action={`/api/v1/share/${token}/email/send`} className="stack"><label>Email address<input name="email" type="email" required autoComplete="email" /></label><button className="btn">Send code</button></form>
      <form method="post" action={`/api/v1/share/${token}/email/verify`} className="stack"><label>6-digit code<input name="code" inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" required /></label><button className="btn primary">Verify</button></form>
      {e && MSG[e] && <p role="alert">{MSG[e]}</p>}</main>);
  if (s.status === "pin") return (
    <main className="narrow"><h1>Enter the PIN</h1><p className="muted">The owner protected this link with a PIN.</p>
      <form method="post" action={`/api/v1/share/${token}/verify`} className="stack"><label>PIN<input name="pin" inputMode="numeric" autoComplete="off" required pattern="\d{4,8}" /></label><button className="btn primary">Unlock</button>{e && MSG[e] && <p role="alert">{MSG[e]}</p>}</form></main>);
  return (
    <main className="narrow"><h1>{s.summary?.title ?? "Shared documents"}</h1>
      {s.summary && <section className="card"><p className="muted">AI-generated from the owner's records and reviewed by the owner before sharing. Informational only, not medical advice. Check against the original documents.</p><div className="pre">{s.summary.body}</div><a className="btn" href={`/api/v1/share/${token}/pdf`}>Download PDF</a></section>}
      <p className="muted">Anything you download can be copied or forwarded.</p>
      {s.docs.length > 0 && <ul className="list">{s.docs.map((d: any) => <li key={d.id}><span>{d.title}<small>{d.doc_type ?? "Document"}</small></span><a className="btn" href={`/api/v1/share/${token}/${d.id}`}>Download</a></li>)}</ul>}</main>);
}
