"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";

type Absence = { id: string; starts_on: string; ends_on: string; reason: string };
const reasons = ["Semester break", "Festival", "Going home", "Personal reason", "Other"];
const indiaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function AvailabilityForm() {
  const [items, setItems] = useState<Absence[]>([]);
  const [notice, setNotice] = useState("Loading your break plans…");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setNotice("Please sign in to manage your break plans."); return; }
    const { data, error } = await supabase.from("absence_periods").select("id, starts_on, ends_on, reason").eq("student_id", user.id).order("starts_on");
    if (error) { setNotice("Could not load your break plans."); return; }
    setItems(data ?? []);
    setNotice("");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const item = { starts_on: String(data.get("from")), ends_on: String(data.get("until")), reason: String(data.get("reason")) };
    if (item.ends_on < item.starts_on) { setNotice("End date must be on or after the start date."); return; }
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setNotice("Please sign in again before saving dates."); setBusy(false); return; }
    const { error } = await supabase.from("absence_periods").insert({ student_id: user.id, ...item });
    if (error) setNotice(error.message.includes("duplicate") ? "You already saved these exact dates." : "Could not save break dates. Please try again.");
    else { form.reset(); await load(); setNotice("Break dates saved to your account."); }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await createClient().from("absence_periods").delete().eq("id", id);
    if (error) setNotice("Could not remove these dates.");
    else await load();
    setBusy(false);
  }

  return <>
    <section className="absence-panel panel availability-card"><p className="eyebrow">PLAN AHEAD</p><h2>When will you be away?</h2><p className="section-copy">Add the dates you won’t be eating at the mess. This helps the convenor estimate meal counts.</p>
      <form className="absence-form" onSubmit={add}><label>From<input name="from" type="date" min={indiaDate()} required/></label><label>Until<input name="until" type="date" min={indiaDate()} required/></label><label className="reason-label">Reason<select name="reason" defaultValue="Semester break">{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save break dates"}<span>→</span></button></form>
      {notice && <p className="inline-notice" role="status">{notice}</p>}
    </section>
    <section className="absence-results panel"><div className="section-heading"><div><p className="eyebrow">YOUR SCHEDULE</p><h2>Upcoming breaks</h2></div><span className="today-pill">{items.length === 1 ? "1 break saved" : `${items.length} breaks saved`}</span></div>{items.length ? items.map((item) => <article className="absence-entry" key={item.id}><span><strong>{item.starts_on} – {item.ends_on}</strong><small>{item.reason}</small></span><button className="remove-absence" type="button" disabled={busy} onClick={() => void remove(item.id)} aria-label="Remove break dates">×</button></article>) : <p className="empty-state">No break dates added yet.</p>}</section>
    <aside className="estimate estimate-wide"><span className="estimate-icon">▥</span><span><strong>Declared dates help reduce food waste</strong><small>The convenor can use these dates to estimate expected eaters. They are not an attendance record.</small></span></aside>
  </>;
}
