import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { normalizeScholarNumber, scholarEmail } from "../../../../lib/auth/scholar";

const genericFailure = () => NextResponse.json(
  { ready: true },
  { status: 200 },
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const scholarNumber = normalizeScholarNumber(body.scholarNumber);
    if (!scholarNumber) return genericFailure();

    const admin = createAdminClient();
    const { data: allowlistEntry, error: lookupError } = await admin
      .from("scholar_allowlist")
      .select("scholar_number, is_active, linked_auth_user_id")
      .eq("scholar_number", scholarNumber)
      .maybeSingle();

    if (lookupError || !allowlistEntry?.is_active) return genericFailure();

    if (allowlistEntry.linked_auth_user_id) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("is_active")
        .eq("id", allowlistEntry.linked_auth_user_id)
        .maybeSingle();
      if (profileError || !profile?.is_active) return genericFailure();
      return NextResponse.json({ ready: true });
    }

    const email = scholarEmail(scholarNumber);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { scholar_number: scholarNumber },
    });
    if (createError || !created.user) return genericFailure();

    const userId = created.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      scholar_number: scholarNumber,
      role: "student",
      is_active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return genericFailure();
    }

    const { data: linked, error: linkError } = await admin
      .from("scholar_allowlist")
      .update({ linked_auth_user_id: userId })
      .eq("scholar_number", scholarNumber)
      .eq("is_active", true)
      .is("linked_auth_user_id", null)
      .select("scholar_number")
      .maybeSingle();

    if (linkError || !linked) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return genericFailure();
    }

    return NextResponse.json({ ready: true });
  } catch {
    return genericFailure();
  }
}
