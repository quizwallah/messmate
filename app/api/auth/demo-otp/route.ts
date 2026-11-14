import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { normalizeScholarNumber, scholarEmail } from "../../../../lib/auth/scholar";

const failure = (message = "Demo sign-in is unavailable.", status = 400) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  try {
    if (process.env.MESSMATE_DEMO_LOGIN !== "true") {
      return failure("Temporary demo sign-in is disabled.", 404);
    }

    const expectedCode = process.env.MESSMATE_DEMO_OTP_CODE;
    const allowedScholars = new Set(
      (process.env.MESSMATE_DEMO_SCHOLARS ?? "")
        .split(",")
        .map((value) => normalizeScholarNumber(value))
        .filter((value): value is string => Boolean(value)),
    );
    if (!expectedCode || !/^\d{6}$/.test(expectedCode) || allowedScholars.size === 0) {
      return failure("Demo sign-in is not configured on the server.", 503);
    }

    const body = await request.json();
    const scholarNumber = normalizeScholarNumber(body.scholarNumber);
    const code = String(body.code ?? "");
    if (!scholarNumber || !allowedScholars.has(scholarNumber) || code.length !== 6 || code !== expectedCode) {
      return failure("The test code is incorrect or this account is not enabled for testing.", 401);
    }

    const admin = createAdminClient();
    const { data: allowlistEntry, error: lookupError } = await admin
      .from("scholar_allowlist")
      .select("scholar_number, display_name, branch, is_active, linked_auth_user_id")
      .eq("scholar_number", scholarNumber)
      .maybeSingle();
    if (lookupError || !allowlistEntry?.is_active) return failure("This demo account is not active.", 403);

    let userId = allowlistEntry.linked_auth_user_id;
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: scholarEmail(scholarNumber),
        email_confirm: true,
        user_metadata: { scholar_number: scholarNumber },
      });
      if (createError || !created.user) return failure("Could not prepare this demo account.", 409);
      userId = created.user.id;

      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        scholar_number: scholarNumber,
        full_name: allowlistEntry.display_name,
        branch: allowlistEntry.branch,
        verified_email: scholarEmail(scholarNumber),
        first_login_at: new Date().toISOString(),
        role: "student",
        is_active: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        return failure("Could not prepare this demo account.", 409);
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
        return failure("Could not prepare this demo account.", 409);
      }
    }

    const temporaryPassword = randomBytes(32).toString("base64url");
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      password: temporaryPassword,
    });
    if (updateError) return failure("Could not sign in to this demo account.", 409);

    return NextResponse.json({ temporaryPassword });
  } catch {
    return failure();
  }
}
