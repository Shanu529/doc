"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
export default function Reset() {
  const [recovering, setRecovering] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => { const { data } = supabaseBrowser().auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") setRecovering(true); }); return () => data.subscription.unsubscribe(); }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const v = String(new FormData(e.currentTarget).get("v")); const sb = supabaseBrowser();
    const { error } = recovering ? await sb.auth.updateUser({ password: v }) : await sb.auth.resetPasswordForEmail(v, { redirectTo: `${location.origin}/reset` });
    setMsg(error ? error.message : recovering ? "Password updated. You can now sign in." : "If that email has an account, a reset link is on its way.");
  }
  return <main className="narrow"><h1>{recovering ? "Choose a new password" : "Reset your password"}</h1>
    <form onSubmit={submit} className="stack"><label>{recovering ? "New password (10+ characters)" : "Email"}<input name="v" type={recovering ? "password" : "email"} minLength={recovering ? 10 : undefined} required /></label>
      <button className="btn primary">{recovering ? "Update password" : "Send reset link"}</button><p role="status" className="muted">{msg}</p></form></main>;
}
