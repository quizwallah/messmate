import type { Metadata } from "next";
import "./globals.css";
import "./features.css";
import "./portal.css";

export const metadata: Metadata = {
  title: "messmate | Hostel Mess",
  description: "Today’s hostel mess menu, meal tokens, feedback, and break planning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
