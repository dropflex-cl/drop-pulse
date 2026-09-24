import "server-only";
import type { AngleRole } from "@/lib/angles/catalog";
import { fail, type BriefRow } from "@/lib/angles/store";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { ImagePick, PageComponentView, RunStatus } from "@/lib/types";

// copy_runs y page_components: lecturas y escrituras de la etapa Página del producto
// (docs/spec-pagina-componentes.md). Siempre con service_role filtrando por el dueño (como
// lib/angles/store.ts).

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
  payload: unknown;
  created_at: string;
}

export interface PageComponentRow {
  id: string;
  product_id: string;
  user_id: string;
  run_id: string;
  component: string;
  position: number;
  proposal: unknown;
  content: unknown;
  enabled: boolean;
  images: ImagePick[];
  status: DbContentStatus;
  decided_at: string | null;
  created_at: string;
}

const COMPONENT_COLUMNS = "id, product_id, user_id, run_id, component, position, proposal, content, enabled, images, status, decided_at, created_at";

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
    .select("id, product_id, user_id, status, error_code, error_message, input, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer las escrituras", error);
  const map = new Map<string, CopyRunRow>();
  for (const r of (data ?? []) as CopyRunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, { ...r, payload: null });
  return map;
}

/** La ficha y los componentes vigentes (no reemplazados) de cada producto, en el orden de la página. */
export async function activeComponents(userId: string, productIds: string[]): Promise<Map<string, PageComponentRow[]>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("page_components")
    .select(COMPONENT_COLUMNS)
    .eq("user_id", userId)
    .in("product_id", productIds)
    .is("superseded_at", null)
    .order("position", { ascending: true });
  fail("Leer la página", error);
  const map = new Map<string, PageComponentRow[]>();
  for (const r of (data ?? []) as PageComponentRow[]) map.set(r.product_id, [...(map.get(r.product_id) ?? []), r]);
  return map;
}

export async function getComponentRow(userId: string, productId: string, component: string): Promise<PageComponentRow | null> {
  const { data, error } = await adminClient()
    .from("page_components")
    .select(COMPONENT_COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("component", component)
    .is("superseded_at", null)
    .maybeSingle();
  fail("Leer el componente", error);
  return (data as PageComponentRow | null) ?? null;
}

/** La versión vigente de un componente: la del comerciante si la editó, si no la propuesta. */
export const currentContent = (r: Pick<PageComponentRow, "content" | "proposal">): unknown => r.content ?? r.proposal;

/** Los desarrollos cambiaron (otro, o editado) después de escribir la página. */
export function isStale(run: CopyRunRow | undefined, briefs: Partial<Record<AngleRole, BriefRow>>): boolean {
  const used = run?.input.briefs;
  if (!used) return false;
  return (["primary", "secondary"] as AngleRole[]).some((r) => {
    const b = briefs[r];
    return !b || b.id !== used[r]?.id || (b.edited_at ?? null) !== (used[r]?.edited_at ?? null);
  });
}

export function toComponentViews(rows: PageComponentRow[]): PageComponentView[] {
  return rows.map((r) => ({
    id: r.id,
    component: r.component,
    content: currentContent(r),
    edited: r.content != null,
    enabled: r.enabled,
    status: toUiStatus(r.status),
    images: r.images ?? [],
  }));
}
