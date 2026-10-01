import "server-only";
import { AI_MODEL } from "@/lib/ai/model";
import { adminClient } from "../admin";
import { deleteToken, getToken, setToken } from "../tokens";
import { AnthropicError, checkKey } from "./client";

// La clave de Anthropic (Claude) de cada comerciante, con el mismo mecanismo que Higgsfield y Gemini:
// el secreto en Vault y lo visible (últimos 4 caracteres, estado) en anthropic_connections. Todo con
// service_role. Sin clave conectada, la IA no corre: no hay clave del servidor de respaldo.

export interface AnthropicConnection {
  user_id: string;
  key_hint: string;
  status: "connected" | "invalid";
  last_error: string | null;
  checked_at: string;
}

const TABLE = "anthropic_connections";
// Las claves de la consola: «sk-ant-api03-…». Las de administración («sk-ant-admin…») no llaman a Claude.
const KEY_SHAPE = /^sk-ant-api\d*-[A-Za-z0-9_-]{20,}$/;

/** El mensaje de toda acción de IA cuando el comerciante no conectó su clave (o Anthropic la rechazó). */
export const NO_ANTHROPIC_KEY = "Conecta tu clave de Anthropic en Ajustes › Inteligencia artificial para usar la IA.";

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function getAnthropicConnection(userId: string): Promise<AnthropicConnection | null> {
  const { data, error } = await adminClient().from(TABLE).select("user_id, key_hint, status, last_error, checked_at").eq("user_id", userId).maybeSingle();
  fail("Leer la conexión de Anthropic", error);
  return data as AnthropicConnection | null;
}

/** La clave para llamar a la API, o null si no hay una conectada y válida. */
export async function anthropicKey(userId: string): Promise<string | null> {
  const conn = await getAnthropicConnection(userId);
  if (conn?.status !== "connected") return null;
  return getToken("anthropic", userId);
}

/** La clave tal como la da la consola de Anthropic, sin espacios, comillas ni prefijo `Bearer`. */
export function normalizeKey(raw: string): string | null {
  const key = raw
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "");
  return KEY_SHAPE.test(key) ? key : null;
}

/**
 * Valida la clave con una lectura que no cuesta (los datos del modelo) y la guarda. Lanza
 * AnthropicError con el motivo en español si Anthropic la rechaza.
 */
export async function connectAnthropic(userId: string, raw: string): Promise<AnthropicConnection> {
  const key = normalizeKey(raw);
  if (!key) {
    const admin = /sk-ant-admin/i.test(raw);
    throw new AnthropicError(
      "invalid_key",
      admin ? "Esa es una clave de administración. Crea una API key normal en la consola de Anthropic." : "Pega la clave completa, tal como la copia la consola de Anthropic (empieza con sk-ant-api).",
    );
  }
  await checkKey(key, AI_MODEL);
  await setToken("anthropic", userId, key);
  const now = new Date().toISOString();
  const row = { user_id: userId, key_hint: key.slice(-4), status: "connected", last_error: null, checked_at: now, updated_at: now };
  const { data, error } = await adminClient().from(TABLE).upsert(row, { onConflict: "user_id" }).select("user_id, key_hint, status, last_error, checked_at").single();
  fail("Guardar la conexión de Anthropic", error);
  return data as AnthropicConnection;
}

export async function disconnectAnthropic(userId: string): Promise<void> {
  await deleteToken("anthropic", userId);
  fail("Borrar la conexión de Anthropic", (await adminClient().from(TABLE).delete().eq("user_id", userId)).error);
}

/** Anthropic rechazó la clave a mitad de un trabajo: la IA se detiene hasta reconectar. */
export async function markAnthropicInvalid(userId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  fail("Marcar la clave de Anthropic", (await adminClient().from(TABLE).update({ status: "invalid", last_error: message, checked_at: now, updated_at: now }).eq("user_id", userId)).error);
}
