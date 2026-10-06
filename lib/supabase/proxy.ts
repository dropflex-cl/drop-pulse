import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { isSelfAuthenticatedMcpRoute } from "../product-intelligence/public-routes";
import { isMerchantSessionClaims } from "./merchant-claims";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = isMerchantSessionClaims(data?.claims) ? data.claims : null;

  const path = request.nextUrl.pathname;
  // Rutas que se autentican solas (docs/spec-migracion-conexiones.md, D1): webhooks por HMAC o
  // signed_request, el cron por bearer, Shopify por HMAC y MCP por su verificador OAuth.
  // La metadata MCP exacta es pública; consentimiento y revocación requieren sesión merchant.
  const selfAuthenticated =
    path.startsWith("/api/webhooks/") || path.startsWith("/api/cron/") || path === "/api/onboarding/shopify/install" || isSelfAuthenticatedMcpRoute(path);

  if (path !== "/" && !user && !selfAuthenticated && !path.startsWith("/login") && !path.startsWith("/auth")) {
    // La API responde 401 en JSON (el cliente muestra el mensaje); un 307 al login no le sirve a fetch.
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Tu sesión terminó. Inicia sesión para seguir." }, { status: 401 });
    }
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    // Para volver a donde iba después de iniciar sesión (solo rutas internas; ver LoginForm).
    url.search = new URLSearchParams({ next: `${path}${request.nextUrl.search}` }).toString();
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
