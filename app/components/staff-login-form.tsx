"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { normalizeScholarNumber, scholarEmail } from "../../lib/auth/scholar";
import { createClient } from "../../lib/supabase/client";

export default function StaffLoginForm() {
  const [scholarNumber, setScholarNumber] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const suppliedIdentifier = scholarNumber.trim();
    const normalized = suppliedIdentifier.includes("@") ? suppliedIdentifier.toLowerCase() : normalizeScholarNumber(suppliedIdentifier);
    if (!normalized || !password) {
      setNotice("Enter your admin email or staff scholar number and password.");
      return;
    }
    setBusy(true);
    setNotice("");
    const supabase = createClient();
    try {
      const email = normalized.includes("@") ? normalized : scholarEmail(normalized);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Admin email or staff scholar number, or password, is incorrect.");
      const { data: userData } = await supabase.auth.getUser();
      const profile = userData.user
        ? await supabase.from("profiles").select("role, is_active").eq("id", userData.user.id).maybeSingle()
        : { data: null, error: null };
      if (profile.error || !profile.data?.is_active || !["admin", "convenor", "warden", "committee"].includes(profile.data.role)) {
        await supabase.auth.signOut();
        throw new Error("This account does not have active admin or staff access.");
      }
      window.location.replace("/portal");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Admin portal sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-login-form-card"><form className="login-form" onSubmit={signIn}>
    <label>Admin email or staff scholar number<input autoComplete="username" value={scholarNumber} onChange={(event) => setScholarNumber(event.target.value)} placeholder="Enter your email or scholar number" required/></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required/></label>
    <button className="button button-primary full-button admin-login-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue to admin portal"}<span>→</span></button>
  </form>{notice && <p className="inline-notice" role="status">{notice}</p>}<div className="admin-login-card-foot"><span aria-hidden="true">⌑</span><p>Your assigned role controls which management tools you can access.</p></div></section>;
}
