import AnnouncementsList from "../components/announcements-list";

export default function UpdatesPage() {
  return <main className="page-main updates-page-main"><section className="page-heading updates-page-heading"><div><p className="eyebrow"><i className="live-dot"/> OFFICIAL MESS BOARD</p><h1>Updates <em>& notices.</em></h1><p>Announcements from the admin, convenor and warden—plus polls and voice notes to keep everyone in the loop.</p></div><span className="updates-board-mark" aria-hidden="true">↗</span></section><AnnouncementsList /></main>;
}
