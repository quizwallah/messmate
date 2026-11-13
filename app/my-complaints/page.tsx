import SiteShell from "../components/site-shell";
import MyComplaintsList from "../components/my-complaints-list";

export default function MyComplaintsPage() {
  return <SiteShell><main className="page-main my-complaints-page"><section className="page-heading"><p className="eyebrow">YOUR REQUESTS</p><h1>My complaints</h1><p>Track your mess feedback and hostel issues, all in one place.</p></section><MyComplaintsList /></main></SiteShell>;
}
