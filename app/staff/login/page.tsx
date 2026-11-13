import SiteShell from "../../components/site-shell";
import StaffLoginForm from "../../components/staff-login-form";

export default function StaffLoginPage() {
  return <SiteShell><main className="page-main login-page-main"><section className="page-heading"><p className="eyebrow">MESSMATE PORTAL</p><h1>Staff access</h1><p>Sign in with an administrator-assigned staff account.</p></section><StaffLoginForm /></main></SiteShell>;
}
