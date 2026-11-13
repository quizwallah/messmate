import Link from "next/link";
import StaffLoginForm from "../../components/staff-login-form";
import ThemeToggle from "../../components/theme-toggle";

export default function StaffLoginPage() {
  return <main className="admin-login-page">
    <header className="admin-login-topbar">
      <Link className="brand" href="/"><span className="brand-mark">M</span><span>mess<span className="brand-light">mate</span></span></Link>
      <div><span className="admin-secure-label"><i/> SECURE ADMIN PORTAL</span><ThemeToggle /></div>
    </header>
    <section className="admin-login-layout">
      <div className="admin-login-intro">
        <p className="eyebrow"><i className="live-dot"/> MESSMATE MANAGEMENT</p>
        <h1>Welcome to your<br/><em>control centre.</em></h1>
        <p className="admin-login-lede">A clear view of mess operations, student feedback and announcements—all in one place.</p>
        <div className="admin-login-highlights">
          <div><span>01</span><p><strong>Stay informed</strong><small>Review feedback, complaints and meal activity.</small></p></div>
          <div><span>02</span><p><strong>Keep students updated</strong><small>Publish notices, share media and create polls.</small></p></div>
          <div><span>03</span><p><strong>Manage access</strong><small>Admin, convenor and warden tools by assigned role.</small></p></div>
        </div>
        <p className="admin-login-support">Authorized mess personnel only</p>
      </div>
      <div className="admin-login-form-wrap">
        <div className="admin-login-form-heading"><span className="admin-login-icon">▣</span><p className="eyebrow">PORTAL ACCESS</p><h2>Sign in to manage</h2><p>Use your administrator email or staff scholar number.</p></div>
        <StaffLoginForm />
        <p className="admin-login-student-link">Looking for the student portal? <Link href="/login">Student sign in <span>→</span></Link></p>
      </div>
    </section>
    <footer className="admin-login-footer"><span>MessMate · Hostel Mess Management</span><Link href="/">← Back to today’s menu</Link></footer>
  </main>;
}
