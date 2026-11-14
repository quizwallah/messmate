import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { normalizeScholarNumber } from "../../../../lib/auth/scholar";

type RosterEntry = { scholar_number: string; display_name: string; branch: string };
type ExistingScholar = { scholar_number: string; linked_auth_user_id: string | null; is_active: boolean };

async function isAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  return profile?.is_active === true && profile.role === "admin";
}

function validateRoster(input: unknown): { rows?: RosterEntry[]; duplicates?: number; error?: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 2500) {
    return { error: "Import between 1 and 2,500 student records." };
  }
  const byScholar = new Map<string, RosterEntry>();
  let duplicates = 0;
  for (const item of input) {
    const scholarNumber = normalizeScholarNumber(item?.scholarNumber);
    const displayName = String(item?.name ?? "").trim().replace(/\s+/g, " ");
    const branch = String(item?.branch ?? "").trim().replace(/\s+/g, " ");
    if (!scholarNumber || displayName.length < 2 || displayName.length > 120 || branch.length < 1 || branch.length > 120) {
      return { error: "Each row needs a valid scholar number, student name, and branch. Remove headings or incomplete rows." };
    }
    const row = { scholar_number: scholarNumber, display_name: displayName, branch };
    const previous = byScholar.get(scholarNumber);
    if (previous && (previous.display_name !== displayName || previous.branch !== branch)) {
      return { error: `The list has conflicting records for scholar number ${scholarNumber}. Correct the duplicate and retry.` };
    }
    if (previous) duplicates += 1;
    else byScholar.set(scholarNumber, row);
  }
  return { rows: [...byScholar.values()], duplicates };
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("scholar_allowlist").select("scholar_number, display_name, branch, is_active, linked_auth_user_id, created_at").order("scholar_number");
  if (error) return NextResponse.json({ error: "Could not load the approved scholar list." }, { status: 500 });
  return NextResponse.json({ scholars: data ?? [] });
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (Array.isArray(body.students)) {
      const validated = validateRoster(body.students);
      if (!validated.rows) return NextResponse.json({ error: validated.error }, { status: 400 });
      const admin = createAdminClient();
      const { data, error } = await admin.from("scholar_allowlist")
        .upsert(validated.rows.map((row) => ({ ...row, is_active: true })), { onConflict: "scholar_number" })
        .select("scholar_number");
      if (error) return NextResponse.json({ error: "Could not save the student roster. Apply the roster migration and try again." }, { status: 409 });
      return NextResponse.json({ success: true, processed: data?.length ?? validated.rows.length, duplicates: validated.duplicates ?? 0 });
    }

    const scholarNumber = normalizeScholarNumber(body.scholarNumber);
    const displayName = String(body.displayName ?? "").trim();
    const branch = String(body.branch ?? "").trim();
    if (!scholarNumber || displayName.length < 2 || displayName.length > 120 || !branch || branch.length > 120) {
      return NextResponse.json({ error: "Enter a valid scholar number, name, and branch." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: entry, error } = await admin.from("scholar_allowlist").upsert({ scholar_number: scholarNumber, display_name: displayName, branch, is_active: true }, { onConflict: "scholar_number" }).select("linked_auth_user_id").single();
    if (error || !entry) return NextResponse.json({ error: "Could not add this scholar number." }, { status: 409 });
    if (entry.linked_auth_user_id) {
      const { error: profileError } = await admin.from("profiles").update({ is_active: true, full_name: displayName, branch }).eq("id", entry.linked_auth_user_id);
      if (profileError) return NextResponse.json({ error: "Scholar was approved, but account access could not be activated." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not update the approved scholar list." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json();
    const validated = validateRoster(body.students);
    if (!validated.rows) return NextResponse.json({ error: validated.error }, { status: 400 });

    const demoKeep = new Set((process.env.MESSMATE_DEMO_SCHOLARS ?? "").split(",").map(normalizeScholarNumber).filter((value): value is string => Boolean(value)));
    if (demoKeep.size === 0) {
      return NextResponse.json({ error: "To safely preserve demo accounts, configure MESSMATE_DEMO_SCHOLARS before replacing the roster." }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin.from("scholar_allowlist").select("scholar_number, linked_auth_user_id, is_active").limit(10000);
    if (currentError) return NextResponse.json({ error: "Could not read the current roster. No changes were made." }, { status: 500 });
    const existing = (current ?? []) as ExistingScholar[];
    const { data: profiles, error: profilesError } = await admin.from("profiles").select("id, role").limit(10000);
    if (profilesError) return NextResponse.json({ error: "Could not verify protected admin accounts. No changes were made." }, { status: 500 });
    const roleById = new Map((profiles ?? []).map((profile) => [profile.id, profile.role]));
    const rosterNumbers = new Set(validated.rows.map((row) => row.scholar_number));

    const upserted: { scholar_number: string; linked_auth_user_id: string | null }[] = [];
    for (let offset = 0; offset < validated.rows.length; offset += 250) {
      const batch = validated.rows.slice(offset, offset + 250);
      const { data, error } = await admin.from("scholar_allowlist")
        .upsert(batch.map((row) => ({ ...row, is_active: true })), { onConflict: "scholar_number" })
        .select("scholar_number, linked_auth_user_id");
      if (error) return NextResponse.json({ error: "Could not save the full roster. No removed students were deactivated; run the replacement again to finish." }, { status: 409 });
      upserted.push(...(data ?? []));
    }

    const profileByScholar = new Map((upserted ?? []).map((row) => [row.scholar_number, row.linked_auth_user_id]));
    const existingRosterProfiles = validated.rows.flatMap((row) => {
      const id = profileByScholar.get(row.scholar_number);
      return id ? [{ id, full_name: row.display_name, branch: row.branch }] : [];
    });
    for (let offset = 0; offset < existingRosterProfiles.length; offset += 250) {
      const batch = existingRosterProfiles.slice(offset, offset + 250);
      const updates = await Promise.all(batch.map((row) => admin.from("profiles").update({ full_name: row.full_name, branch: row.branch, is_active: true }).eq("id", row.id)));
      if (updates.some((result) => result.error)) return NextResponse.json({ error: "Roster saved, but some existing student profiles could not be synced. Run the roster replacement again." }, { status: 500 });
    }

    const toDeactivate = existing.filter((row) =>
      !rosterNumbers.has(row.scholar_number)
      && !demoKeep.has(row.scholar_number)
      && (!row.linked_auth_user_id || roleById.get(row.linked_auth_user_id) !== "admin"),
    );
    for (let offset = 0; offset < toDeactivate.length; offset += 250) {
      const batch = toDeactivate.slice(offset, offset + 250);
      const numbers = batch.map((row) => row.scholar_number);
      const { error: allowlistError } = await admin.from("scholar_allowlist").update({ is_active: false }).in("scholar_number", numbers);
      if (allowlistError) return NextResponse.json({ error: "Roster saved, but some removed students could not be deactivated. Run the replacement again." }, { status: 500 });
      const linkedIds = batch.map((row) => row.linked_auth_user_id).filter((id): id is string => Boolean(id));
      if (linkedIds.length) {
        const { error: profileError } = await admin.from("profiles").update({ is_active: false }).in("id", linkedIds);
        if (profileError) return NextResponse.json({ error: "Roster saved, but some removed accounts could not be deactivated. Run the replacement again." }, { status: 500 });
      }
    }

    const newNumbers = new Set(existing.map((row) => row.scholar_number));
    const added = validated.rows.filter((row) => !newNumbers.has(row.scholar_number)).length;
    const updated = validated.rows.length - added;
    const deactivated = toDeactivate.filter((row) => row.is_active).length;
    return NextResponse.json({ success: true, added, updated, deactivated, demosPreserved: demoKeep.size, duplicates: validated.duplicates ?? 0, retainedHistory: true, linked: upserted?.length ?? 0 });
  } catch {
    return NextResponse.json({ error: "Could not replace the student roster." }, { status: 400 });
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
