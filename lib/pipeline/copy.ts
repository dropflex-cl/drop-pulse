import { fail } from "@/lib/angles/store";
import { catalogImages } from "@/lib/copy/images";
import { LISTING } from "@/lib/copy/listing";
import { schemaProblems } from "@/lib/copy/page-schema";
import { currentContent, getComponentRow } from "@/lib/copy/store";
import { isVariants } from "@/lib/copy/variants";
import { adminClient } from "@/lib/integrations/admin";
import { validateLandingProposal } from "@/lib/product-intelligence/landing-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { contextAccess, contextDatabaseError, createContextRepository } from "@/lib/product-intelligence/repository";
import { approvedReviewRows } from "@/lib/reviews/rows";
import { componentById } from "@/lib/shopify/components/catalog";
import type { ImagePick } from "@/lib/types";
import "server-only";
import { OptimizeError } from "./errors";

// ---------------------------------------------------------------- Decidir

export interface ComponentPatch {
  expected_id?: string;
  expected_updated_at?: string;
  /** Tu versión (valida con el esquema del componente). */
  content?: unknown;
  /** «Usar en la página». Activar aprueba. */
  enabled?: boolean;
  /** Las fotos elegidas para sus espacios de imagen. */
  images?: ImagePick[];
  /** Aprobar sin cambios (la ficha: «Aprobar ficha»). */
  approve?: boolean;
}

/** Por qué no se pueden guardar esas imágenes: espacio que no existe, de más, o que no es del producto. */
export function imageProblem(component: string, images: ImagePick[], allowed: Set<string>): string | null {
  const slots = componentById(component)?.imageSlots ?? [];
  for (const pick of images) {
    if (!slots.some((s) => s.key === pick.slot)) return "Ese componente no lleva esa imagen.";
    if (!allowed.has(`${pick.source}:${pick.id}`)) return "Esa imagen ya no está en el producto. Actualiza la página.";
  }
  for (const s of slots) {
    const n = images.filter((p) => p.slot === s.key).length;
    if (n > s.max) return `${s.label}: elige hasta ${s.max}.`;
  }
  return null;
}

/**
 * Guardar la hoja de edición (contenido e imágenes = aprobado y en la página), activar o desactivar
 * «Usar en la página» (activar = aprobado) o aprobar la ficha. Desactivar conserva el contenido.
 */
export async function updateComponent(userId: string, productId: string, component: string, patch: ComponentPatch) {
  const row = await getComponentRow(userId, productId, component);
  if (!row) throw new OptimizeError("Ese componente ya no está en la página. Actualiza.", 409);
  const content = patch.content ?? currentContent(row);
  if ((patch.expected_id && patch.expected_id !== row.id) || (patch.expected_updated_at && patch.expected_updated_at !== row.updated_at)) throw new OptimizeError("El componente cambió desde tu lectura. Actualiza antes de guardar.", 409);
  if (isVariants(content) || isVariants(currentContent(row))) {
    if (!patch.expected_id || !patch.expected_updated_at) throw new OptimizeError("Actualiza la página antes de revisar estas variantes.", 409);
    const access = contextAccess({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES });
    const raw = await createContextRepository().loadLanding({ p_access: access, p_product_id: productId }, AbortSignal.timeout(10000));
    const approving = patch.approve || patch.content !== undefined || patch.images !== undefined || patch.enabled === true;
    try {
      if (approving) validateLandingProposal(userId, raw, [{ component, content }], productId);
      if (patch.images) {
        const allowed = new Set((await catalogImages(userId, productId, false)).map((i) => `${i.source}:${i.id}`));
        const problem = imageProblem(component, patch.images, allowed);
        if (problem) throw new OptimizeError(problem, 400);
      }
      const { expected_id, expected_updated_at, ...changes } = patch;
      const { error } = await adminClient().rpc("pi_review_landing", { p_access: access, p_product_id: productId, p_component: component,
        p_id: expected_id, p_updated_at: expected_updated_at, p_stamp: (raw as { stamp: string }).stamp, p_patch: changes });
      if (error) throw contextDatabaseError(error);
    } catch (error) {
      if (error instanceof OptimizeError) throw error;
      throw new OptimizeError(error instanceof Error ? error.message : "No pudimos revisar las variantes.", 409);
    }
    return;
  }
  const listing = component === LISTING;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (patch.content !== undefined) {
    const problems = schemaProblems(component, patch.content);
    if (problems.length) throw new OptimizeError(problems[0].replace(/^[^:]+: /, ""), 400);
    const same = JSON.stringify(patch.content) === JSON.stringify(row.proposal);
    update.content = same ? null : patch.content;
  }
  if (patch.images !== undefined) {
    if (listing) throw new OptimizeError("La ficha no lleva imágenes aquí: están en la etapa Imágenes.", 400);
    const allowed = new Set((await catalogImages(userId, productId, false)).map((i) => `${i.source}:${i.id}`));
    const problem = imageProblem(component, patch.images, allowed);
    if (problem) throw new OptimizeError(problem, 400);
    update.images = patch.images;
  }
  if (patch.enabled !== undefined && !listing) {
    const def = componentById(component);
    if (patch.enabled && def?.minReviews && (await approvedReviewRows(userId, productId)).length < def.minReviews) {
      throw new OptimizeError("Aprueba reseñas en la etapa Reseñas para usar este componente.", 409);
    }
    update.enabled = patch.enabled;
  }
  // Guardar la hoja, activar o aprobar la ficha deja el componente aprobado.
  const approves = patch.approve || patch.content !== undefined || patch.images !== undefined || patch.enabled === true;
  if (approves) {
    update.status = "approved";
    update.decided_at = now;
    if (!listing && (patch.content !== undefined || patch.images !== undefined) && patch.enabled === undefined) update.enabled = true;
  }
  const saved = await adminClient().from("page_components").update(update).eq("id", row.id).eq("user_id", userId).eq("product_id", productId).eq("updated_at", row.updated_at).is("superseded_at", null).select("id").maybeSingle();
  fail("Guardar el componente", saved.error);
  if (!saved.data) throw new OptimizeError("La página cambió desde tu lectura. Actualiza antes de editar este componente.", 409);
}

/**
 * «Deshacer» después de «Volver a escribir con IA»: la versión anterior de ese componente vuelve a
 * ser la vigente y la nueva queda como reemplazada (docs/spec-angulos-testeo.md §5.8).
 */
export async function restoreComponent(userId: string, productId: string, component: string): Promise<void> {
  const db = adminClient();
  const current = await getComponentRow(userId, productId, component);
  if (!current) throw new OptimizeError("Ese componente ya no está en la página. Actualiza.", 409);
  const { data, error } = await db
    .from("page_components")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("component", component)
    .not("superseded_at", "is", null)
    .lt("created_at", current.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Leer la versión anterior", error);
  if (!data) throw new OptimizeError("No hay una versión anterior de este componente.", 409);
  const now = new Date().toISOString();
  // Primero se aparta la nueva: el índice único admite un solo componente vigente.
  fail("Apartar la versión nueva", (await db.from("page_components").update({ superseded_at: now, updated_at: now }).eq("id", current.id)).error);
  const back = await db.from("page_components").update({ superseded_at: null, updated_at: now }).eq("id", (data as { id: string }).id);
  if (back.error) {
    await db.from("page_components").update({ superseded_at: null, updated_at: now }).eq("id", current.id);
    fail("Recuperar la versión anterior", back.error);
  }
}
