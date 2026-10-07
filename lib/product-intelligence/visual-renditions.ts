import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { optimizeForAds } from "@/lib/media/optimize";
import { visualByteHash, visualStoredBytes } from "./visual-media";
import type { VisualState } from "./visual-domain";
import type { VisualRecord, VisualTarget } from "./visual-schemas";

/** Format-specific copies are shared by all uses of the same canonical file. */
export async function ensureVisualRenditions(state: VisualState, asset: VisualRecord, target: VisualTarget, userId: string) {
  if (!["creative_concept", "ugc_shot"].includes(target.type) || target.type === "ugc_shot" && target.slot === "b_roll") return;
  const db = adminClient(), file = state.files.find(f => f.id === asset.payload.file_id);
  if (!file) throw new Error("No encontramos el archivo. Recupera la pieza.");
  const existing = await db.from("pi_visual_renditions").select("profile").eq("file_id", file.id).eq("product_id", state.product_id).eq("user_id", userId);
  if (existing.error) throw new Error("No pudimos leer los formatos de la pieza.");
  const profiles = target.type === "creative_concept" ? ["creative", "ads"] : ["ugc"];
  const missing = profiles.filter(p => !existing.data?.some(r => r.profile === p));
  if (!missing.length) return;
  const bytes = await visualStoredBytes(file.bucket, file.storage_path), ads = target.type === "creative_concept" ? await optimizeForAds(bytes) : null;
  const data = ads?.data ?? bytes, ext = ads?.ext ?? "webp", hash = visualByteHash(data), path = `${userId}/${state.product_id}/visual-${hash}.${ext}`;
  for (const profile of missing) {
    const bucket = profile === "ads" ? "ad-media" : "creative-media";
    const upload = await db.storage.from(bucket).upload(path, data, { contentType: ads?.mime ?? file.mime_type, upsert: false });
    if (upload.error && visualByteHash(await visualStoredBytes(bucket, path)) !== hash) throw new Error("No pudimos preparar el formato para este uso.");
    const inserted = await db.from("pi_visual_renditions").upsert({ file_id: file.id, product_id: state.product_id, user_id: userId, profile, bucket, storage_path: path,
      mime_type: ads?.mime ?? file.mime_type, width: ads?.width ?? file.width, height: ads?.height ?? file.height, size_bytes: data.length }, { onConflict: "file_id,profile", ignoreDuplicates: true });
    if (inserted.error) {
      const linked = await db.from("pi_visual_renditions").select("file_id").eq("bucket", bucket).eq("storage_path", path);
      if (!linked.error && !linked.data?.length && !upload.error) await db.storage.from(bucket).remove([path]);
      throw new Error("El producto cambió durante la preparación. Recupera el contexto.");
    }
  }
}
