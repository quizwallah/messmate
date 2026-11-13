"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Announcement = { id: string; title: string; body: string; posted_by_name: string | null; posted_by_role: string | null; created_at: string };
const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

export default function AnnouncementsList() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [notice, setNotice] = useState("Loading updates…");
  useEffect(() => {
    createClient().from("announcements").select("id, title, body, posted_by_name, posted_by_role, created_at").eq("is_published", true).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) { setNotice("Updates are temporarily unavailable."); return; }
      setItems(data ?? []);
      setNotice(data?.length ? "" : "There are no updates yet.");
    });
  }, []);
  return <div className="announcement-list">{items.map((item) => <article className="panel announcement-card" key={item.id}><div className="complaint-list-top"><span className="eyebrow">MESS UPDATE</span><time>{dateTime(item.created_at)}</time></div><h2>{item.title}</h2><p>{item.body}</p><small>Posted by {item.posted_by_name || item.posted_by_role || "Mess staff"}{item.posted_by_role ? ` · ${item.posted_by_role}` : ""}</small></article>)}{notice && <section className="panel empty-state">{notice}</section>}</div>;
}
