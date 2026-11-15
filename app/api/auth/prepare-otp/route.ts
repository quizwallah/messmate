import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { normalizeScholarNumber, scholarEmail } from "../../../../lib/auth/scholar";

const genericFailure = () => NextResponse.json(
  { ready: false },
  { status: 200 },
);

export async function POST(request: Request) {
  let failureStage = "request";
  try {
    const body = await request.json();
    const scholarNumber = normalizeScholarNumber(body.scholarNumber);
    if (!scholarNumber) return genericFailure();

    failureStage = "allowlist";
    const admin = createAdminClient();
    const { data: allowlistEntry, error: lookupError } = await admin
      .from("scholar_allowlist")
      .select("scholar_number, display_name, branch, is_active, linked_auth_user_id")
      .eq("scholar_number", scholarNumber)
      .maybeSingle();

    if (lookupError || !allowlistEntry?.is_active) {
      if (lookupError) console.error("[auth/prepare-otp] allowlist lookup failed:", lookupError.code ?? "unknown");
      return genericFailure();
    }

    const demoScholars = new Set(
      (process.env.MESSMATE_DEMO_SCHOLARS ?? "")
        .split(",")
        .map((value) => normalizeScholarNumber(value))
        .filter((value): value is string => Boolean(value)),
    );
    if (process.env.MESSMATE_DEMO_LOGIN === "true" && demoScholars.has(scholarNumber)) {
      return NextResponse.json({ ready: true, demoMode: true });
    }

    if (allowlistEntry.linked_auth_user_id) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("is_active, role")
        .eq("id", allowlistEntry.linked_auth_user_id)
        .maybeSingle();
      if (profileError || !profile?.is_active || profile.role !== "student") {
        if (profileError) console.error("[auth/prepare-otp] linked profile lookup failed:", profileError.code ?? "unknown");
        return genericFailure();
      }
      // Roster changes already sync profiles through the admin roster flow. Avoid a
      // redundant write here so repeat code requests can reach Auth sooner.
      return NextResponse.json({ ready: true });
    }

    failureStage = "create-account";
    const email = scholarEmail(scholarNumber);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { scholar_number: scholarNumber },
    });
    if (createError || !created.user) {
      console.error("[auth/prepare-otp] account creation failed:", createError?.code ?? "unknown");
      return genericFailure();
    }

    const userId = created.user.id;
    failureStage = "create-profile";
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      scholar_number: scholarNumber,
      full_name: allowlistEntry.display_name,
      branch: allowlistEntry.branch,
      role: "student",
      is_active: true,
    });
    if (profileError) {
      console.error("[auth/prepare-otp] profile creation failed:", profileError.code ?? "unknown");
      await admin.auth.admin.deleteUser(userId);
      return genericFailure();
    }

    failureStage = "link-account";
    const { data: linked, error: linkError } = await admin
      .from("scholar_allowlist")
      .update({ linked_auth_user_id: userId })
      .eq("scholar_number", scholarNumber)
      .eq("is_active", true)
      .is("linked_auth_user_id", null)
      .select("scholar_number")
      .maybeSingle();

    if (linkError || !linked) {
      if (linkError) console.error("[auth/prepare-otp] account linking failed:", linkError.code ?? "unknown");
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return genericFailure();
    }

    return NextResponse.json({ ready: true });
  } catch {
    // Keep student details and provider error text out of logs and responses.
    console.error("[auth/prepare-otp] account preparation failed at stage:", failureStage);
    return genericFailure();
  }
}
