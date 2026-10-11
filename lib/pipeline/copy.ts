import { catalogImages } from "@/lib/copy/images";
import { LISTING } from "@/lib/copy/listing";
import { currentContent, getComponentRow } from "@/lib/copy/store";
import { isVariants } from "@/lib/copy/variants";
import { adminClient } from "@/lib/integrations/admin";
import { validateLandingProposal } from "@/lib/product-intelligence/landing-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import {
  contextAccess,
  contextDatabaseError,
  createContextRepository,
} from "@/lib/product-intelligence/repository";
import { componentById } from "@/lib/shopify/components/catalog";
import type { ImagePick } from "@/lib/types";
import "server-only";
import { OptimizeError } from "./errors";

// ---------------------------------------------------------------- Decidir

export interface ComponentPatch {
  expected_id?: string;
  expected_updated_at?: string;
  /** Contenido vigente (valida con el esquema del componente). */
  content?: unknown;
  /** Decisión explícita de mostrar u ocultar. */
  enabled?: boolean;
  /** Las fotos elegidas para sus espacios de imagen. */
  images?: ImagePick[];
}

/** Por qué no se pueden guardar esas imágenes: espacio que no existe, de más, o que no es del producto. */
export function imageProblem(
  component: string,
  images: ImagePick[],
  allowed: Set<string>,
): string | null {
  const slots = componentById(component)?.imageSlots ?? [];
  for (const pick of images) {
    if (!slots.some((s) => s.key === pick.slot))
      return "Ese componente no lleva esa imagen.";
    if (!allowed.has(`${pick.source}:${pick.id}`))
      return "Esa imagen ya no está en el producto. Actualiza la página.";
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
export async function updateComponent(
  userId: string,
  productId: string,
  component: string,
  patch: ComponentPatch,
) {
  const row = await getComponentRow(userId, productId, component);
  if (!row) throw new OptimizeError("Ese componente ya no está en la página. Actualiza.", 409);
  if (!patch.expected_id || !patch.expected_updated_at || patch.expected_id !== row.id || patch.expected_updated_at !== row.updated_at)
    throw new OptimizeError("El componente cambió desde tu lectura. Actualiza antes de guardar.", 409);
  if (component === LISTING && patch.enabled === false) throw new OptimizeError("La página necesita su ficha de producto.", 409);
  const access = contextAccess({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES });
  const raw = await createContextRepository().loadLanding({ p_access: access, p_product_id: productId }, AbortSignal.timeout(10000));
  const content = patch.content ?? currentContent(row);
  if (patch.content !== undefined) {
    validateLandingProposal(raw, [{ component, content: isVariants(content) ? content : [{ key: "default", angle_id: null, hook_id: null, content, images: patch.images ?? row.images }] }]);
  }
  if (patch.images) {
    const allowed = new Set((await catalogImages(userId, productId, false)).map(i => `${i.source}:${i.id}`));
    const problem = imageProblem(component, patch.images, allowed);
    if (problem) throw new OptimizeError(problem, 400);
  }
  const { expected_id, expected_updated_at, ...changes } = patch;
  const { error } = await adminClient().rpc("pi_review_landing", { p_access: access, p_product_id: productId, p_component: component,
    p_id: expected_id, p_updated_at: expected_updated_at, p_stamp: (raw as { stamp: string }).stamp, p_patch: changes });
  if (error) throw contextDatabaseError(error);
}
