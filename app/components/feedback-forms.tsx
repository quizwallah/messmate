"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import OtherComplaintForm from "./other-complaint-form";

const indiaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function FeedbackForms() {
  const [rating, setRating] = useState(0);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [complaintNotice, setComplaintNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) { setFeedbackNotice("Please select a star rating first."); return; }
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setFeedbackNotice("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again before sending feedback.");
      const { error } = await supabase.from("meal_feedback").insert({
        student_id: user.id,
        meal_id: null,
        meal_date: indiaDate(),
        meal_label: String(values.get("meal")),
        rating,
        comment: String(values.get("comment") ?? "").trim() || null,
      });
      if (error) throw error;
      form.reset();
      setRating(0);
      setFeedbackNotice("Thanks—your feedback has been sent to the mess staff.");
    } catch (error) {
      setFeedbackNotice(error instanceof Error && error.message.includes("duplicate") ? "You have already rated this meal today." : error instanceof Error ? error.message : "Could not send feedback. Please try again.");
    } finally { setBusy(false); }
  }

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setComplaintNotice("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again before sending a complaint.");
      const { data, error } = await supabase.from("serious_complaints").insert({
        student_id: user.id,
        related_meal_id: null,
        related_meal_label: String(values.get("meal")) || null,
        subject: String(values.get("subject")).trim(),
        details: String(values.get("details")).trim(),
      }).select("id").single();
      if (error) throw error;
      form.reset();
      setComplaintNotice(`Complaint submitted to the mess committee. Your ID is MESS-${data.id.slice(0, 8).toUpperCase()}.`);
    } catch (error) {
      setComplaintNotice(error instanceof Error ? error.message : "Could not submit the complaint. Please try again.");
    } finally { setBusy(false); }
  }

  return <>
    <section className="feedback-panel panel feedback-page-card"><div className="feedback-intro"><p className="eyebrow">EVERYDAY FEEDBACK</p><h2>Help us make<br/>every meal better.</h2><p>Your rating and comments are available to the mess convenor and staff.</p></div><form className="feedback-form" onSubmit={submitFeedback}><label htmlFor="feedback-meal">Meal</label><select id="feedback-meal" name="meal" defaultValue="Dinner">{["Breakfast", "Lunch", "Snacks", "Dinner"].map((meal) => <option key={meal}>{meal}</option>)}</select><label>Rate today’s food</label><div className="stars">{[1,2,3,4,5].map((star) => <button type="button" key={star} aria-label={`${star} stars`} className={rating >= star ? "chosen" : ""} onClick={() => setRating(star)}>★</button>)}</div><label htmlFor="daily-feedback">Your feedback</label><textarea id="daily-feedback" name="comment" rows={4} maxLength={2000} placeholder="What went well, or what could improve?"/><button className="button button-dark" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to convenor"}<span>→</span></button>{feedbackNotice && <p className="inline-notice" role="status">{feedbackNotice}</p>}</form></section>
    <section className="complaint-page-card panel"><div><p className="eyebrow">PRIVATE TO THE MESS COMMITTEE</p><h2>Serious mess concern?</h2><p className="section-copy">Your serious complaint is stored privately and visible to the committee and admin. You will get a complaint ID.</p></div><form className="complaint-form" onSubmit={submitComplaint}><label>Subject<input name="subject" required maxLength={160} placeholder="Short summary"/></label><label>Related meal<select name="meal" defaultValue=""><option value="">Not meal-specific / Other</option>{["Breakfast", "Lunch", "Snacks", "Dinner"].map((meal) => <option key={meal}>{meal}</option>)}</select></label><label className="full-field">What happened?<textarea name="details" rows={4} required maxLength={5000} placeholder="Share the details..."/></label><button className="button button-outline full-field" type="submit" disabled={busy}>{busy ? "Sending…" : "Send serious complaint"}<span>→</span></button>{complaintNotice && <p className="inline-notice full-field" role="status">{complaintNotice}</p>}</form></section>
    <OtherComplaintForm />
  </>;
}
