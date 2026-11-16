import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const staffRoles = ["admin", "convenor", "warden", "committee"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active || !staffRoles.includes(profile.role)) {
    return NextResponse.json({ error: "Active staff access required." }, { status: 403 });
  }

  const { count, error } = await createAdminClient().from("scholar_allowlist")
    .select("scholar_number", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) return NextResponse.json({ error: "Could not count active students." }, { status: 500 });
  return NextResponse.json({ activeCount: count ?? 0 });
}
