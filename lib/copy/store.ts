import "server-only";
import type { AngleRole } from "@/lib/angles/catalog";
import { fail, type BriefRow } from "@/lib/angles/store";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { CopyItem, RunStatus } from "@/lib/types";
import { BLOCKS, blockDef } from "./blocks";
import type { PageCopyOutput } from "./schemas";

// copy_runs y content_items: lecturas y escrituras de la etapa Textos (la página del producto).
// Siempre con service_role filtrando por el dueño (como lib/angles/store.ts).

const RUNNING_STALE_MS = 10 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;

/** Qué desarrollo de cada papel se usó (y cuándo se editó por última vez). */
export type BriefStamp = Record<AngleRole, { id: string; edited_at: string | null }>;

export interface CopyRunRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  error_code: string | null;
  error_message: string | null;
  input: Record<string, unknown> & { briefs?: BriefStamp };
  payload: PageCopyOutput | null;
  created_at: string;
}

export interface ContentItemRow {
  id: string;
  product_id: string;
  user_id: string;
  run_id: string;
  key: string;
  position: number;
  original: string | null;
  proposal: string;
  edited_text: string | null;
  angle_role: AngleRole | null;
  note: string | null;
  missing: string | null;
  status: DbContentStatus;
  decided_at: string | null;
  created_at: string;
}

/** Cierra las escrituras colgadas (el proceso murió). */
export async function expireStaleCopy(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const patch = { status: "failed", error_code: "stale", error_message: "La escritura se interrumpió. Toca Reintentar.", finished_at: stamp, updated_at: stamp };
  const results = await Promise.all([
    db.from("copy_runs").update(patch).eq("user_id", userId).eq("status", "running").lt("started_at", new Date(now - RUNNING_STALE_MS).toISOString()),
    db.from("copy_runs").update(patch).eq("user_id", userId).eq("status", "queued").lt("created_at", new Date(now - QUEUED_STALE_MS).toISOString()),
  ]);
  for (const r of results) fail("Cerrar escrituras colgadas", r.error);
}

/** La escritura más reciente de cada producto. */
export async function latestCopyRuns(userId: string, productIds: string[]): Promise<Map<string, CopyRunRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("copy_runs")
    .select("id, product_id, user_id, status, error_code, error_message, input, payload, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer las escrituras", error);
  const map = new Map<string, CopyRunRow>();
  for (const r of (data ?? []) as CopyRunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Los bloques vigentes (no reemplazados) de cada producto, en el orden de la página. */
export async function activeItems(userId: string, productIds: string[]): Promise<Map<string, ContentItemRow[]>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("content_items")
    .select("id, product_id, user_id, run_id, key, position, original, proposal, edited_text, angle_role, note, missing, status, decided_at, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .is("superseded_at", null)
    .order("position", { ascending: true });
  fail("Leer los textos", error);
  const map = new Map<string, ContentItemRow[]>();
  for (const r of (data ?? []) as ContentItemRow[]) map.set(r.product_id, [...(map.get(r.product_id) ?? []), r]);
  return map;
}

export async function getItemRow(userId: string, productId: string, itemId: string): Promise<ContentItemRow | null> {
  const { data, error } = await adminClient()
    .from("content_items")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("id", itemId)
    .is("superseded_at", null)
    .maybeSingle();
  fail("Leer el texto", error);
  return (data as ContentItemRow | null) ?? null;
}

/** Los desarrollos cambiaron (otro, o editado) después de escribir la página. */
export function isStale(run: CopyRunRow | undefined, briefs: Partial<Record<AngleRole, BriefRow>>): boolean {
  const used = run?.input.briefs;
  if (!used) return false;
  return (["primary", "secondary"] as AngleRole[]).some((r) => {
    const b = briefs[r];
    return !b || b.id !== used[r]?.id || (b.edited_at ?? null) !== (used[r]?.edited_at ?? null);
  });
}

// ---------------------------------------------------------------- A la pantalla

/** Número del bloque entre los de su clave («Beneficio 2»). */
function labels(rows: ContentItemRow[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of rows) {
    const def = blockDef(r.key);
    const n = (seen.get(r.key) ?? 0) + 1;
    seen.set(r.key, n);
    out.set(r.id, def ? (def.max > 1 ? `${def.label} ${n}` : def.label) : r.key);
  }
  return out;
}

export function toCopyItems(rows: ContentItemRow[]): CopyItem[] {
  const names = labels(rows);
  return rows.map((r) => {
    const def = blockDef(r.key) ?? BLOCKS[0];
    return {
      id: r.id,
      key: r.key,
      label: names.get(r.id)!,
      section: def.section,
      original: r.original ?? undefined,
      text: r.edited_text ?? r.proposal,
      edited: r.edited_text != null,
      angle: r.angle_role ?? undefined,
      note: r.note ?? undefined,
      missing: r.missing ?? undefined,
      status: toUiStatus(r.status),
      required: def.required,
      limit: def.limit,
      unit: def.unit,
    };
  });
}
