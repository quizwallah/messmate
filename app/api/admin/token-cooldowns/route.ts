import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

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
  const { data, error } = await admin.from("token_cooldown_settings")
    .select("meal_choice_seconds, limited_item_seconds")
    .eq("singleton", true)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not load token cooldowns. Apply the latest Supabase migration." }, { status: 500 });

  return NextResponse.json({ settings: { meal_choice: data.meal_choice_seconds, limited_item: data.limited_item_seconds } });
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
    const { data, error } = await admin.from("token_cooldown_settings").update({
      meal_choice_seconds: mealChoiceSeconds,
      limited_item_seconds: limitedItemSeconds,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true).select("singleton").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Could not save token cooldowns. Apply the latest Supabase migration and try again." }, { status: 500 });
    return NextResponse.json({ success: true, settings: { meal_choice: mealChoiceSeconds, limited_item: limitedItemSeconds } });
  } catch {
    return NextResponse.json({ error: "Could not save token cooldowns." }, { status: 400 });
  }
}
