import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { carouselContentSchema, carouselProblem, type ResolvedCarouselCard } from "./carousel";
import type { MediaRow } from "./store";

/** Resuelve archivos propios sin convertir, generar ni modificar decisiones durante una lectura. */
export async function resolveCarousels(rows: MediaRow[]): Promise<MediaRow[]> {
  const carousels = rows.filter(r => r.kind === "carousel");
  if (!carousels.length) return rows;
  const db = adminClient(), owner = carousels[0].user_id, product = carousels[0].product_id;
  const ids = [...new Set(carousels.flatMap(r => r.carousel_content?.cards.flatMap(c => c.asset_id ? [c.asset_id] : []) ?? []))];
  const assets = ids.length ? await db.from("pi_visual_records").select("id,status,payload").eq("user_id", owner).eq("product_id", product).eq("kind", "asset").in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error("No pudimos leer las imágenes del carrusel.");
  const files = [...new Set((assets.data ?? []).map(a => String(a.payload.file_id)))];
  const renditions = files.length ? await db.from("pi_visual_renditions").select("*").eq("user_id", owner).eq("product_id", product).eq("profile", "ads").in("file_id", files) : { data: [], error: null };
  if (renditions.error) throw new Error("No pudimos leer los archivos del carrusel.");
  for (const r of carousels) {
    const content = carouselContentSchema.parse(r.carousel_content);
    const cards: ResolvedCarouselCard[] = content.cards.map(card => {
      const asset = assets.data?.find(a => a.id === card.asset_id);
      const file = card.asset_id ? renditions.data?.find(f => f.file_id === asset?.payload.file_id) : rows.find(m => m.id === card.media_id && m.kind === "image" && m.status === "ready");
      const problem = card.asset_id && (!asset || ["archived", "rejected"].includes(asset.status)) ? "Elige una imagen disponible para cada tarjeta." : !file ? "Sube o asigna la imagen de cada tarjeta." : null;
      return { ...card, storage_path: file?.storage_path ?? null, width: file?.width ?? null, height: file?.height ?? null, size_bytes: file?.size_bytes ?? 0, problem };
    });
    const paths = cards.flatMap(c => c.storage_path ? [c.storage_path] : []);
    const signed = paths.length ? await db.storage.from("ad-media").createSignedUrls(paths, 3600) : { data: [] };
    for (const card of cards) card.url = signed.data?.find(s => s.path === card.storage_path)?.signedUrl ?? "";
    const problem = carouselProblem(content, cards);
    r.carousel = { id: r.id, content, cards, etag: r.carousel_etag ?? "", ready: !problem, problem };
    r.status = problem ? "processing" : "ready";
    r.error = problem;
  }
  return rows;
}
