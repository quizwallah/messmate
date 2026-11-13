"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeScholarNumber, scholarEmail } from "../../lib/auth/scholar";
import { createClient } from "../../lib/supabase/client";

function safeNextPath(value: string | null) {
  if (!value) return "/";
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scholarNumber, setScholarNumber] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [step, setStep] = useState<"password" | "otp">("password");
  const [otpPurpose, setOtpPurpose] = useState<"first-login" | "reset">("first-login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const supabase = createClient();

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeScholarNumber(scholarNumber);
    if (!normalized || !password) {
      setNotice("Enter your valid scholar number and password.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: scholarEmail(normalized),
        password,
      });
      if (error) throw new Error("Scholar number or password is incorrect.");
      const { data: userData } = await supabase.auth.getUser();
      const profile = userData.user
        ? await supabase.from("profiles").select("role, is_active").eq("id", userData.user.id).maybeSingle()
        : { data: null, error: null };
      if (profile.error || profile.data?.role !== "student" || !profile.data.is_active) {
        await supabase.auth.signOut();
        throw new Error("This account does not have student access. Use the staff login page.");
      }
      router.replace(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(purpose: "first-login" | "reset") {
    const normalized = normalizeScholarNumber(scholarNumber);
    if (!normalized) {
      setNotice("Enter your valid scholar number first.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (process.env.NEXT_PUBLIC_MESSMATE_DEMO_LOGIN === "true") {
        setScholarNumber(normalized);
        setOtpPurpose(purpose);
        setStep("otp");
        setNotice("Demo mode: enter the temporary test code shared by the site owner. No email will be sent.");
        return;
      }

      const prepared = await fetch("/api/auth/prepare-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarNumber: normalized }),
      });
      const result = await prepared.json();
      if (!prepared.ok) throw new Error(result.error);

      const { error } = await supabase.auth.signInWithOtp({
        email: scholarEmail(normalized),
        options: { shouldCreateUser: false },
      });
      if (error) throw error;

      setScholarNumber(normalized);
      setOtpPurpose(purpose);
      setStep("otp");
      setNotice(`A one-time code was sent to ${scholarEmail(normalized)}. Check your inbox and spam folder.`);
    } catch {
      setNotice("We could not send a code. Check your scholar number or contact the mess convenor.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setNotice("Enter the six-digit code from your college email.");
      return;
    }
    if (newPassword.length < 8) {
      setNotice("Choose a password with at least eight characters.");
      return;
    }
    if (otpPurpose === "first-login" && fullName.trim().length < 2) {
      setNotice("Enter your name as it should appear in the mess portal.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (process.env.NEXT_PUBLIC_MESSMATE_DEMO_LOGIN === "true") {
        const response = await fetch("/api/auth/demo-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scholarNumber, code }),
        });
        const result = await response.json();
        if (!response.ok || !result.temporaryPassword) {
          throw new Error(result.error || "The test code is incorrect or this account is not enabled for testing.");
        }
        const email = scholarEmail(scholarNumber);
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: result.temporaryPassword });
        if (signInError) throw signInError;
        if (otpPurpose === "first-login") {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) throw new Error("The demo account could not be loaded.");
          const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", userData.user.id);
          if (profileError) throw profileError;
          await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
        }
        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) throw passwordError;

        router.replace(safeNextPath(searchParams.get("next")));
        router.refresh();
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: scholarEmail(scholarNumber),
        token: code,
        type: "email",
      });
      if (verifyError) throw verifyError;

      if (otpPurpose === "first-login") {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("The student account could not be loaded.");
        const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", userData.user.id);
        if (profileError) throw profileError;
        await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
      }

      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) throw passwordError;

      router.replace(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setNotice("The code may be incorrect or expired. Request a new code and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-card panel">
    <p className="eyebrow">STUDENT ACCESS</p>
    <h2>{step === "password" ? "Sign in to MessMate" : otpPurpose === "reset" ? "Reset your password" : process.env.NEXT_PUBLIC_MESSMATE_DEMO_LOGIN === "true" ? "Enter the test code" : "Verify your college email"}</h2>
    <p className="login-copy">Use your scholar number as your username. Your college email is your scholar number followed by <strong>@stu.manit.ac.in</strong>.{process.env.NEXT_PUBLIC_MESSMATE_DEMO_LOGIN === "true" && <><br/><strong>Temporary testing is enabled:</strong> the test code is not emailed.</>}</p>

    {step === "password" ? <form className="login-form" onSubmit={signIn}>
      <label>Scholar number<input autoComplete="username" value={scholarNumber} onChange={(event) => setScholarNumber(event.target.value)} placeholder="Enter your scholar number" required/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required/></label>
      <button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span>→</span></button>
      <div className="login-secondary-actions"><button type="button" onClick={() => requestCode("first-login")} disabled={busy}>{process.env.NEXT_PUBLIC_MESSMATE_DEMO_LOGIN === "true" ? "First time? Use test code" : "First time? Verify your email"}</button><button type="button" onClick={() => requestCode("reset")} disabled={busy}>Forgot password?</button></div>
    </form> : <form className="login-form" onSubmit={verifyAndSetPassword}>
      <label>Six-digit {process.env.NEXT_PUBLIC_MESSMATE_DEMO_LOGIN === "true" ? "test" : "email"} code<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="Enter the code" required/></label>
      {otpPurpose === "first-login" && <label>Full name<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Enter your name" required/></label>}
      <label>New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least eight characters" required/></label>
      <button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify code and set password"}<span>→</span></button>
      <div className="login-secondary-actions"><button type="button" onClick={() => requestCode(otpPurpose)} disabled={busy}>Send a new code</button><button type="button" onClick={() => { setStep("password"); setNotice(""); }} disabled={busy}>Back to sign in</button></div>
    </form>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </section>;
}
