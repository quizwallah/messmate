import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { normalizeScholarNumber } from "../../../../lib/auth/scholar";

async function isAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  return profile?.is_active === true && profile.role === "admin";
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("scholar_allowlist").select("scholar_number, display_name, is_active, linked_auth_user_id, created_at").order("scholar_number");
  if (error) return NextResponse.json({ error: "Could not load the approved scholar list." }, { status: 500 });
  return NextResponse.json({ scholars: data ?? [] });
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json();
    const scholarNumber = normalizeScholarNumber(body.scholarNumber);
    const displayName = String(body.displayName ?? "").trim();
    if (!scholarNumber || displayName.length < 2 || displayName.length > 120) {
      return NextResponse.json({ error: "Enter a valid scholar number and name." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: entry, error } = await admin.from("scholar_allowlist").upsert({ scholar_number: scholarNumber, display_name: displayName, is_active: true }, { onConflict: "scholar_number" }).select("linked_auth_user_id").single();
    if (error || !entry) return NextResponse.json({ error: "Could not add this scholar number." }, { status: 409 });
    if (entry.linked_auth_user_id) {
      const { error: profileError } = await admin.from("profiles").update({ is_active: true }).eq("id", entry.linked_auth_user_id);
      if (profileError) return NextResponse.json({ error: "Scholar was approved, but account access could not be activated." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not add this scholar number." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json();
    const scholarNumber = normalizeScholarNumber(body.scholarNumber);
    if (!scholarNumber) return NextResponse.json({ error: "Choose a valid scholar number." }, { status: 400 });
    const admin = createAdminClient();
    const { data: entry, error: entryError } = await admin.from("scholar_allowlist").select("is_active, linked_auth_user_id").eq("scholar_number", scholarNumber).maybeSingle();
    if (entryError || !entry) return NextResponse.json({ error: "Could not find this scholar." }, { status: 404 });

    if (typeof body.isActive === "boolean") {
      if (entry.linked_auth_user_id) {
        const { data: profile } = await admin.from("profiles").select("role").eq("id", entry.linked_auth_user_id).maybeSingle();
        if (profile?.role === "admin") return NextResponse.json({ error: "The admin account cannot be deactivated here." }, { status: 403 });
      }
      const { error: allowlistError } = await admin.from("scholar_allowlist").update({ is_active: body.isActive }).eq("scholar_number", scholarNumber);
      if (allowlistError) return NextResponse.json({ error: "Could not update scholar access." }, { status: 409 });
      if (entry.linked_auth_user_id) {
        const { error } = await admin.from("profiles").update({ is_active: body.isActive }).eq("id", entry.linked_auth_user_id);
        if (error) return NextResponse.json({ error: "Scholar updated, but profile status could not be synced." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const role = body.role;
    if (!["student", "convenor", "warden"].includes(role)) {
      return NextResponse.json({ error: "Choose Student, Convenor, or Warden." }, { status: 400 });
    }
    if (!entry.linked_auth_user_id) return NextResponse.json({ error: "This scholar must finish first login before receiving a staff role." }, { status: 409 });
    const { data: currentProfile, error: profileLookupError } = await admin.from("profiles").select("role, is_active").eq("id", entry.linked_auth_user_id).maybeSingle();
    if (profileLookupError || !currentProfile || !currentProfile.is_active) return NextResponse.json({ error: "Only an active linked account can be assigned a role." }, { status: 409 });
    if (currentProfile.role === "admin") return NextResponse.json({ error: "The admin role cannot be changed here." }, { status: 403 });
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", entry.linked_auth_user_id);
    if (roleError) return NextResponse.json({ error: "Could not update the account role." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not update this scholar." }, { status: 400 });
  }
}
