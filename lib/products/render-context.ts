import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { OptimizeError } from "@/lib/pipeline/errors";

/** Worker servidor: comprueba el contexto guardado antes del envío, también en los renders de UI. */
export async function renderBaseId(kind: "creative" | "gallery", assetId: string): Promise<string | undefined> {
  const { data, error } = await adminClient().rpc("pi_content_render_context", { p_kind: kind, p_asset_id: assetId });
  if (error) throw new OptimizeError("Cambió el contexto o el plan del producto. Revísalo en el chat antes de generar.", 409);
  return (data as { base_reference_id?: string }).base_reference_id;
}
