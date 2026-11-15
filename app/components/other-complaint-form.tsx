"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import { floorComplaintCategories } from "../../lib/complaints";

export default function OtherComplaintForm() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setNotice("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again before sending a complaint.");
      const { data: complaint, error } = await supabase.from("other_complaints").insert({
        student_id: user.id,
        block: String(data.get("block")),
        floor: String(data.get("floor")),
        room_number: String(data.get("room" )).trim(),
        category: String(data.get("category")).trim(),
        details: String(data.get("details")).trim(),
      }).select("id").single();
      if (error) throw error;
      form.reset();
      setNotice(`Issue submitted. Your ID is FLOOR-${complaint.id.slice(0, 8).toUpperCase()}. You can track it in My complaints.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit this issue. Please try again.");
    } finally { setBusy(false); }
  }
  return <section className="panel complaint-page-card floor-complaint-card"><div><p className="eyebrow">HOSTEL MAINTENANCE</p><h2>Report a floor or room issue</h2><p className="section-copy">Add the block, floor and room so the right team can locate the issue. Choose a category to help staff filter and assign it.</p></div><form className="complaint-form" onSubmit={submit}><label>Block<select name="block" defaultValue="C"><option value="C">Block C</option><option value="D">Block D</option></select></label><label>Floor<select name="floor" defaultValue="Ground">{["Ground", "First", "Second", "Third"].map((floor) => <option key={floor}>{floor}</option>)}</select></label><label>Room number<input name="room" required maxLength={20} placeholder="e.g. 204"/></label><label>Category<select name="category" defaultValue="" required><option value="" disabled>Choose a category</option>{floorComplaintCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="full-field">Briefly describe the issue<textarea name="details" rows={4} required maxLength={2000} placeholder="What needs attention?"/></label><button className="button button-primary full-field" type="submit" disabled={busy}>{busy ? "Sending…" : "Submit floor complaint"}<span>→</span></button>{notice && <p className="inline-notice full-field" role="status">{notice}</p>}</form></section>;
}
