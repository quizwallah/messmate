import type { Metadata } from "next";
import "./globals.css";
import "./features.css";
import "./portal.css";
import "./dark-theme.css";
import SiteShell from "./components/site-shell";

export const metadata: Metadata = {
  title: "messmate | Hostel Mess",
  description: "Today’s hostel mess menu, meal tokens, feedback, and break planning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("messmate-theme")==="dark"?"dark":"light"}catch{}` }} />
      </head>
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
