"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [scholarNumber, setScholarNumber] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [requestPhase, setRequestPhase] = useState<"idle" | "preparing" | "sending">("idle");
  const [step, setStep] = useState<"password" | "scholar" | "otp">("password");
  const [otpPurpose, setOtpPurpose] = useState<"first-login" | "reset">("first-login");
  const [demoCodeMode, setDemoCodeMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

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
      // This single server-side RPC also validates the active student role and verified college email.
      const { error: recordError } = await supabase.rpc("record_student_login");
      if (recordError) {
        await supabase.auth.signOut();
        throw new Error("Could not verify this active student account. Contact the mess administrator.");
      }
      window.location.replace(safeNextPath(searchParams.get("next")));
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
    if (resendSeconds > 0) {
      setNotice(`Please wait ${resendSeconds} seconds before requesting another email code.`);
      return;
    }
    setBusy(true);
    setRequestPhase("preparing");
    setNotice("");
    try {
      const prepared = await fetch("/api/auth/prepare-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarNumber: normalized }),
      });
      const result = await prepared.json();
      if (!prepared.ok || result.ready !== true) {
        throw new Error("We could not prepare email verification. Check the scholar number or contact the mess convenor.");
      }

      if (result.demoMode === true) {
        setDemoCodeMode(true);
        setScholarNumber(normalized);
        setOtpPurpose(purpose);
        setCode("");
        setStep("otp");
        setNotice("Demo mode: enter the temporary test code shared by the site owner. No email will be sent.");
        return;
      }

      setRequestPhase("sending");
      const { error } = await supabase.auth.signInWithOtp({
        email: scholarEmail(normalized),
        options: { shouldCreateUser: false },
      });
      if (error) throw error;

      setScholarNumber(normalized);
      setOtpPurpose(purpose);
      setDemoCodeMode(false);
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setResendSeconds(60);
      setStep("otp");
      setNotice(`A one-time code was sent to ${scholarEmail(normalized)}. Check your inbox and spam folder.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not send a code. Please try again or contact the mess convenor.");
    } finally {
      setBusy(false);
      setRequestPhase("idle");
    }
  }

  async function verifyAndSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(demoCodeMode ? /^\d{6}$/.test(code) : /^\d{6,8}$/.test(code))) {
      setNotice(demoCodeMode ? "Enter the six-digit test code." : "Enter the 6–8 digit code from your college email.");
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setNotice("Choose a password with at least eight characters, including a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice("The passwords do not match.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (demoCodeMode) {
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
        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) throw passwordError;
        const { error: recordError } = await supabase.rpc("record_student_login");
        if (recordError) throw new Error("Could not save the verified student account. Apply the latest roster migration and retry.");

        window.location.replace(safeNextPath(searchParams.get("next")));
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: scholarEmail(scholarNumber),
        token: code,
        type: "email",
      });
      if (verifyError) throw verifyError;

      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) throw passwordError;
      const { error: recordError } = await supabase.rpc("record_student_login");
      if (recordError) throw new Error("Could not save the verified student account. Apply the latest roster migration and retry.");

      window.location.replace(safeNextPath(searchParams.get("next")));
    } catch {
      setNotice("The code may be incorrect or expired. Request a new code and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-card panel">
    <p className="eyebrow">STUDENT ACCESS</p>
    <h2>{step === "password" ? "Sign in to MessMate" : step === "scholar" ? otpPurpose === "reset" ? "Reset your password" : "Set up your account" : otpPurpose === "reset" ? "Reset your password" : demoCodeMode ? "Enter the test code" : "Verify your college email"}</h2>
    <p className="login-copy">{step === "password" ? <>Only students on the approved roster can sign in. Your username is your scholar number; your college email is <strong>scholar number + @stu.manit.ac.in</strong>.</> : step === "scholar" ? <>Enter your scholar number. We’ll send a one-time code to your approved college email ending in <strong>@stu.manit.ac.in</strong>.</> : <>Only students on the approved roster can continue. Your name and branch come from the approved student list.{demoCodeMode && <><br/><strong>Temporary testing is enabled:</strong> the test code is not emailed.</>}</>}</p>

    {step === "password" ? <><div className="login-first-time-callout"><div><strong>New to MessMate?</strong><span>Verify your college email and create a password.</span></div><button type="button" onClick={() => { setOtpPurpose("first-login"); setScholarNumber(""); setPassword(""); setNotice(""); setResendSeconds(0); setStep("scholar"); }} disabled={busy}>First time? Verify your email <span>→</span></button></div><p className="login-divider">Already set up? Sign in below.</p><form className="login-form" onSubmit={signIn}>
      <label>Scholar number<input autoComplete="username" value={scholarNumber} onChange={(event) => setScholarNumber(event.target.value)} placeholder="Enter your scholar number" required/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required/></label>
      <button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span>→</span></button>
      <div className="login-secondary-actions"><button type="button" onClick={() => { setOtpPurpose("reset"); setScholarNumber(""); setNotice(""); setResendSeconds(0); setStep("scholar"); }} disabled={busy}>Forgot password?</button></div>
    </form></> : step === "scholar" ? <form className="login-form" onSubmit={(event) => { event.preventDefault(); void requestCode(otpPurpose); }}>
      <label>Scholar number<input autoComplete="username" value={scholarNumber} onChange={(event) => setScholarNumber(event.target.value)} placeholder="Enter your scholar number" required/></label>
      <button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? requestPhase === "sending" ? "Sending code…" : "Preparing account…" : "Send verification code"}<span>→</span></button>
      <div className="login-secondary-actions"><button type="button" onClick={() => { setStep("password"); setNotice(""); }} disabled={busy}>Back to sign in</button></div>
    </form> : <form className="login-form" onSubmit={verifyAndSetPassword}>
      <label>{demoCodeMode ? "Six-digit test code" : "Email verification code"}<input autoComplete="one-time-code" inputMode="numeric" maxLength={demoCodeMode ? 6 : 8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder={demoCodeMode ? "Enter the 6-digit code" : "Enter the code from your email"} required/></label>
      <label>New password<input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" title="At least eight characters, including a letter and a number" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="8+ characters, with a letter and number" required/></label>
      <label>Confirm password<input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" required/></label>
      <label className="password-visibility"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)}/>Show passwords</label>
      <button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify code and set password"}<span>→</span></button>
      <div className="login-secondary-actions"><button type="button" onClick={() => requestCode(otpPurpose)} disabled={busy || (!demoCodeMode && resendSeconds > 0)}>{demoCodeMode ? "Send a new test code" : resendSeconds > 0 ? `Resend email code in 00:${String(resendSeconds).padStart(2, "0")}` : "Send a new code"}</button><button type="button" onClick={() => { setStep("password"); setNotice(""); setResendSeconds(0); setDemoCodeMode(false); }} disabled={busy}>Back to sign in</button></div>
    </form>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </section>;
}
