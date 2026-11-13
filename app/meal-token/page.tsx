import SiteShell from "../components/site-shell";
import TokenGenerator from "../components/token-generator";

export default function MealTokenPage() {
  return <SiteShell><TokenGenerator mode="meal" /></SiteShell>;
}
