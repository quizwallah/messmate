import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function redirectWithAuthState(url: URL, source: NextResponse) {
  const response = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) {
    response.cookies.set(cookie.name, cookie.value, cookie);
  }
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(name);
    if (value) response.headers.set(name, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const studentPath = ["/meal-token", "/sweet-token", "/availability", "/feedback", "/other-complaints", "/my-complaints"]
    .some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`));
  const staffPath = request.nextUrl.pathname === "/portal" || request.nextUrl.pathname.startsWith("/portal/");

  let activeStudent = false;
  let activeStaff = false;
  if ((studentPath || staffPath) && data?.claims?.sub) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active, role")
      .eq("id", data.claims.sub)
      .maybeSingle();
    activeStudent = profile?.is_active === true && profile.role === "student";
    activeStaff = profile?.is_active === true && ["admin", "convenor", "warden", "committee"].includes(profile.role);
  }

  if (studentPath && activeStaff) {
    const portalUrl = request.nextUrl.clone();
    portalUrl.pathname = "/portal";
    portalUrl.search = "";
    return redirectWithAuthState(portalUrl, response);
  }

  if (studentPath && !activeStudent) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return redirectWithAuthState(loginUrl, response);
  }

  if (staffPath && !activeStaff) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = activeStudent ? "/" : "/staff/login";
    loginUrl.searchParams.delete("next");
    return redirectWithAuthState(loginUrl, response);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/meal-token/:path*",
    "/sweet-token/:path*",
    "/availability/:path*",
    "/feedback/:path*",
    "/other-complaints/:path*",
    "/my-complaints/:path*",
    "/portal/:path*",
  ],
};
