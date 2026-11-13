"use client";

import { createClient } from "../../lib/supabase/client";

export default function AnnouncementAttachments({ imagePath, audioPath, pollQuestion, pollOptions, multiple }: {
  imagePath?: string | null;
  audioPath?: string | null;
  pollQuestion?: string | null;
  pollOptions?: unknown;
  multiple?: boolean;
}) {
  const supabase = createClient();
  const imageUrl = imagePath ? supabase.storage.from("announcement-media").getPublicUrl(imagePath).data.publicUrl : "";
  const audioUrl = audioPath ? supabase.storage.from("announcement-media").getPublicUrl(audioPath).data.publicUrl : "";
  const options = Array.isArray(pollOptions) ? pollOptions.filter((value): value is string => typeof value === "string") : [];
  return <div className="announcement-attachments">
    {imageUrl && <img className="announcement-image" src={imageUrl} alt="Announcement attachment" loading="lazy"/>}
    {audioUrl && <div className="announcement-audio"><span aria-hidden="true">♫</span><audio controls preload="none" src={audioUrl}>Your browser does not support audio playback.</audio></div>}
    {pollQuestion && options.length > 1 && <div className="announcement-poll-preview"><strong>▤ {pollQuestion}</strong><small>{multiple ? "Choose any that apply" : "Choose one answer"}</small><ul>{options.map((option) => <li key={option}>{option}</li>)}</ul></div>}
  </div>;
}
