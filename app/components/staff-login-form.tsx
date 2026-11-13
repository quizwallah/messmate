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
      setNotice("Enter your staff username and password.");
      return;
    }
    setBusy(true);
    setNotice("");
    const supabase = createClient();
    try {
      const email = normalized.includes("@") ? normalized : scholarEmail(normalized);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Staff username or password is incorrect.");
      const { data: userData } = await supabase.auth.getUser();
      const profile = userData.user
        ? await supabase.from("profiles").select("role, is_active").eq("id", userData.user.id).maybeSingle()
        : { data: null, error: null };
      if (profile.error || !profile.data?.is_active || !["admin", "convenor", "warden", "committee"].includes(profile.data.role)) {
        await supabase.auth.signOut();
        throw new Error("This account does not have active staff access.");
      }
      window.location.replace("/portal");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Staff sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-card panel"><p className="eyebrow">RESTRICTED STAFF ACCESS</p><h2>Staff sign in</h2><p className="login-copy">Admin signs in with the email assigned during setup. Convenor and warden roles can be assigned to onboarded scholar accounts by the admin.</p><form className="login-form" onSubmit={signIn}><label>Admin email or staff scholar number<input autoComplete="username" value={scholarNumber} onChange={(event) => setScholarNumber(event.target.value)} placeholder="Enter admin email or scholar number" required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required/></label><button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Open staff portal"}<span>→</span></button></form>{notice && <p className="inline-notice" role="status">{notice}</p>}</section>;
}
