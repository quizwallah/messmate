import { Suspense } from "react";
import SiteShell from "../components/site-shell";
import LoginForm from "../components/login-form";

export default function LoginPage() {
  return <SiteShell><main className="page-main login-page-main">
    <section className="page-heading"><p className="eyebrow">MESSMATE ACCOUNT</p><h1>Welcome back.</h1><p>Students sign in with a scholar number. First-time setup and password reset use college email verification. Mess administrators and staff can use the <a href="/staff/login">Admin Portal</a>.</p></section>
    <Suspense fallback={<section className="login-card panel"><p>Loading sign-in…</p></section>}><LoginForm /></Suspense>
  </main></SiteShell>;
}
