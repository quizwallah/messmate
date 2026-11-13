import SiteShell from "../components/site-shell";
import TokenGenerator from "../components/token-generator";

export default function SweetTokenPage() {
  return <SiteShell><TokenGenerator mode="sweet" /></SiteShell>;
}
