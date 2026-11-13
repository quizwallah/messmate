"use client";

import { useEffect, useState } from "react";

type TokenKind = "veg" | "nonveg" | "sweet";
type SavedToken = { code: string; kind: TokenKind; label: string; createdAt: number; expiresAt: number; cooldownUntil: number; consumed?: boolean };
type Props = { mode: "meal" | "sweet" };
const TOKEN_COOLDOWN_MS = 30 * 1000; // Temporary test setting; can later be managed from an admin setting.
const TOKEN_STORAGE_VERSION = "messmate-token-storage-v2";
const formatHMS = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function TokenGenerator({ mode }: Props) {
  const [offer, setOffer] = useState(mode === "meal" ? "Breakfast" : "Gulab jamun");
  const [choice, setChoice] = useState<TokenKind>("veg");
  const [token, setToken] = useState<SavedToken | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [weekday, setWeekday] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [ended, setEnded] = useState(false);

  const storageKey = mode === "meal" ? "messmate-meal-token" : "messmate-sweet-token";
  useEffect(() => {
    setWeekday(new Date().getDay());
    if (localStorage.getItem(TOKEN_STORAGE_VERSION) !== "reset") {
      localStorage.removeItem("messmate-token");
      localStorage.removeItem("messmate-meal-token");
      localStorage.removeItem("messmate-sweet-token");
      localStorage.setItem(TOKEN_STORAGE_VERSION, "reset");
    }
    const raw = localStorage.getItem(storageKey) ?? (mode === "meal" ? localStorage.getItem("messmate-token") : null);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved.createdAt) {
          const loaded = saved as SavedToken;
          setCooldownUntil(loaded.cooldownUntil ?? 0);
          if (!loaded.consumed) setToken(loaded);
        }
        else if (saved.created) {
          const legacy: SavedToken = { code: saved.code, kind: saved.choice === "Veg" ? "veg" : "nonveg", label: `${saved.choice} dinner`, createdAt: saved.created, expiresAt: saved.expires, cooldownUntil: saved.cooldown };
          setToken(legacy);
          setCooldownUntil(legacy.cooldownUntil);
          localStorage.setItem(storageKey, JSON.stringify(legacy));
        }
      } catch { localStorage.removeItem(storageKey); }
    }
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, [storageKey, mode]);

  const isActive = !!token && token.expiresAt > now;
  const cooldown = Math.max(0, cooldownUntil - now);
  const kind: TokenKind = mode === "sweet" ? "sweet" : choice;
  const isBlocked = cooldown > 0;

  function generate() {
    if (isBlocked || weekday === null) return;
    const createdAt = Date.now();
    const next: SavedToken = {
      code: `MM-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      kind,
      label: mode === "meal" ? `Dinner · ${choice === "veg" ? "Veg" : "Non-Veg"}` : offer,
      createdAt,
      expiresAt: createdAt + 5 * 60_000,
      cooldownUntil: createdAt + TOKEN_COOLDOWN_MS,
    };
    setToken(next);
    setCooldownUntil(next.cooldownUntil);
    setDismissed(false);
    setEnded(false);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function endToken() {
    if (!token) return;
    const consumed = { ...token, consumed: true };
    localStorage.setItem(storageKey, JSON.stringify(consumed));
    setToken(consumed);
    setEnded(true);
  }

  const shouldShowFullScreen = !!token && isActive && !dismissed && !ended;
  const dateLabel = token ? new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date(token.createdAt)) : "";
  const timeLabel = token ? new Intl.DateTimeFormat("en-IN", { timeStyle: "medium" }).format(new Date(token.createdAt)) : "";
  const items = mode === "sweet" ? ["Gulab jamun", "Other"] : [];

  return <>
    <main className="page-main">
      <section className="page-heading"><p className="eyebrow">{mode === "meal" ? "MEAL SERVING" : "ONE-TIME SWEET"}</p><h1>{mode === "meal" ? "Meal token" : "Sweet token"}</h1><p>{mode === "meal" ? "Choose Veg or Non-Veg, then generate your dinner token just before collecting your meal." : "Choose Gulab jamun or another sweet. Sweet tokens have a separate cooldown from meal tokens."}</p></section>
      <section className="token-create-card panel">
        <div className="token-create-copy"><p className="eyebrow">ONE TOKEN · FIVE MINUTES</p><h2>{mode === "meal" ? "Choose your plate." : "Choose your sweet."}</h2><p>Show the full-screen token to the mess member. It expires automatically after five minutes.</p></div>
        <div className="token-fields">
          {mode === "meal" ? <div className="dinner-only-label"><span>Meal</span><strong>Dinner</strong></div> : <label>Sweet item<select value={offer} onChange={(event) => setOffer(event.target.value)}>{items.map((item) => <option key={item}>{item}</option>)}</select></label>}
          {mode === "meal" && <div className="diet-picker" aria-label="Meal type"><button className={choice === "veg" ? "diet-option selected veg-choice" : "diet-option veg-choice"} type="button" onClick={() => setChoice("veg")}><span className="diet-dot"/><span><strong>Veg</strong><small>Token available daily</small></span></button><button className={choice === "nonveg" ? "diet-option selected nonveg-choice" : "diet-option nonveg-choice"} type="button" onClick={() => setChoice("nonveg")}><span className="diet-dot"/><span><strong>Non-Veg</strong><small>Token available daily</small></span></button></div>}
          {mode === "sweet" && <p className="availability-note">Sweet tokens are available daily and have a separate cooldown from meal tokens.</p>}
          {isBlocked ? <div className="cooldown-box"><span>Next {mode === "meal" ? "meal" : "sweet"} token available in</span><strong>{formatHMS(cooldown)}</strong><small>The cooldown starts when a token is generated.</small></div> : <button className={`button button-primary full-button generate-${kind}`} type="button" onClick={generate}>Generate {mode === "meal" ? `${choice === "veg" ? "Veg" : "Non-Veg"} dinner token` : `${offer} token`} <span>→</span></button>}
        </div>
      </section>
      {token && !isActive && <section className="expired-card panel"><span className="expired-mark">✓</span><div><strong>Previous token expired</strong><p>{token.label} · {dateLabel} at {timeLabel}</p><small>It is treated as collected. You can generate another {mode === "meal" ? "meal" : "sweet"} token when the cooldown ends.</small></div></section>}
    </main>
    {shouldShowFullScreen && token && <section className={`token-overlay token-overlay--${token.kind}`} role="dialog" aria-modal="true" aria-label="Active mess token">
      <button className="token-close" type="button" onClick={() => setDismissed(true)} aria-label="Close token">×</button>
      <p className="token-kicker">SHOW THIS TOKEN TO THE MESS MEMBER</p><h1 className="token-title">{token.label}</h1><div className="token-code-large">{token.code}</div>
      <div className="token-stamp"><span>GENERATED</span><strong>{dateLabel}</strong><strong>{timeLabel}</strong></div><div className="token-timer-label">TOKEN EXPIRES IN</div><div className="token-timer">{formatHMS(token.expiresAt - now)}</div><div className="token-expiry-note">When the timer ends, this token will be treated as collected.</div>
      <button className="token-end-button" type="button" onClick={endToken}>End token</button>
    </section>}
    {ended && token && <section className={`token-overlay token-overlay--${token.kind} token-ended`} role="dialog" aria-modal="true" aria-label="Token ended"><div className="thumbs-up" aria-hidden="true">👍</div><h1 className="token-title">{token.kind === "sweet" ? "Enjoy your treat!" : "Enjoy your meal!"}</h1><p className="token-expiry-note">{token.label} · Token ended</p><button className="token-end-button" type="button" onClick={() => { setEnded(false); setToken(null); setDismissed(true); }}>Exit</button></section>}
  </>;
}
