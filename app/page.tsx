import Link from "next/link";
import SiteShell from "./components/site-shell";
import { getIndiaWeekday, mealTimes, menuMealLabels, messMenu } from "./mess-menu";
import { createClient } from "../lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let staffRole: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    if (profile?.is_active && ["admin", "convenor", "warden", "committee"].includes(profile.role)) staffRole = profile.role;
  }
  const todayIndex = getIndiaWeekday();
  const todayMenu = messMenu[todayIndex] ?? messMenu[0];
  const meals = todayMenu.meals.map((items, index) => ({
    name: menuMealLabels[index],
    time: index === 0 ? (todayIndex < 5 ? "7:30–9:00 AM" : "8:30–10:00 AM") : [mealTimes.breakfast, mealTimes.lunch, mealTimes.snacks, mealTimes.dinner][index],
    items,
    mark: ["☀", "◒", "☕", "✳"][index],
    color: ["sun", "leaf", "tea", "rose"][index],
  }));
  return <SiteShell><main className="page-main">
    <section className="page-heading home-heading"><p className="eyebrow"><i className="live-dot"/> DR APJ ABDUL KALAM BLOCK · H10 CD</p><h1>Good food. <em>Good day.</em></h1><p>Your mess, at a glance. Here’s what’s cooking today.</p><p className="today-schedule">{todayMenu.day.charAt(0) + todayMenu.day.slice(1).toLowerCase()} menu · Token options remain available daily if the menu changes.</p></section>
    <section className="today-layout"><div className="menu-panel panel"><div className="section-heading"><div><p className="eyebrow">ON THE MENU</p><h2>Today’s meals</h2></div><span className="today-pill">● Menu live</span></div><div className="meal-list">{meals.map((meal) => <article className="meal-row" key={meal.name}><div className="meal-time"><span>{meal.name.toUpperCase()}</span><small>{meal.time}</small></div><div className="meal-info"><strong>{meal.name === "Dinner" ? "Evening meal" : meal.name === "Lunch" ? "Lunch" : meal.name === "Snacks" ? "Evening snacks" : "Morning meal"}</strong><span>{meal.items}</span></div><span className={`meal-icon ${meal.color}`}>{meal.mark}</span></article>)}</div><p className="menu-note">ⓘ &nbsp;Menu may change based on ingredient availability.</p></div>
      <aside className="today-aside"><Link href="/weekly-menu" className="feature-link panel"><span className="feature-icon">▦</span><span><strong>See the weekly menu</strong><small>Plan meals for the whole week</small></span><b>→</b></Link>{staffRole ? <><Link href="/portal" className="feature-link panel"><span className="feature-icon green-feature">▤</span><span><strong>Open staff portal</strong><small>Complaints, feedback and mess records</small></span><b>→</b></Link><Link href="/updates" className="feature-link panel"><span className="feature-icon yellow-feature">↗</span><span><strong>Mess updates</strong><small>Publish and review announcements</small></span><b>→</b></Link></> : <><Link href="/meal-token" className="feature-link panel"><span className="feature-icon green-feature">◉</span><span><strong>Veg / Non-Veg token</strong><small>Both token choices available daily</small></span><b>→</b></Link><Link href="/sweet-token" className="feature-link panel"><span className="feature-icon yellow-feature">●</span><span><strong>Sweet token</strong><small>Gulab jamun or Other · separate cooldown</small></span><b>→</b></Link><Link href="/availability" className="feature-link panel"><span className="feature-icon">✈</span><span><strong>Going on a break?</strong><small>Share dates to help mess planning</small></span><b>→</b></Link></>}</aside>
    </section>
    {!staffRole && <><section className="home-note panel"><span>✳</span><div><strong>Help the mess plan better</strong><p>Share food feedback or report a serious concern from the Feedback page.</p></div><Link href="/feedback" className="text-link">Open feedback →</Link></section>
    <div className="home-action-links"><Link href="/updates" className="feature-link panel"><span className="feature-icon">↗</span><span><strong>Mess updates</strong><small>Announcements from admin, convenor and warden</small></span><b>→</b></Link><Link href="/other-complaints" className="feature-link panel"><span className="feature-icon">⌂</span><span><strong>Report a floor or room issue</strong><small>Electricity, sanitation and other maintenance issues</small></span><b>→</b></Link></div></>}
  </main></SiteShell>;
}
