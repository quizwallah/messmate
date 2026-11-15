import HomeTodayContent from "./components/home-today-content";
import { getIndiaWeekday } from "./mess-menu";

export const dynamic = "force-dynamic";

export default function Home() {
  return <HomeTodayContent initialTodayIndex={getIndiaWeekday()} />;
}
