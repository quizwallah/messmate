import SiteShell from "../components/site-shell";
import OtherComplaintForm from "../components/other-complaint-form";

export default function OtherComplaintsPage() {
  return <SiteShell><main className="page-main"><section className="page-heading"><p className="eyebrow">OTHER COMPLAINTS</p><h1>Hostel room & floor issues</h1><p>Report maintenance or sanitation concerns with the location and a short description.</p></section><div className="feedback-page-layout"><OtherComplaintForm /></div></main></SiteShell>;
}
