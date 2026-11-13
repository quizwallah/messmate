"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const cleanExtension = (file: File) => file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";

export default function AnnouncementComposer({ onPublished }: { onPublished: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [withPoll, setWithPoll] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowsMultiple, setAllowsMultiple] = useState(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    const image = data.get("image");
    const audio = data.get("audio");
    const imageFile = image instanceof File && image.size ? image : null;
    const audioFile = audio instanceof File && audio.size ? audio : null;
    const pollOptions = options.map((option) => option.trim()).filter(Boolean);
    if (!title || !body) { setNotice("Add a title and message before publishing."); return; }
    if (imageFile && (!imageFile.type.startsWith("image/") || imageFile.size > MAX_IMAGE_BYTES)) { setNotice("Choose an image under 5 MB."); return; }
    if (audioFile && (!audioFile.type.startsWith("audio/") || audioFile.size > MAX_AUDIO_BYTES)) { setNotice("Choose an audio file under 15 MB."); return; }
    if (withPoll && (question.trim().length < 3 || pollOptions.length < 2 || pollOptions.length > 6 || new Set(pollOptions.map((item) => item.toLowerCase())).size !== pollOptions.length)) {
      setNotice("A poll needs a question and 2–6 different answer options."); return;
    }

    setBusy(true);
    setNotice("");
    const supabase = createClient();
    const uploadedPaths: string[] = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again before posting an update.");
      const upload = async (file: File, label: string) => {
        const path = `${user.id}/${crypto.randomUUID()}-${label}.${cleanExtension(file)}`;
        const { error } = await supabase.storage.from("announcement-media").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error(`Could not upload the ${label}. Check that the announcement-media storage migration is applied.`);
        uploadedPaths.push(path);
        return path;
      };
      const imagePath = imageFile ? await upload(imageFile, "image") : null;
      const audioPath = audioFile ? await upload(audioFile, "voice-note") : null;
      const { error } = await supabase.from("announcements").insert({
        title,
        body,
        is_published: true,
        image_path: imagePath,
        audio_path: audioPath,
        poll_question: withPoll ? question.trim() : null,
        poll_options: withPoll ? pollOptions : [],
        poll_allows_multiple: withPoll && allowsMultiple,
      });
      if (error) throw new Error("Could not publish this update. Apply the latest announcement migration and check your staff access.");
      form.reset();
      setWithPoll(false);
      setQuestion("");
      setOptions(["", ""]);
      setAllowsMultiple(false);
      setNotice("Update published for students.");
      onPublished();
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from("announcement-media").remove(uploadedPaths);
      setNotice(error instanceof Error ? error.message : "Could not publish this update. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel announcement-composer"><div className="announcement-composer-heading"><span className="composer-icon">↗</span><div><p className="eyebrow">PUBLISH TO STUDENTS</p><h2>Post an update</h2><p>Your name and staff role are added automatically.</p></div></div>
    <form className="portal-form" onSubmit={publish}>
      <label>Title<input name="title" required maxLength={140} placeholder="e.g. Dinner timing update"/></label>
      <label>Message<textarea name="body" required maxLength={4000} rows={5} placeholder="Write an update for mess users"/></label>
      <div className="announcement-upload-grid">
        <label className="upload-field"><span>Image <small>JPG, PNG, WebP · Up to 5 MB</small></span><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"/></label>
        <label className="upload-field"><span>Voice note <small>Audio file · Up to 15 MB</small></span><input name="audio" type="file" accept="audio/*"/></label>
      </div>
      <section className="poll-builder">
        <label className="poll-enable"><input type="checkbox" checked={withPoll} onChange={(event) => setWithPoll(event.target.checked)}/><span><strong>Add a poll</strong><small>Students can vote on the Updates page.</small></span></label>
        {withPoll && <div className="poll-fields"><label>Poll question<input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={240} placeholder="What should we plan for Thursday?" required/></label><div className="poll-answer-list"><span className="poll-answer-title">Answer options</span>{options.map((option, index) => <div className="poll-answer-row" key={index}><span className="poll-answer-dot">{index + 1}</span><input aria-label={`Poll answer option ${index + 1}`} value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={120} placeholder={`Option ${index + 1}`} required/><button className="poll-remove-option" type="button" disabled={options.length <= 2} onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove option ${index + 1}`}>×</button></div>)}{options.length < 6 && <button className="poll-add-option" type="button" onClick={() => setOptions((current) => [...current, ""])}>＋ Add answer option</button>}</div><label className="poll-multiple"><input type="checkbox" checked={allowsMultiple} onChange={(event) => setAllowsMultiple(event.target.checked)}/><span>Allow students to choose more than one answer</span></label></div>}
      </section>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish update"}<span>→</span></button>
    </form>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </section>;
}
