"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Announcement = { id: string; title: string; body: string; image_path: string | null; audio_path: string | null; poll_question: string | null; poll_options: string[] | null; poll_allows_multiple: boolean; posted_by_name: string | null; posted_by_role: string | null; created_at: string };
type PollResult = { option_label: string; vote_count: number };
const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
const roleName = (value?: string | null) => value ? value.charAt(0).toUpperCase() + value.slice(1) : "Mess staff";

export default function AnnouncementsList() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [notice, setNotice] = useState("Loading updates…");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, string[]>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, PollResult[]>>({});
  const [busyId, setBusyId] = useState("");
  const [voteNotice, setVoteNotice] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [{ data: { user } }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("announcements").select("id, title, body, image_path, audio_path, poll_question, poll_options, poll_allows_multiple, posted_by_name, posted_by_role, created_at").eq("is_published", true).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (error) { setNotice("Updates are temporarily unavailable. Please refresh or try again later."); return; }
      const announcements = (data ?? []) as Announcement[];
      setItems(announcements);
      setNotice(announcements.length ? "" : "There are no updates yet.");
      const pollItems = announcements.filter((item) => item.poll_question && (item.poll_options?.length ?? 0) > 1);
      if (!pollItems.length) return;

      const profile = user ? await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle() : null;
      const isStudent = Boolean(user && profile?.data?.is_active && profile.data.role === "student");
      if (isStudent && user) {
        setStudentId(user.id);
        const { data: votes } = await supabase.from("announcement_poll_votes").select("announcement_id, selected_options").eq("student_id", user.id).in("announcement_id", pollItems.map((item) => item.id));
        if (!cancelled && votes) {
          const nextVotes = Object.fromEntries(votes.map((vote) => [vote.announcement_id, vote.selected_options]));
          setMyVotes(nextVotes);
          setSelections(nextVotes);
        }
      }
      const pairs = await Promise.all(pollItems.map(async (item) => {
        const { data: pollResults } = await supabase.rpc("get_announcement_poll_results", { p_announcement_id: item.id });
        return [item.id, (pollResults ?? []) as PollResult[]] as const;
      }));
      if (!cancelled) setResults(Object.fromEntries(pairs));
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function toggleOption(item: Announcement, option: string) {
    setSelections((current) => {
      const selected = current[item.id] ?? [];
      const next = item.poll_allows_multiple
        ? selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option]
        : [option];
      return { ...current, [item.id]: next };
    });
    setVoteNotice((current) => ({ ...current, [item.id]: "" }));
  }

  async function vote(item: Announcement) {
    const selected = selections[item.id] ?? [];
    if (!studentId) return;
    if (!selected.length) { setVoteNotice((current) => ({ ...current, [item.id]: "Choose at least one answer." })); return; }
    setBusyId(item.id);
    setVoteNotice((current) => ({ ...current, [item.id]: "" }));
    const supabase = createClient();
    const { error } = await supabase.from("announcement_poll_votes").upsert({ announcement_id: item.id, student_id: studentId, selected_options: selected }, { onConflict: "announcement_id,student_id" });
    if (error) setVoteNotice((current) => ({ ...current, [item.id]: "Your vote could not be saved. Please try again." }));
    else {
      setMyVotes((current) => ({ ...current, [item.id]: selected }));
      setVoteNotice((current) => ({ ...current, [item.id]: "Your vote has been recorded." }));
      const { data } = await supabase.rpc("get_announcement_poll_results", { p_announcement_id: item.id });
      if (data) setResults((current) => ({ ...current, [item.id]: data as PollResult[] }));
    }
    setBusyId("");
  }

  return <div className="updates-page-content">
    <div className="updates-feed-heading"><div><h2>Latest notices</h2><p>Official information from your mess team</p></div><span className="updates-live"><i/> {items.length} {items.length === 1 ? "update" : "updates"}</span></div>
    {items.map((item) => {
      const imageUrl = item.image_path ? createClient().storage.from("announcement-media").getPublicUrl(item.image_path).data.publicUrl : "";
      const audioUrl = item.audio_path ? createClient().storage.from("announcement-media").getPublicUrl(item.audio_path).data.publicUrl : "";
      const options = Array.isArray(item.poll_options) ? item.poll_options : [];
      const pollResults = results[item.id] ?? [];
      const totalVotes = pollResults.reduce((sum, result) => sum + Number(result.vote_count), 0);
      const voted = Boolean(myVotes[item.id]);
      return <article className="announcement-card panel" key={item.id}>
        <div className="announcement-card-meta"><span className="announcement-tag">MESS UPDATE</span><time>{dateTime(item.created_at)}</time></div>
        <h2>{item.title}</h2>
        <p className="announcement-body">{item.body}</p>
        {imageUrl && <img className="announcement-image" src={imageUrl} alt="Image attached to this mess update" loading="lazy"/>}
        {audioUrl && <div className="announcement-audio"><span aria-hidden="true">♫</span><audio controls preload="none" src={audioUrl}>Your browser does not support audio playback.</audio></div>}
        {item.poll_question && options.length > 1 && <section className="announcement-poll" aria-label="Interactive poll">
          <div className="announcement-poll-heading"><span>▤</span><div><h3>{item.poll_question}</h3><small>{item.poll_allows_multiple ? "Select all answers that apply" : "Select one answer"} · {totalVotes} {totalVotes === 1 ? "vote" : "votes"}</small></div></div>
          <div className="announcement-poll-options">{options.map((option) => {
            const count = Number(pollResults.find((result) => result.option_label === option)?.vote_count ?? 0);
            const percent = totalVotes ? Math.round(count / totalVotes * 100) : 0;
            const checked = (selections[item.id] ?? []).includes(option);
            return <label className={`announcement-poll-option ${voted ? "show-result" : ""}`} key={option}>
              <input type={item.poll_allows_multiple ? "checkbox" : "radio"} name={`poll-${item.id}`} checked={checked} disabled={!studentId || Boolean(busyId)} onChange={() => toggleOption(item, option)}/>
              <span className="announcement-poll-option-text">{option}</span>
              {voted && <><span className="poll-result-track"><i style={{ width: `${percent}%` }}/></span><strong className="poll-result-count">{percent}%</strong></>}
            </label>;
          })}</div>
          {studentId ? <button className="button button-primary poll-vote-button" type="button" disabled={busyId === item.id || !(selections[item.id]?.length)} onClick={() => void vote(item)}>{busyId === item.id ? "Saving vote…" : voted ? "Update my vote" : "Submit vote"}</button> : <p className="poll-login-hint"><Link href="/login">Sign in as a student</Link> to vote.</p>}
          {voteNotice[item.id] && <p className="poll-vote-notice" role="status">{voteNotice[item.id]}</p>}
        </section>}
        <div className="announcement-author"><span className="announcement-author-avatar">{(item.posted_by_name || "M").charAt(0).toUpperCase()}</span><span>Posted by <strong>{item.posted_by_name || "Mess staff"}</strong><small>{roleName(item.posted_by_role)}</small></span></div>
      </article>;
    })}
    {notice && <section className={`panel updates-empty ${items.length ? "" : "is-empty"}`}><span>{items.length ? "ⓘ" : "↗"}</span><strong>{items.length ? notice : "You’re all caught up"}</strong>{!items.length && <small>New mess announcements will appear here.</small>}</section>}
  </div>;
}
