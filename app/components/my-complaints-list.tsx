"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Item = { id: string; subject: string; status: string; details: string; created_at: string; kind: "mess" | "floor"; location?: string | null };
const niceDate = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

export default function MyComplaintsList() {
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState("Loading your complaints…");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setNotice("Please sign in to view your complaints."); return; }
    const [mess, floor] = await Promise.all([
      supabase.from("serious_complaints").select("id, subject, status, details, created_at, related_meal_label").eq("student_id", user.id).order("created_at", { ascending: false }),
      supabase.from("other_complaints").select("id, category, status, details, created_at, block, floor, room_number").eq("student_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (mess.error || floor.error) { setNotice("Could not load your complaints. Check that the latest database update has been applied."); return; }
    const rows: Item[] = [
      ...(mess.data ?? []).map((row) => ({ id: row.id, subject: row.subject, status: row.status, details: row.details, created_at: row.created_at, kind: "mess" as const, location: row.related_meal_label })),
      ...(floor.data ?? []).map((row) => ({ id: row.id, subject: row.category, status: row.status, details: row.details, created_at: row.created_at, kind: "floor" as const, location: `Block ${row.block} · ${row.floor} floor · Room ${row.room_number}` })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setItems(rows);
    setNotice(rows.length ? "" : "You haven’t submitted any complaints yet.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markResolved(item: Item) {
    setBusyId(item.id);
    setNotice("");
    const supabase = createClient();
    const table = item.kind === "mess" ? "serious_complaints" : "other_complaints";
    const { error } = await supabase.from(table).update({ status: "resolved" }).eq("id", item.id);
    if (error) setNotice("Could not update this complaint. Please try again.");
    else await load();
    setBusyId("");
  }

  const openCount = items.filter((item) => item.status !== "resolved").length;
  const resolvedCount = items.length - openCount;
  return <section className="my-complaints">
    <div className="my-complaints-summary">
      <div><span className="complaint-summary-icon">☷</span><div><strong>{items.length} {items.length === 1 ? "complaint" : "complaints"}</strong><small>All your mess and hostel requests in one place</small></div></div>
      <div className="complaint-summary-counts"><span><i className="summary-dot open-dot"/>{openCount} open</span><span><i className="summary-dot resolved-dot"/>{resolvedCount} resolved</span></div>
      <button className="button button-outline" type="button" onClick={() => void load()}>Refresh</button>
    </div>
    {items.map((item) => <article className="panel complaint-card" key={`${item.kind}-${item.id}`}>
      <div className="complaint-card-top"><span className={`complaint-kind ${item.kind}`}>{item.kind === "mess" ? "Mess feedback" : "Floor / room issue"}</span><span className={`status-pill status-${item.status}`}>{item.status.replace("_", " ")}</span></div>
      <h2>{item.subject}</h2>
      <div className="complaint-card-meta"><span>{item.kind === "mess" ? "MESS" : "FLOOR"}-{item.id.slice(0, 8).toUpperCase()}</span><time>{niceDate(item.created_at)}</time></div>
      {item.location && <p className="complaint-location">{item.kind === "floor" ? "⌖ " : "◷ "}{item.location}</p>}
      <p className="complaint-details">{item.details}</p>
      {item.status !== "resolved" ? <button className="resolve-complaint-button" type="button" disabled={busyId === item.id} onClick={() => void markResolved(item)}><span>✓</span>{busyId === item.id ? "Updating status…" : "Mark as resolved"}</button> : <p className="complaint-resolved-note"><span>✓</span> You marked this issue as resolved.</p>}
    </article>)}
    {notice && <p className={`complaints-notice ${items.length ? "" : "complaints-empty"}`}><span>{items.length ? "ⓘ" : "☷"}</span><strong>{items.length ? notice : "No complaints yet"}</strong>{!items.length && <small>Requests you submit will appear here with their reference ID and status.</small>}</p>}
  </section>;
}
