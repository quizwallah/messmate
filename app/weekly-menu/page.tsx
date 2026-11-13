import SiteShell from "../components/site-shell";
import { mealTimes, menuMealLabels, messMenu } from "../mess-menu";

const headers = ["Day", `${menuMealLabels[0]}\n${mealTimes.breakfast}`, `${menuMealLabels[1]}\n${mealTimes.lunch}`, `${menuMealLabels[2]}\n${mealTimes.snacks}`, `${menuMealLabels[3]}\n${mealTimes.dinner}`];

export default function WeeklyMenuPage() {
  return <SiteShell><main className="page-main">
    <section className="page-heading"><p className="eyebrow">DR APJ ABDUL KALAM BLOCK · H10 CD</p><h1>Weekly mess menu</h1><p>Official weekly menu and serving times. Breakfast is served at different times on weekdays and weekends.</p></section>
    <section className="weekly-menu panel"><div className="weekly-head">{headers.map((label) => <strong key={label}>{label.split("\n").map((line) => <span key={line}>{line}</span>)}</strong>)}</div>{messMenu.map((day) => <div className="weekly-row" key={day.day}><strong>{day.day}</strong>{day.meals.map((item, index) => <span key={index}>{item}</span>)}</div>)}</section>
    <p className="fine-print left-note">Menu provided by the mess. Items may change if ingredients are unavailable.</p>
  </main></SiteShell>;
}
