import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OnboardingError } from "@/lib/onboarding/types";

export interface SessionUser {
  id: string;
  email?: string;
  /** Equipo de DropFlex: `app_metadata.role = "admin"` (solo lo asigna el servidor, nunca el usuario). */
  admin?: boolean;
}

/** Usuario de la sesión de Supabase, o `null`. Solo lee los claims: no toca la lógica de auth. */
export async function sessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const appMeta = claims.app_metadata as { role?: unknown } | undefined;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined, admin: appMeta?.role === "admin" };
}

/** Igual que `sessionUser`, pero sin sesión responde 401 con un mensaje que dice qué hacer. */
export async function requireUser(): Promise<SessionUser> {
  const user = await sessionUser();
  if (!user) throw new OnboardingError("Tu sesión terminó. Inicia sesión para seguir.", 401);
  return user;
}
