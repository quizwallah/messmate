"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "messmate-theme";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
  }, []);

  function toggle() {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    localStorage.setItem(THEME_KEY, nextDark ? "dark" : "light");
  }

  return <button className="theme-toggle" type="button" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
    <span aria-hidden="true">{dark ? "☀" : "☾"}</span><span className="theme-toggle-label">{dark ? "Light" : "Dark"}</span>
  </button>;
}
