"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteShell from "./site-shell";
import { mealTimes, menuMealLabels, messMenu } from "../mess-menu";

function indiaWeekdayIndex() {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date()).toUpperCase();
  const index = messMenu.findIndex((day) => day.day === weekday);
  return index >= 0 ? index : 0;
}

function indiaDateLabel() {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
}

export default function HomeTodayContent({ initialTodayIndex }: { initialTodayIndex: number }) {
  const [todayIndex, setTodayIndex] = useState(initialTodayIndex >= 0 ? initialTodayIndex : 0);
  const [todayDate, setTodayDate] = useState("");

  useEffect(() => {
    const updateIndiaDate = () => {
      setTodayIndex(indiaWeekdayIndex());
      setTodayDate(indiaDateLabel());
    };
    updateIndiaDate();
    const timer = window.setInterval(updateIndiaDate, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayMenu = messMenu[todayIndex] ?? messMenu[0];
  const meals = todayMenu.meals.map((items, index) => ({
    name: menuMealLabels[index],
    time: index === 0 ? (todayIndex < 5 ? "7:30–9:00 AM" : "8:30–10:00 AM") : [mealTimes.breakfast, mealTimes.lunch, mealTimes.snacks, mealTimes.dinner][index],
    items,
    mark: ["☀", "◒", "☕", "✳"][index],
    color: ["yellow", "green", "orange", "pink"][index],
  }));

  return <SiteShell><main className="page-main">
    <section className="page-heading home-heading"><p className="eyebrow"><i className="live-dot"/> DR APJ ABDUL KALAM BLOCK · H10 CD</p><h1>Good food. <em>Good day.</em></h1><p>Your mess, at a glance. Here’s what’s cooking today.</p><p className="today-schedule"><strong>{todayMenu.day.charAt(0) + todayMenu.day.slice(1).toLowerCase()}</strong>{todayDate ? ` · ${todayDate}` : ""} menu · Token options remain available daily if the menu changes.</p></section>
    <section className="today-layout"><div className="menu-panel panel"><div className="section-heading"><div><p className="eyebrow">ON THE MENU</p><h2>Today’s meals</h2></div><span className="today-pill">● Menu live</span></div><div className="meal-list">{meals.map((meal) => <article className="meal-row" key={meal.name}><div className="meal-time"><span>{meal.name.toUpperCase()}</span><small>{meal.time}</small></div><div className="meal-info"><strong>{meal.name === "Dinner" ? "Evening meal" : meal.name === "Lunch" ? "Lunch" : meal.name === "Snacks" ? "Evening snacks" : "Morning meal"}</strong><span>{meal.items}</span></div><span className={`meal-icon ${meal.color}`}>{meal.mark}</span></article>)}</div><p className="menu-note">ⓘ &nbsp;Menu may change based on ingredient availability.</p></div>
      <aside className="today-aside"><Link href="/weekly-menu" className="feature-link panel"><span className="feature-icon">▦</span><span><strong>See the weekly menu</strong><small>Plan meals for the whole week</small></span><b>→</b></Link><Link href="/meal-token" className="feature-link panel"><span className="feature-icon green-feature">◉</span><span><strong>Veg / Non-Veg token</strong><small>Both token choices available daily</small></span><b>→</b></Link><Link href="/sweet-token" className="feature-link panel"><span className="feature-icon yellow-feature">●</span><span><strong>Sweet token</strong><small>Gulab jamun or Other · separate cooldown</small></span><b>→</b></Link><Link href="/availability" className="feature-link panel"><span className="feature-icon">✈</span><span><strong>Going on a break?</strong><small>Share dates to help mess planning</small></span><b>→</b></Link></aside>
    </section>
    <section className="home-note panel"><span>✳</span><div><strong>Help the mess plan better</strong><p>Share food feedback or report a serious concern from the Feedback page.</p></div><Link href="/feedback" className="text-link">Open feedback →</Link></section>
    <div className="home-action-links"><Link href="/updates" className="feature-link panel"><span className="feature-icon">↗</span><span><strong>Mess updates</strong><small>Announcements from admin, convenor and warden</small></span><b>→</b></Link><Link href="/other-complaints" className="feature-link panel"><span className="feature-icon">⌂</span><span><strong>Report a floor or room issue</strong><small>Electricity, sanitation and other maintenance issues</small></span><b>→</b></Link></div>
  </main></SiteShell>;
}
