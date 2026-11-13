import SiteShell from "../components/site-shell";
import AnnouncementsList from "../components/announcements-list";

export default function UpdatesPage() {
  return <SiteShell><main className="page-main"><section className="page-heading"><p className="eyebrow">MESSMATE BOARD</p><h1>Updates</h1><p>Announcements from the mess admin, convenor and warden.</p></section><AnnouncementsList /></main></SiteShell>;
}
