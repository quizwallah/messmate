import SiteShell from "../components/site-shell";
import AvailabilityForm from "../components/availability-form";

export default function AvailabilityPage() {
  return <SiteShell><main className="page-main">
    <section className="page-heading"><p className="eyebrow">MESS AVAILABILITY</p><h1>Going on a break?</h1><p>Tell the mess when you’ll be away so meal planning can account for it.</p></section>
    <div className="availability-layout"><AvailabilityForm /><aside className="break-note panel"><span className="plane-icon">✈</span><h2>Plan ahead, waste less.</h2><p>Adding a date range helps the mess estimate how many students are likely to eat during a break.</p><div className="reason-chips">{reasonsForDisplay.map((reason) => <span key={reason}>{reason}</span>)}</div></aside></div>
  </main></SiteShell>;
}

const reasonsForDisplay = ["Semester break", "Festival", "Going home", "Personal reason", "Other"];
