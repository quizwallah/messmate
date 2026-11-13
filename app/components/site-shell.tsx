"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import ThemeToggle from "./theme-toggle";

const links = [
  ["/", "Today"],
  ["/weekly-menu", "Weekly menu"],
  ["/meal-token", "Meal token"],
  ["/sweet-token", "Sweet token"],
  ["/availability", "Break plans"],
  ["/feedback", "Feedback"],
  ["/updates", "Updates"],
];

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [scholarNumber, setScholarNumber] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    const loadProfile = async (id: string) => {
      const { data: profile } = await supabase.from("profiles").select("scholar_number, full_name, role").eq("id", id).maybeSingle();
      if (disposed) return;
      setScholarNumber(profile?.scholar_number ?? null);
      setFullName(profile?.full_name ?? null);
      setRole(profile?.role ?? null);
    };
    const clearProfile = () => {
      if (disposed) return;
      setScholarNumber(null);
      setFullName(null);
      setRole(null);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id;
      if (!id) { clearProfile(); return; }
      window.setTimeout(() => { void loadProfile(id); }, 0);
    });
    return () => { disposed = true; subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setScholarNumber(null);
    window.location.assign("/");
  }

  return <>
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark">M</span><span>mess<span className="brand-light">mate</span></span></Link>
      <nav aria-label="Main navigation">
        {(role && role !== "student" ? links.filter(([href]) => ["/", "/weekly-menu", "/updates"].includes(href)) : scholarNumber ? links : links.filter(([href]) => ["/", "/weekly-menu", "/updates"].includes(href))).map(([href, label]) => <Link className={pathname === href ? "active" : ""} href={href} key={href}>{label}</Link>)}
        {scholarNumber && role === "student" && <Link className={pathname === "/my-complaints" ? "active" : ""} href="/my-complaints">My complaints</Link>}
        {role && role !== "student" && <Link className={pathname.startsWith("/portal") ? "active" : ""} href="/portal">Staff portal</Link>}
      </nav>
      {!pathname.startsWith("/staff/login") && !pathname.startsWith("/portal") && <Link className="admin-entry-link" href="/staff/login"><span className="admin-entry-icon" aria-hidden="true">▣</span><span>Admin Portal</span><b aria-hidden="true">→</b></Link>}
      <ThemeToggle />
      <span className="profile"><span className="avatar">{(fullName ?? scholarNumber)?.charAt(0) ?? "S"}</span><span className="profile-name">{fullName ?? scholarNumber ?? "Student"}</span>{scholarNumber ? <button className="profile-action" type="button" onClick={signOut}>Sign out</button> : <Link className="profile-action" href="/login">Sign in</Link>}</span>
    </header>
    {children}
    <footer><Link className="brand footer-brand" href="/"><span className="brand-mark">M</span><span>mess<span className="brand-light">mate</span></span></Link><span>Made for better days at the mess.</span><span>Questions? Contact your mess convenor. · <Link href="/staff/login">Admin Portal</Link></span></footer>
  </>;
}
