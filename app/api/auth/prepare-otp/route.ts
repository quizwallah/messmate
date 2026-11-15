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
    const [allowlistResult, profileResult] = await Promise.all([
      admin.from("scholar_allowlist")
        .select("scholar_number, display_name, branch, is_active, linked_auth_user_id")
        .eq("scholar_number", scholarNumber)
        .maybeSingle(),
      admin.from("profiles")
        .select("id, is_active, role")
        .eq("scholar_number", scholarNumber)
        .maybeSingle(),
    ]);
    const { data: allowlistEntry, error: lookupError } = allowlistResult;
    const { data: linkedProfile, error: profileLookupError } = profileResult;

    if (lookupError || profileLookupError || !allowlistEntry?.is_active) {
      if (lookupError) console.error("[auth/prepare-otp] allowlist lookup failed:", lookupError.code ?? "unknown");
      if (profileLookupError) console.error("[auth/prepare-otp] profile lookup failed:", profileLookupError.code ?? "unknown");
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
      if (!linkedProfile || linkedProfile.id !== allowlistEntry.linked_auth_user_id || !linkedProfile.is_active || linkedProfile.role !== "student") {
        return genericFailure();
      }
      // Roster changes already sync profiles through the admin roster flow. Avoid a
      // redundant write here so repeat code requests can reach Auth sooner.
      return NextResponse.json({ ready: true });
    }
    if (linkedProfile) return genericFailure();

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
    const { data: linked, error: linkError } = await admin.rpc("link_approved_student", {
      p_scholar_number: scholarNumber,
      p_user_id: userId,
    });

    if (linkError || linked !== true) {
      if (linkError) console.error("[auth/prepare-otp] account linking failed:", linkError.code ?? "unknown");
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
