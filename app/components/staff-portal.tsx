"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";

type Row = { id: string; created_at?: string; student_id?: string; status?: string; full_name?: string | null; scholar_number?: string; is_active?: boolean; role?: string; subject?: string; category?: string; details?: string; rating?: number; comment?: string | null; block?: string; floor?: string; room_number?: string; meal_label?: string | null; starts_on?: string; ends_on?: string; reason?: string; title?: string; body?: string; posted_by_name?: string | null; posted_by_role?: string | null; related_meal_label?: string | null; [key: string]: any };
type PortalTab = "overview" | "mess" | "floor" | "feedback" | "absences" | "tokens" | "updates" | "students";
type DateRange = "all" | "today" | "tomorrow" | "yesterday" | "last5" | "last10" | "last30" | "date";
type Scholar = { scholar_number: string; display_name: string | null; is_active: boolean; linked_auth_user_id: string | null; created_at: string };

const tabs: { id: PortalTab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "mess", label: "Mess complaints" },
  { id: "floor", label: "Floor complaints" }, { id: "feedback", label: "Food feedback" },
  { id: "absences", label: "Break plans" }, { id: "tokens", label: "Meal tokens" }, { id: "updates", label: "Updates" }, { id: "students", label: "Students" },
];
const dateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const localDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : dateKey(new Date(iso));
const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const roleLabel = (role?: string | null) => ({ admin: "Admin", convenor: "Convenor", warden: "Warden", committee: "Committee", student: "Student" }[role ?? ""] ?? "Staff");

export default function StaffPortal() {
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [tab, setTab] = useState<PortalTab>("overview");
  const [range, setRange] = useState<DateRange>("last10");
  const [specificDate, setSpecificDate] = useState(dateKey(new Date()));
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState({ profiles: [] as Row[], mess: [] as Row[], floor: [] as Row[], feedback: [] as Row[], absences: [] as Row[], tokens: [] as Row[], announcements: [] as Row[] });
  const [scholars, setScholars] = useState<Scholar[]>([]);
  const [notice, setNotice] = useState("Loading staff data…");
  const [busyId, setBusyId] = useState("");
  const [publishNotice, setPublishNotice] = useState("");
  const [editingUpdateId, setEditingUpdateId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [updateBusyId, setUpdateBusyId] = useState("");
  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setNotice("Please sign in with a staff account."); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role, full_name, is_active").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.is_active || !["admin", "convenor", "warden", "committee"].includes(profile.role)) { setNotice("This account does not have staff access."); return; }
    setRole(profile.role);
    setName(profile.full_name || "Staff member");
    const [profiles, mess, floor, feedback, absences, tokens, announcements] = await Promise.all([
      supabase.from("profiles").select("id, scholar_number, full_name, role, is_active, created_at").order("scholar_number"),
      supabase.from("serious_complaints").select("id, student_id, subject, details, status, created_at, related_meal_label").order("created_at", { ascending: false }).limit(500),
      supabase.from("other_complaints").select("id, student_id, block, floor, room_number, category, details, status, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("meal_feedback").select("id, student_id, meal_date, meal_label, rating, comment, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("absence_periods").select("id, student_id, starts_on, ends_on, reason, created_at").order("starts_on", { ascending: true }).limit(500),
      supabase.from("meal_tokens").select("id, student_id, offering_id, selected_choice, issued_at, expires_at, cooldown_until").order("issued_at", { ascending: false }).limit(500),
      supabase.from("announcements").select("id, title, body, posted_by_name, posted_by_role, is_published, created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const failed = [profiles, mess, floor, feedback, absences, tokens, announcements].some((result) => result.error);
    setRows({ profiles: profiles.data ?? [], mess: mess.data ?? [], floor: floor.data ?? [], feedback: feedback.data ?? [], absences: absences.data ?? [], tokens: tokens.data ?? [], announcements: announcements.data ?? [] });
    if (failed) setNotice("Some portal data did not load. Confirm the latest Supabase migration has been applied.");
    else setNotice("");
    if (profile.role === "admin") {
      const response = await fetch("/api/admin/scholars", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setScholars(result.scholars ?? []);
      else setNotice(result.error || "Could not load the approved scholar list.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const profileMap = useMemo(() => new Map(rows.profiles.map((profile) => [profile.id, profile])), [rows.profiles]);
  const registeredStudents = rows.profiles.filter((profile) => profile.role === "student" && profile.is_active);
  const activeStudentScholars = scholars.filter((scholar) => scholar.is_active && (!scholar.linked_auth_user_id || profileMap.get(scholar.linked_auth_user_id)?.role === "student"));
  const activeStudentIds = new Set(isAdmin && scholars.length ? activeStudentScholars.map((scholar) => scholar.linked_auth_user_id).filter((id): id is string => Boolean(id)) : registeredStudents.map((profile) => profile.id));
  const activeStudents = isAdmin && scholars.length ? activeStudentScholars.length : registeredStudents.length;
  const todayKey = dateKey(new Date());
  const awayToday = new Set(rows.absences.filter((absence) => (absence.starts_on ?? "") <= todayKey && (absence.ends_on ?? "") >= todayKey && Boolean(absence.student_id && activeStudentIds.has(absence.student_id))).map((absence) => absence.student_id).filter((id): id is string => Boolean(id))).size;
  const expectedEatersToday = Math.max(0, activeStudents - awayToday);
  const dateMatch = (iso?: string) => {
    if (!iso) return true;
    const rowDay = localDate(iso);
    const today = dateKey(new Date());
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    if (range === "today") return rowDay === today;
    if (range === "tomorrow") return rowDay === dateKey(tomorrowDate);
    if (range === "yesterday") return rowDay === dateKey(yesterdayDate);
    if (range === "date") return rowDay === specificDate;
    if (range.startsWith("last")) {
      const days = Number(range.slice(4));
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days + 1);
      return rowDay >= dateKey(cutoff) && rowDay <= today;
    }
    return true;
  };
  const absenceDateMatch = (item: Row) => {
    const start = item.starts_on ?? "";
    const end = item.ends_on ?? start;
    if (range === "all") return true;
    if (range === "today") return start <= todayKey && end >= todayKey;
    if (range === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); const key = dateKey(d); return start <= key && end >= key; }
    if (range === "yesterday") { const d = new Date(); d.setDate(d.getDate() - 1); const key = dateKey(d); return start <= key && end >= key; }
    if (range === "date") return start <= specificDate && end >= specificDate;
    if (range.startsWith("last")) { const d = new Date(); d.setDate(d.getDate() - Number(range.slice(4)) + 1); const cutoff = dateKey(d); return start <= todayKey && end >= cutoff; }
    return true;
  };
  const matchesSearch = (item: Row) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    const owner = profileMap.get(item.student_id ?? "");
    return [item.subject, item.category, item.details, item.comment, item.block, item.floor, item.room_number, item.meal_label, owner?.full_name, owner?.scholar_number]
      .some((value) => String(value ?? "").toLowerCase().includes(query));
  };
  const selectedRows = (source: Row[]) => source.filter((item) => dateMatch(item.created_at ?? item.issued_at ?? item.starts_on) && (statusFilter === "all" || !item.status || item.status === statusFilter) && matchesSearch(item));
  const selectedAbsences = rows.absences.filter((item) => absenceDateMatch(item) && matchesSearch(item));

  async function updateComplaint(kind: "mess" | "floor", id: string, status: string) {
    setBusyId(id);
    const table = kind === "mess" ? "serious_complaints" : "other_complaints";
    const { error } = await createClient().from(table).update({ status }).eq("id", id);
    if (error) setNotice("Could not update complaint status. Check the database access rules.");
    else await load();
    setBusyId("");
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPublishNotice("");
    const { error } = await createClient().from("announcements").insert({ title: String(values.get("title")).trim(), body: String(values.get("body")).trim(), is_published: true });
    if (error) setPublishNotice("Could not publish update. Confirm your staff role and database migration.");
    else { form.reset(); setPublishNotice("Update published for students."); await load(); }
  }

  async function saveAnnouncement(id: string) {
    setUpdateBusyId(id);
    setPublishNotice("");
    const { error } = await createClient().from("announcements").update({ title: editingTitle.trim(), body: editingBody.trim() }).eq("id", id);
    if (error) setPublishNotice("Could not save this update. Check the staff permissions migration.");
    else { setPublishNotice("Update saved."); setEditingUpdateId(""); await load(); }
    setUpdateBusyId("");
  }

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("Remove this update for all students? This cannot be undone.")) return;
    setUpdateBusyId(id);
    setPublishNotice("");
    const { error } = await createClient().from("announcements").delete().eq("id", id);
    if (error) setPublishNotice("Could not remove this update. Apply the latest staff permissions migration.");
    else { setPublishNotice("Update removed."); await load(); }
    setUpdateBusyId("");
  }

  async function addScholar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const response = await fetch("/api/admin/scholars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scholarNumber: values.get("scholarNumber"), displayName: values.get("displayName") }) });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || "Could not add scholar."); return; }
    form.reset();
    setNotice("Scholar added to the approved list. They can now verify their college email.");
    await load();
  }

  async function setScholarActive(scholar: Scholar) {
    setBusyId(scholar.scholar_number);
    const response = await fetch("/api/admin/scholars", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scholarNumber: scholar.scholar_number, isActive: !scholar.is_active }) });
    const result = await response.json();
    if (!response.ok) setNotice(result.error || "Could not update scholar status.");
    else await load();
    setBusyId("");
  }

  async function setScholarRole(scholar: Scholar, role: string) {
    setBusyId(scholar.scholar_number);
    const response = await fetch("/api/admin/scholars", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scholarNumber: scholar.scholar_number, role }) });
    const result = await response.json();
    if (!response.ok) setNotice(result.error || "Could not change this account role.");
    else { setNotice("Account role updated."); await load(); }
    setBusyId("");
  }

  const visibleTabs = tabs.filter((item) => (item.id !== "students" || isAdmin) && (item.id !== "mess" || isAdmin || role === "committee") && (item.id !== "updates" || role !== "committee"));
  const titleFor = (target: PortalTab) => tabs.find((item) => item.id === target)?.label ?? "Portal";

  return <div className="staff-portal"><section className="panel portal-welcome"><div><p className="eyebrow">MESSMATE STAFF PORTAL · {roleLabel(role).toUpperCase()}</p><h2>Welcome, {name}</h2><p>Review submissions, manage status and keep students informed.</p></div><button className="button button-outline" onClick={() => void load()} type="button">Refresh data</button></section>
    <div className="portal-tabs">{visibleTabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {tab !== "overview" && tab !== "updates" && <div className="portal-filters">{tab !== "students" && <label>Date range<select value={range} onChange={(event) => setRange(event.target.value as DateRange)}><option value="all">All dates</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="yesterday">Yesterday</option><option value="last5">Last 5 days</option><option value="last10">Last 10 days</option><option value="last30">Last 30 days</option><option value="date">Choose a date</option></select></label>}{range === "date" && tab !== "students" && <label>Specific date<input type="date" value={specificDate} onChange={(event) => setSpecificDate(event.target.value)}/></label>}<label>Search<input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Name, scholar no., room, category…"/></label>{["mess", "floor"].includes(tab) && <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="new">New</option><option value="in_review">In review</option><option value="resolved">Resolved</option></select></label>}</div>}
    {tab === "overview" && <><div className="portal-stat-grid"><article className="panel"><small>Active student accounts</small><strong>{activeStudents}</strong></article><article className="panel"><small>Expected eaters today</small><strong>{expectedEatersToday}</strong></article><article className="panel"><small>Open mess complaints</small><strong>{rows.mess.filter((item) => item.status !== "resolved").length}</strong></article><article className="panel"><small>Open floor issues</small><strong>{rows.floor.filter((item) => item.status !== "resolved").length}</strong></article><article className="panel"><small>Food feedback</small><strong>{rows.feedback.length}</strong></article><article className="panel"><small>Token records</small><strong>{rows.tokens.length}</strong></article></div><section className="panel portal-overview"><h2>Recent activity</h2><div className="portal-activity-grid">{(isAdmin || role === "committee") && <button type="button" onClick={() => setTab("mess")}>Open mess complaints <strong>{rows.mess.length}</strong></button>}<button type="button" onClick={() => setTab("floor")}>Open floor complaints <strong>{rows.floor.length}</strong></button><button type="button" onClick={() => setTab("feedback")}>Review meal feedback <strong>{rows.feedback.length}</strong></button><button type="button" onClick={() => setTab("absences")}>Review break plans <strong>{rows.absences.length}</strong></button><button type="button" onClick={() => setTab("tokens")}>Review meal token history <strong>{rows.tokens.length}</strong></button></div><p className="section-copy">Student names and scholar numbers appear alongside their submissions. Restricted data is visible only to active staff accounts. Expected eaters = active students minus students who declared they are away today.</p></section></>}
    {tab === "mess" && <section className="portal-records"><h2>{titleFor(tab)}</h2>{selectedRows(rows.mess).map((item) => { const owner = profileMap.get(item.student_id ?? ""); return <article className="panel portal-record" key={item.id}><div className="complaint-list-top"><span className="status-pill">MESS-{item.id.slice(0, 8).toUpperCase()}</span><time>{item.created_at ? dateLabel(item.created_at) : ""}</time></div><div className="portal-record-person">{owner?.full_name || "Student"} · {owner?.scholar_number || "Scholar number unavailable"} · {item.related_meal_label || "General"}</div><h3>{item.subject}</h3><p>{item.details}</p><StatusControl value={item.status || "new"} disabled={busyId === item.id} onChange={(value) => void updateComplaint("mess", item.id, value)}/></article>})}{selectedRows(rows.mess).length === 0 && <p className="empty-state">No mess complaints match these filters.</p>}</section>}
    {tab === "floor" && <section className="portal-records"><h2>{titleFor(tab)}</h2>{selectedRows(rows.floor).map((item) => { const owner = profileMap.get(item.student_id ?? ""); return <article className="panel portal-record" key={item.id}><div className="complaint-list-top"><span className="status-pill">FLOOR-{item.id.slice(0, 8).toUpperCase()}</span><time>{item.created_at ? dateLabel(item.created_at) : ""}</time></div><div className="portal-record-person">{owner?.full_name || "Student"} · {owner?.scholar_number || "Scholar number unavailable"} · Block {item.block}, {item.floor} floor, Room {item.room_number}</div><h3>{item.category}</h3><p>{item.details}</p><StatusControl value={item.status || "new"} disabled={busyId === item.id} onChange={(value) => void updateComplaint("floor", item.id, value)}/></article>})}{selectedRows(rows.floor).length === 0 && <p className="empty-state">No floor complaints match these filters.</p>}</section>}
    {tab === "feedback" && <section className="portal-records"><h2>{titleFor(tab)}</h2>{selectedRows(rows.feedback).map((item) => { const owner = profileMap.get(item.student_id ?? ""); return <article className="panel portal-record" key={item.id}><div className="complaint-list-top"><span className="status-pill">{item.rating} / 5 stars · {item.meal_label}</span><time>{item.created_at ? dateLabel(item.created_at) : ""}</time></div><div className="portal-record-person">{owner?.full_name || "Student"} · {owner?.scholar_number || "Scholar number unavailable"}</div><p>{item.comment || "Rating only; no written comment."}</p></article>})}{selectedRows(rows.feedback).length === 0 && <p className="empty-state">No feedback matches these filters.</p>}</section>}
    {tab === "absences" && <section className="portal-records"><h2>{titleFor(tab)}</h2>{selectedAbsences.map((item) => { const owner = profileMap.get(item.student_id ?? ""); return <article className="panel portal-record" key={item.id}><div className="complaint-list-top"><span className="status-pill">{item.reason}</span><time>{item.starts_on} – {item.ends_on}</time></div><div className="portal-record-person">{owner?.full_name || "Student"} · {owner?.scholar_number || "Scholar number unavailable"}</div></article>})}{selectedAbsences.length === 0 && <p className="empty-state">No break plans match these filters.</p>}</section>}
    {tab === "tokens" && <section className="portal-records"><h2>{titleFor(tab)}</h2>{selectedRows(rows.tokens).map((item) => { const owner = profileMap.get(item.student_id ?? ""); return <article className="panel portal-record" key={item.id}><div className="complaint-list-top"><span className="status-pill">{item.selected_choice || "Limited item"}</span><time>{item.issued_at ? dateLabel(item.issued_at) : ""}</time></div><div className="portal-record-person">{owner?.full_name || "Student"} · {owner?.scholar_number || "Scholar number unavailable"}</div><p>Offer: {item.offering_id} · Expires: {item.expires_at ? dateLabel(item.expires_at) : "—"}</p></article>})}{selectedRows(rows.tokens).length === 0 && <p className="empty-state">No tokens match these filters.</p>}</section>}
    {tab === "updates" && <div className="portal-updates-layout"><section className="panel"><p className="eyebrow">PUBLISH TO STUDENTS</p><h2>Post an update</h2><p className="section-copy">The author label is taken from your signed-in account, so the poster is clear.</p><form className="portal-form" onSubmit={publish}><label>Title<input name="title" required maxLength={140} placeholder="e.g. Dinner timing update"/></label><label>Message<textarea name="body" required maxLength={4000} rows={5} placeholder="Write an update for mess users"/></label><button className="button button-primary" type="submit">Publish update <span>→</span></button></form>{publishNotice && <p className="inline-notice" role="status">{publishNotice}</p>}</section><section className="portal-records"><div className="updates-list-heading"><div><h2>Recent updates</h2><p>Published messages visible to students</p></div><span>{rows.announcements.length} total</span></div>{rows.announcements.map((item) => <article className="panel portal-record update-record" key={item.id}><div className="complaint-list-top"><span className="status-pill">{item.is_published ? "Published" : "Draft"}</span><time>{item.created_at ? dateLabel(item.created_at) : ""}</time></div>{editingUpdateId === item.id ? <div className="portal-form update-editor"><label>Title<input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} maxLength={140} required/></label><label>Message<textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={4000} rows={4} required/></label><div className="update-actions"><button className="button button-primary" type="button" disabled={updateBusyId === item.id || !editingTitle.trim() || !editingBody.trim()} onClick={() => void saveAnnouncement(item.id)}>{updateBusyId === item.id ? "Saving…" : "Save changes"}</button><button className="button button-outline" type="button" onClick={() => setEditingUpdateId("")}>Cancel</button></div></div> : <><h3>{item.title}</h3><p>{item.body}</p></>}<small>By {item.posted_by_name || "Staff"} · {roleLabel(item.posted_by_role)}</small>{editingUpdateId !== item.id && <div className="update-actions"><button className="button button-outline" type="button" disabled={Boolean(updateBusyId)} onClick={() => { setEditingUpdateId(item.id); setEditingTitle(item.title || ""); setEditingBody(item.body || ""); }}>Edit</button><button className="button update-delete-button" type="button" disabled={Boolean(updateBusyId)} onClick={() => void deleteAnnouncement(item.id)}>{updateBusyId === item.id ? "Removing…" : "Remove update"}</button></div>}</article>)}{rows.announcements.length === 0 && <p className="empty-state">No updates have been published yet.</p>}</section></div>}
    {tab === "students" && isAdmin && <section className="portal-records"><div className="section-heading"><div><p className="eyebrow">ADMIN ONLY</p><h2>Student accounts</h2></div></div><form className="panel portal-form add-scholar-form" onSubmit={addScholar}><h3>Add an approved scholar number</h3><label>Scholar number<input name="scholarNumber" required maxLength={32} placeholder="Scholar number"/></label><label>Student name<input name="displayName" required maxLength={120} placeholder="Full name"/></label><button className="button button-primary" type="submit">Add to approved list</button></form><div className="panel table-scroll"><table className="portal-table"><thead><tr><th>Scholar number</th><th>Name</th><th>Assign role</th><th>Access</th><th>Login</th><th>Actions</th></tr></thead><tbody>{scholars.filter((scholar) => `${scholar.scholar_number} ${scholar.display_name ?? ""}`.toLowerCase().includes(searchTerm.trim().toLowerCase())).map((scholar) => { const profile = rows.profiles.find((item) => item.id === scholar.linked_auth_user_id); return <tr key={scholar.scholar_number}><td>{scholar.scholar_number}</td><td>{profile?.full_name || scholar.display_name || "Pending first login"}</td><td>{!profile ? "Student" : profile.role === "admin" ? "Admin" : profile.role === "committee" ? "Committee" : <select aria-label={`Role for ${scholar.scholar_number}`} value={profile.role || "student"} disabled={busyId === scholar.scholar_number} onChange={(event) => void setScholarRole(scholar, event.target.value)}><option value="student">Student</option><option value="convenor">Convenor</option><option value="warden">Warden</option></select>}</td><td>{scholar.is_active ? "Active" : "Inactive"}</td><td>{profile ? "Linked" : "Not registered"}</td><td><button type="button" className="button button-outline" disabled={busyId === scholar.scholar_number || profile?.role === "admin"} onClick={() => void setScholarActive(scholar)}>{scholar.is_active ? "Deactivate" : "Reactivate"}</button></td></tr>})}</tbody></table></div><p className="section-copy">Add an approved scholar number first. After the student finishes onboarding, assign Convenor or Warden from the role menu. They keep using the same scholar-number username and password. The Admin role is managed separately and cannot be assigned here.</p></section>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </div>;
}

function StatusControl({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="portal-status-control">Status<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="new">New</option><option value="in_review">In review</option><option value="resolved">Resolved</option></select></label>;
}
