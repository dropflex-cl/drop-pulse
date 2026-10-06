import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { isMerchantSessionClaims } from "@/lib/supabase/merchant-claims";

/**
 * Defensa adicional al proxy (que ya redirige sin sesión): valida la sesión en el servidor.
 * Igual que el proxy, no hace nada si Supabase no está configurado. Va dentro de <Suspense>.
 */
export async function AuthGate() {
  if (!hasEnvVars) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isMerchantSessionClaims(data?.claims)) redirect("/auth/login");
  return null;
}

/** `/`: con sesión va a Hoy; sin sesión no hace nada y se ve la landing. Va dentro de <Suspense>. */
export async function SignedInRedirect() {
  if (!hasEnvVars) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (isMerchantSessionClaims(data?.claims)) redirect("/today");
  return null;
}
