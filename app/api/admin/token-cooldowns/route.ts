import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

type OfferType = "meal_choice" | "limited_item";
const offerTypes: OfferType[] = ["meal_choice", "limited_item"];

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
  const { data, error } = await admin.from("token_offerings").select("offer_type, cooldown_seconds");
  if (error) return NextResponse.json({ error: "Could not load token cooldowns." }, { status: 500 });

  const settings = Object.fromEntries(offerTypes.map((type) => {
    const values = (data ?? []).filter((row) => row.offer_type === type).map((row) => row.cooldown_seconds);
    return [type, values[0] ?? 30];
  }));
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  try {
    const body = await request.json();
    const mealChoiceSeconds = Number(body.mealChoiceSeconds);
    const limitedItemSeconds = Number(body.limitedItemSeconds);
    if (![mealChoiceSeconds, limitedItemSeconds].every((value) => Number.isInteger(value) && value >= 1 && value <= 604800)) {
      return NextResponse.json({ error: "Enter a whole number of seconds from 1 to 604,800 for each token." }, { status: 400 });
    }

    const admin = createAdminClient();
    for (const [offerType, cooldown] of [["meal_choice", mealChoiceSeconds], ["limited_item", limitedItemSeconds]] as const) {
      const { error } = await admin.from("token_offerings").update({ cooldown_seconds: cooldown }).eq("offer_type", offerType);
      if (error) return NextResponse.json({ error: "Could not save token cooldowns. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ success: true, settings: { meal_choice: mealChoiceSeconds, limited_item: limitedItemSeconds } });
  } catch {
    return NextResponse.json({ error: "Could not save token cooldowns." }, { status: 400 });
  }
}
