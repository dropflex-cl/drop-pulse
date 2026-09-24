import "server-only";
import { adminClient } from "../admin";
import { deleteToken, getToken, setToken } from "../tokens";
import { HiggsfieldError, listPresets, type Preset } from "./client";

// La clave de Higgsfield de cada comerciante (docs/spec-creativos.md §6.3, decisión 1): el secreto en
// Vault y lo visible (últimos 4 caracteres, estado) en higgsfield_connections. Todo con service_role.

export interface HiggsfieldConnection {
  user_id: string;
  key_hint: string;
  status: "connected" | "invalid";
  last_error: string | null;
  checked_at: string;
}

const TABLE = "higgsfield_connections";
const KEY_SHAPE = /^[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}$/;

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function getHiggsfieldConnection(userId: string): Promise<HiggsfieldConnection | null> {
  const { data, error } = await adminClient().from(TABLE).select("user_id, key_hint, status, last_error, checked_at").eq("user_id", userId).maybeSingle();
  fail("Leer la conexión de Higgsfield", error);
  return data as HiggsfieldConnection | null;
}

/** La clave para llamar a la API, o null si no hay una conectada y válida. */
export async function higgsfieldKey(userId: string): Promise<string | null> {
  const conn = await getHiggsfieldConnection(userId);
  if (conn?.status !== "connected") return null;
  return getToken("higgsfield", userId);
}

/** El formato que da la consola de Higgsfield: KEY_ID:KEY_SECRET, sin espacios. */
export function normalizeKey(raw: string): string | null {
  const key = raw.trim().replace(/^Key\s+/i, "");
  return KEY_SHAPE.test(key) ? key : null;
}

/**
 * Valida la clave con una lectura que no cuesta (el catálogo de presets) y la guarda. Lanza
 * HiggsfieldError con el motivo en español si Higgsfield la rechaza.
 */
export async function connectHiggsfield(userId: string, raw: string): Promise<HiggsfieldConnection> {
  const key = normalizeKey(raw);
  if (!key) throw new HiggsfieldError("invalid_key", "Pega la clave completa, con el formato KEY_ID:KEY_SECRET que da la consola de Higgsfield.");
  await listPresets(key);
  await setToken("higgsfield", userId, key);
  const now = new Date().toISOString();
  const row = { user_id: userId, key_hint: key.slice(-4), status: "connected", last_error: null, checked_at: now, updated_at: now };
  const { data, error } = await adminClient().from(TABLE).upsert(row, { onConflict: "user_id" }).select("user_id, key_hint, status, last_error, checked_at").single();
  fail("Guardar la conexión de Higgsfield", error);
  return data as HiggsfieldConnection;
}

export async function disconnectHiggsfield(userId: string): Promise<void> {
  await deleteToken("higgsfield", userId);
  fail("Borrar la conexión de Higgsfield", (await adminClient().from(TABLE).delete().eq("user_id", userId)).error);
}

/** Higgsfield rechazó la clave a mitad de un trabajo: la etapa se bloquea hasta reconectar. */
export async function markHiggsfieldInvalid(userId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  fail("Marcar la clave de Higgsfield", (await adminClient().from(TABLE).update({ status: "invalid", last_error: message, checked_at: now, updated_at: now }).eq("user_id", userId)).error);
}

// El catálogo cambia poco: se cachea por clave durante una hora en la instancia.
const PRESET_TTL_MS = 60 * 60 * 1000;
const presetCache = new Map<string, { at: number; presets: Preset[] }>();

export async function presetsFor(key: string): Promise<Preset[]> {
  const hit = presetCache.get(key);
  if (hit && Date.now() - hit.at < PRESET_TTL_MS) return hit.presets;
  const presets = await listPresets(key);
  presetCache.set(key, { at: Date.now(), presets });
  return presets;
}
