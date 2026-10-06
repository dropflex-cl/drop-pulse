import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { contextAccess, contextDatabaseError } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
export async function assertUgcPublishable(userId: string, productId: string, scriptIds: string[], media?: { id: string; ugc_provenance?: Record<string, unknown> }[]) {
  if (!scriptIds.length) return;
  const { error } = await adminClient().rpc("pi_assert_ugc_publishable", {
    p_access: contextAccess({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }),
    p_product_id: productId, p_script_ids: [...new Set(scriptIds)],
  });
  if (error) throw contextDatabaseError(error);
  if (media) {
    const { data, error: readError } = await adminClient().from("video_scripts").select("id,ad_media_id").eq("user_id", userId).eq("product_id", productId).in("id", scriptIds);
    if (readError) throw new Error("No pudimos comprobar los videos de Anuncios.");
    for (const item of media) if (item.ugc_provenance?.script_id && !data?.some((s) => s.id === item.ugc_provenance?.script_id && s.ad_media_id === item.id)) throw new Error("Ese video fue reemplazado. Elige el montaje aprobado actual antes de lanzar.");
  }
}
