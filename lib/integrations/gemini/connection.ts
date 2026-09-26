import "server-only";
import { adminClient } from "../admin";
import { deleteToken, getToken, setToken } from "../tokens";
import { checkKey, GeminiError } from "./client";

// La clave de Gemini de cada comerciante, con el mismo mecanismo que Higgsfield
// (lib/integrations/higgsfield/connection.ts): el secreto en Vault y lo visible (últimos 4 caracteres,
// estado) en gemini_connections. Todo con service_role.

export interface GeminiConnection {
  user_id: string;
  key_hint: string;
  status: "connected" | "invalid";
  last_error: string | null;
  checked_at: string;
}

const TABLE = "gemini_connections";
// Las claves de Google AI Studio: «AIza…» (39 caracteres) o las nuevas, más largas, con _ y -.
const KEY_SHAPE = /^[A-Za-z0-9_.-]{30,}$/;

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function getGeminiConnection(userId: string): Promise<GeminiConnection | null> {
  const { data, error } = await adminClient().from(TABLE).select("user_id, key_hint, status, last_error, checked_at").eq("user_id", userId).maybeSingle();
  fail("Leer la conexión de Gemini", error);
  return data as GeminiConnection | null;
}

/** La clave para llamar a la API, o null si no hay una conectada y válida. */
export async function geminiKey(userId: string): Promise<string | null> {
  const conn = await getGeminiConnection(userId);
  if (conn?.status !== "connected") return null;
  return getToken("gemini", userId);
}

/** La clave tal como la da Google AI Studio, sin espacios ni comillas. */
export function normalizeKey(raw: string): string | null {
  const key = raw.trim().replace(/^["']|["']$/g, "");
  return KEY_SHAPE.test(key) ? key : null;
}

/**
 * Valida la clave con una lectura que no cuesta (los datos del modelo de imágenes) y la guarda. Lanza
 * GeminiError con el motivo en español si Google la rechaza.
 */
export async function connectGemini(userId: string, raw: string): Promise<GeminiConnection> {
  const key = normalizeKey(raw);
  if (!key) throw new GeminiError("invalid_key", "Pega la clave completa, tal como la copia Google AI Studio (empieza con AIza).");
  await checkKey(key);
  await setToken("gemini", userId, key);
  const now = new Date().toISOString();
  const row = { user_id: userId, key_hint: key.slice(-4), status: "connected", last_error: null, checked_at: now, updated_at: now };
  const { data, error } = await adminClient().from(TABLE).upsert(row, { onConflict: "user_id" }).select("user_id, key_hint, status, last_error, checked_at").single();
  fail("Guardar la conexión de Gemini", error);
  return data as GeminiConnection;
}

export async function disconnectGemini(userId: string): Promise<void> {
  await deleteToken("gemini", userId);
  fail("Borrar la conexión de Gemini", (await adminClient().from(TABLE).delete().eq("user_id", userId)).error);
}

/** Google rechazó la clave a mitad de un trabajo: Gemini deja de ofrecerse hasta reconectar. */
export async function markGeminiInvalid(userId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  fail("Marcar la clave de Gemini", (await adminClient().from(TABLE).update({ status: "invalid", last_error: message, checked_at: now, updated_at: now }).eq("user_id", userId)).error);
}
