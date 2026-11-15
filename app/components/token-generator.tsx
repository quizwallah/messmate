"use client";

import { useEffect, useState } from "react";

type TokenKind = "veg" | "nonveg" | "sweet";
type SavedToken = { code: string; kind: TokenKind; label: string; createdAt: number; expiresAt: number; cooldownUntil: number };
type Props = { mode: "meal" | "sweet" };
const formatHMS = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
const dateLabel = (timestamp: number) => new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "Asia/Kolkata" }).format(new Date(timestamp));
const timeLabel = (timestamp: number) => new Intl.DateTimeFormat("en-IN", { timeStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(timestamp));

export default function TokenGenerator({ mode }: Props) {
  const [offer, setOffer] = useState("Gulab jamun");
  const [choice, setChoice] = useState<TokenKind>("veg");
  const [token, setToken] = useState<SavedToken | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      setLoadingStatus(true);
      try {
        const type = mode === "meal" ? "meal_choice" : "limited_item";
        const response = await fetch(`/api/tokens?type=${type}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load your token status.");
        if (!cancelled) setCooldownUntil(result.cooldownUntil ? new Date(result.cooldownUntil).getTime() : 0);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load your token status.");
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    };
    void loadStatus();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(clock);
    };
  }, [mode]);

  const isActive = !!token && token.expiresAt > now;
  const cooldown = Math.max(0, cooldownUntil - now);
  const kind: TokenKind = mode === "sweet" ? "sweet" : choice;
  const isBlocked = loadingStatus || busy || cooldown > 0;

  async function generate() {
    if (isBlocked) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, choice: mode === "meal" ? choice === "veg" ? "veg" : "non_veg" : undefined, sweetItem: mode === "sweet" ? offer : undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.token) throw new Error(result.error || "Could not generate a token.");

      const issuedAt = new Date(result.token.issuedAt).getTime();
      const next: SavedToken = {
        code: result.token.code,
        kind: result.token.kind,
        label: result.token.label,
        createdAt: issuedAt,
        expiresAt: new Date(result.token.expiresAt).getTime(),
        cooldownUntil: new Date(result.token.cooldownUntil).getTime(),
      };
      setToken(next);
      setCooldownUntil(next.cooldownUntil);
      setDismissed(false);
      setEnded(false);
      setNow(Date.now());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not generate a token. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function endToken() {
    if (!token) return;
    setEnded(true);
  }

  const shouldShowFullScreen = !!token && isActive && !dismissed && !ended;
  const dateText = token ? dateLabel(token.createdAt) : "";
  const timeText = token ? timeLabel(token.createdAt) : "";
  const items = ["Gulab jamun", "Other"];

  return <>
    <main className="page-main">
      <section className="page-heading"><p className="eyebrow">{mode === "meal" ? "MEAL SERVING" : "ONE-TIME SWEET"}</p><h1>{mode === "meal" ? "Meal token" : "Sweet token"}</h1><p>{mode === "meal" ? "Choose Veg or Non-Veg, then generate your dinner token just before collecting your meal." : "Choose Gulab jamun or another sweet. Sweet tokens have a separate cooldown from meal tokens."}</p></section>
      <section className="token-create-card panel">
        <div className="token-create-copy"><p className="eyebrow">ONE TOKEN · FIVE MINUTES</p><h2>{mode === "meal" ? "Choose your plate." : "Choose your sweet."}</h2><p>Show the full-screen token to the mess member. It expires automatically after five minutes.</p></div>
        <div className="token-fields">
          {mode === "meal" ? <div className="dinner-only-label"><span>Meal</span><strong>Dinner</strong></div> : <label>Sweet item<select value={offer} onChange={(event) => setOffer(event.target.value)}>{items.map((item) => <option key={item}>{item}</option>)}</select></label>}
          {mode === "meal" && <div className="diet-picker" aria-label="Meal type"><button className={choice === "veg" ? "diet-option selected veg-choice" : "diet-option veg-choice"} type="button" onClick={() => setChoice("veg")}><span className="diet-dot"/><span><strong>Veg</strong><small>Token available daily</small></span></button><button className={choice === "nonveg" ? "diet-option selected nonveg-choice" : "diet-option nonveg-choice"} type="button" onClick={() => setChoice("nonveg")}><span className="diet-dot"/><span><strong>Non-Veg</strong><small>Token available daily</small></span></button></div>}
          {mode === "sweet" && <p className="availability-note">Sweet tokens are available daily and have a separate cooldown from meal tokens.</p>}
          {isBlocked && cooldown > 0 ? <div className="cooldown-box"><span>Next {mode === "meal" ? "meal" : "sweet"} token available in</span><strong>{formatHMS(cooldown)}</strong><small>The cooldown ends at {timeLabel(cooldownUntil)}.</small></div> : <button className={`button button-primary full-button generate-${kind}`} type="button" onClick={() => void generate()} disabled={isBlocked}>{busy ? "Generating secure token…" : loadingStatus ? "Checking token access…" : `Generate ${mode === "meal" ? `${choice === "veg" ? "Veg" : "Non-Veg"} dinner token` : `${offer} token}`} `}<span>→</span></button>}
        </div>
      </section>
      {notice && <p className="inline-notice" role="status">{notice}</p>}
      {token && !isActive && <section className="expired-card panel"><span className="expired-mark">✓</span><div><strong>Previous token expired</strong><p>{token.label} · {dateText} at {timeText}</p><small>It is treated as collected. You can generate another {mode === "meal" ? "meal" : "sweet"} token when the cooldown ends.</small></div></section>}
    </main>
    {shouldShowFullScreen && token && <section className={`token-overlay token-overlay--${token.kind}`} role="dialog" aria-modal="true" aria-label="Active mess token">
      <button className="token-close" type="button" onClick={() => setDismissed(true)} aria-label="Close token">×</button>
      <p className="token-kicker">SHOW THIS TOKEN TO THE MESS MEMBER</p><h1 className="token-title">{token.label}</h1><div className="token-code-large">{token.code}</div>
      <div className="token-stamp"><span>GENERATED</span><strong>{dateText}</strong><strong>{timeText}</strong></div><div className="token-timer-label">TOKEN EXPIRES IN</div><div className="token-timer">{formatHMS(token.expiresAt - now)}</div><div className="token-expiry-note">When the timer ends, this token will be treated as collected.</div>
      <button className="token-end-button" type="button" onClick={endToken}>End token</button>
    </section>}
    {ended && token && <section className={`token-overlay token-overlay--${token.kind} token-ended`} role="dialog" aria-modal="true" aria-label="Token ended"><div className="thumbs-up" aria-hidden="true">👍</div><h1 className="token-title">{token.kind === "sweet" ? "Enjoy your treat!" : "Enjoy your meal!"}</h1><p className="token-expiry-note">{token.label} · Token ended</p><button className="token-end-button" type="button" onClick={() => { setEnded(false); setToken(null); setDismissed(true); }}>Exit</button></section>}
  </>;
}
