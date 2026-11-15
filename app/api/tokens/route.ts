import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

type TokenType = "meal_choice" | "limited_item";

async function getActiveStudent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again to use meal tokens.", status: 401 as const };
  const { data: profile, error } = await supabase.from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile?.is_active || profile.role !== "student") {
    return { error: "An active student account is required to use meal tokens.", status: 403 as const };
  }
  return { supabase, user };
}

export async function GET(request: Request) {
  const session = await getActiveStudent();
  if ("error" in session) return NextResponse.json({ error: session.error }, { status: session.status });

  const type = new URL(request.url).searchParams.get("type");
  if (type !== "meal_choice" && type !== "limited_item") {
    return NextResponse.json({ error: "Choose a valid token type." }, { status: 400 });
  }

  const { data, error } = await session.supabase.from("meal_tokens")
    .select("cooldown_until, token_offerings!inner(offer_type)")
    .eq("student_id", session.user.id)
    .eq("token_offerings.offer_type", type)
    .order("cooldown_until", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load your token status." }, { status: 500 });

  return NextResponse.json({ cooldownUntil: data?.cooldown_until ?? null });
}

export async function POST(request: Request) {
  const session = await getActiveStudent();
  if ("error" in session) return NextResponse.json({ error: session.error }, { status: session.status });

  try {
    const body = await request.json();
    const mode = body.mode;
    let type: TokenType;
    let choice: "veg" | "non_veg" | null = null;
    let label: string;

    if (mode === "meal") {
      if (body.choice !== "veg" && body.choice !== "non_veg") {
        return NextResponse.json({ error: "Choose Veg or Non-Veg before generating a token." }, { status: 400 });
      }
      type = "meal_choice";
      choice = body.choice;
      label = "Dinner";
    } else if (mode === "sweet") {
      if (body.sweetItem !== "Gulab jamun" && body.sweetItem !== "Other") {
        return NextResponse.json({ error: "Choose Gulab jamun or Other." }, { status: 400 });
      }
      type = "limited_item";
      label = body.sweetItem;
    } else {
      return NextResponse.json({ error: "Choose a valid token type." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: mealId, error: setupError } = await admin.rpc("ensure_today_token_offerings");
    if (setupError || !mealId) {
      return NextResponse.json({ error: "Token database setup is unavailable. Contact the mess administrator." }, { status: 503 });
    }

    const { data: offering, error: offeringError } = await admin.from("token_offerings")
      .select("id")
      .eq("meal_id", mealId)
      .eq("offer_type", type)
      .eq("label", label)
      .eq("is_active", true)
      .maybeSingle();
    if (offeringError || !offering) {
      return NextResponse.json({ error: "This token option is not available today." }, { status: 409 });
    }

    const { data: token, error: tokenError } = await session.supabase.rpc("generate_mess_token", {
      p_offering_id: offering.id,
      p_choice: choice,
    });
    if (tokenError || !token) {
      const cooldownError = tokenError?.message.includes("A new token is available after") ?? false;
      return NextResponse.json({ error: tokenError?.message || "Could not generate a token." }, { status: cooldownError ? 409 : 400 });
    }

    return NextResponse.json({
      token: {
        code: token.token_code,
        kind: mode === "sweet" ? "sweet" : choice === "veg" ? "veg" : "nonveg",
        label: mode === "sweet" ? label : `Dinner · ${choice === "veg" ? "Veg" : "Non-Veg"}`,
        issuedAt: token.issued_at,
        expiresAt: token.expires_at,
        cooldownUntil: token.cooldown_until,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not generate a token. Please try again." }, { status: 400 });
  }
}
