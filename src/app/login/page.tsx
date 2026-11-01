"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget); const email = String(f.get("email")); const password = String(f.get("password"));
    const sb = supabaseBrowser();
    if (mode === "up") {
      const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/dashboard` } });
      setMsg(error ? error.message : "Check your email to verify your account, then sign in.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message); else location.href = "/dashboard";
    }
  }
  return (
    <main className="narrow">
      <h1>{mode === "in" ? "Sign in to your vault" : "Create your vault"}</h1>
      <form onSubmit={submit} className="stack">
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={10} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        <button className="btn primary">{mode === "in" ? "Sign in" : "Create account"}</button>
        <p role="status" className="muted">{msg}</p>
      </form>
      <button className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}</button>
    </main>
  );
}
