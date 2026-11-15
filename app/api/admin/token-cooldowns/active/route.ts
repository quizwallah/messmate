import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

type TokenType = "meal_choice" | "limited_item";
type TokenRow = {
  id: string;
  student_id: string;
  selected_choice: string | null;
  issued_at: string;
  expires_at: string;
  cooldown_until: string;
  token_offerings: { offer_type: TokenType; label: string } | { offer_type: TokenType; label: string }[];
};

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
  const now = new Date().toISOString();
  const rows: TokenRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.from("meal_tokens")
      .select("id, student_id, selected_choice, issued_at, expires_at, cooldown_until, token_offerings!inner(offer_type, label)")
      .gt("cooldown_until", now)
      .order("cooldown_until", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) return NextResponse.json({ error: "Could not load active token cooldowns." }, { status: 500 });
    rows.push(...((data ?? []) as unknown as TokenRow[]));
    if ((data?.length ?? 0) < pageSize) break;
  }

  const latestByStudentType = new Map<string, TokenRow>();
  for (const row of rows) {
    const offering = Array.isArray(row.token_offerings) ? row.token_offerings[0] : row.token_offerings;
    if (!offering || !["meal_choice", "limited_item"].includes(offering.offer_type)) continue;
    const key = `${row.student_id}:${offering.offer_type}`;
    const previous = latestByStudentType.get(key);
    if (!previous || previous.cooldown_until < row.cooldown_until) latestByStudentType.set(key, row);
  }

  const latest = [...latestByStudentType.values()];
  const studentIds = [...new Set(latest.map((row) => row.student_id))];
  const profiles: { id: string; scholar_number: string; full_name: string | null; role: string; is_active: boolean }[] = [];
  for (let offset = 0; offset < studentIds.length; offset += 250) {
    const { data, error } = await admin.from("profiles")
      .select("id, scholar_number, full_name, role, is_active")
      .in("id", studentIds.slice(offset, offset + 250));
    if (error) return NextResponse.json({ error: "Could not load student details for active token cooldowns." }, { status: 500 });
    profiles.push(...(data ?? []));
  }

  const profileById = new Map(profiles.filter((profile) => profile.is_active && profile.role === "student").map((profile) => [profile.id, profile]));
  const activeCooldowns = latest.flatMap((row) => {
    const student = profileById.get(row.student_id);
    const offering = Array.isArray(row.token_offerings) ? row.token_offerings[0] : row.token_offerings;
    if (!student || !offering) return [];
    return [{
      scholarNumber: student.scholar_number,
      fullName: student.full_name,
      tokenType: offering.offer_type,
      label: offering.label,
      choice: row.selected_choice,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      cooldownUntil: row.cooldown_until,
    }];
  }).sort((a, b) => a.cooldownUntil.localeCompare(b.cooldownUntil));

  return NextResponse.json({ activeCooldowns });
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const configuredCode = process.env.TOKEN_COOLDOWN_OVERRIDE_CODE;
  if (!configuredCode) return NextResponse.json({ error: "The admin cooldown confirmation code is not configured on the server." }, { status: 503 });

  try {
    const body = await request.json();
    const scholarNumber = String(body.scholarNumber ?? "").trim();
    const tokenType = body.tokenType as TokenType;
    const suppliedCode = String(body.code ?? "");
    const expected = Buffer.from(configuredCode);
    const supplied = Buffer.from(suppliedCode);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return NextResponse.json({ error: "The admin confirmation code is incorrect." }, { status: 403 });
    }
    if (!scholarNumber || !["meal_choice", "limited_item"].includes(tokenType)) {
      return NextResponse.json({ error: "Choose a valid scholar number and token type." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: student, error: studentError } = await admin.from("profiles")
      .select("id, is_active, role")
      .eq("scholar_number", scholarNumber)
      .maybeSingle();
    if (studentError || !student || !student.is_active || student.role !== "student") {
      return NextResponse.json({ error: "No active student account matches this scholar number." }, { status: 404 });
    }

    const { data: offerings, error: offeringsError } = await admin.from("token_offerings")
      .select("id")
      .eq("offer_type", tokenType);
    if (offeringsError || !offerings?.length) return NextResponse.json({ error: "Could not find token offerings for this token type." }, { status: 500 });

    const { data: updated, error: updateError } = await admin.from("meal_tokens")
      .update({ cooldown_until: new Date().toISOString() })
      .eq("student_id", student.id)
      .in("offering_id", offerings.map((offering) => offering.id))
      .gt("cooldown_until", new Date().toISOString())
      .select("id");
    if (updateError) return NextResponse.json({ error: "Could not reset this student's cooldown." }, { status: 500 });
    if (!updated?.length) return NextResponse.json({ error: "This student no longer has an active cooldown for that token." }, { status: 409 });

    return NextResponse.json({ success: true, updatedTokens: updated.length });
  } catch {
    return NextResponse.json({ error: "Could not reset this student's token cooldown." }, { status: 400 });
  }
}
