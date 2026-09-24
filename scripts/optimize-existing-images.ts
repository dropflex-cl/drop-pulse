// Convierte las imágenes guardadas antes del optimizador (lib/media/optimize.ts) a su versión
// optimizada y actualiza las filas que las nombran. Por defecto solo simula: mide y no escribe nada.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/optimize-existing-images.ts [--apply] [--user <id>] [--limit <n>]
//
// Qué convierte:
// - product-references: referencias subidas o por enlace (product_reference_images) → WebP.
// - product-references: fotos de reseñas (product_reviews.photos) → WebP, ≤ 1600 px.
// - page-media: imágenes de la página, generadas o subidas (page_images) → WebP. Los GIF ya son WebP.
// - creative-media: piezas de Creativos (creative_assets) → JPEG para Meta.
// ad-media NO se toca: esas imágenes ya pueden estar subidas a Meta con su hash.
//
// Por archivo: descarga → optimiza → sube con otro nombre → cambia la fila solo si todavía apunta al
// archivo viejo → borra la caché de Shopify Files de ese archivo (la próxima publicación sube el
// optimizado) → borra el viejo. Si algo falla, el archivo viejo queda y la fila no cambia: se puede
// correr de nuevo. Lo que ya está optimizado se salta.
import { adminClient } from "@/lib/integrations/admin";
import { optimizeForAds, optimizeImage, withExt, type OptimizedImage } from "@/lib/media/optimize";
import { REFERENCES_BUCKET } from "@/lib/products/store";
import { PAGE_MEDIA_BUCKET } from "@/lib/page-images/store";
import { CREATIVES_BUCKET } from "@/lib/creatives/store";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const USER = argValue("--user");
const LIMIT = Number(argValue("--limit") ?? Infinity);
const PAGE = 200;
/** Si no ahorra al menos esto, no vale la pena reemplazar el archivo. */
const MIN_SAVING = 0.1;

const db = adminClient();
const totals = { seen: 0, converted: 0, skipped: 0, failed: 0, before: 0, after: 0 };
const kb = (n: number) => `${Math.round(n / 1024).toLocaleString("es-CL")} KB`;

type Optimize = (bytes: Uint8Array) => Promise<OptimizedImage>;
const forLanding: Optimize = (b) => optimizeImage(b);
const forReviews: Optimize = (b) => optimizeImage(b, { maxSide: 1600 });
const forAds: Optimize = (b) => optimizeForAds(b);

/** Un nombre nuevo: con la extensión del formato y, si ya la tenía, con un sufijo. */
function newPath(path: string, ext: string) {
  const next = withExt(path, ext);
  return next === path ? path.replace(/\.[a-z0-9]+$/i, `-o.${ext}`) : next;
}

/**
 * Convierte un archivo. `update` cambia la base (devuelve false si la fila ya no apunta a `path`).
 * Nunca lanza: cuenta el resultado.
 */
async function convert(
  bucket: string,
  path: string,
  optimize: Optimize,
  update: (next: string, img: OptimizedImage) => Promise<boolean>,
): Promise<void> {
  if (totals.seen >= LIMIT) return;
  totals.seen++;
  try {
    const file = await db.storage.from(bucket).download(path);
    if (file.error || !file.data) throw new Error(`no se pudo descargar (${file.error?.message ?? "sin datos"})`);
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const img = await optimize(bytes);
    const sameFormat = path.toLowerCase().endsWith(`.${img.ext}`);
    if (sameFormat && img.data.byteLength > bytes.byteLength * (1 - MIN_SAVING)) {
      totals.skipped++;
      return;
    }
    totals.before += bytes.byteLength;
    totals.after += img.data.byteLength;
    console.log(`${APPLY ? "→" : "·"} ${bucket}/${path}  ${kb(bytes.byteLength)} → ${kb(img.data.byteLength)} (${img.ext}, ${img.width}×${img.height})`);
    if (!APPLY) {
      totals.converted++;
      return;
    }
    const next = newPath(path, img.ext);
    const up = await db.storage.from(bucket).upload(next, img.data, { contentType: img.mime, upsert: false });
    if (up.error) throw new Error(`no se pudo subir (${up.error.message})`);
    let changed = false;
    try {
      changed = await update(next, img);
    } finally {
      if (!changed) await db.storage.from(bucket).remove([next]);
    }
    if (!changed) {
      console.log(`  la fila cambió mientras tanto: se deja como estaba`);
      totals.skipped++;
      return;
    }
    // La caché apunta al archivo pesado en Shopify: sin ella, la próxima publicación sube el optimizado.
    const cache = await db.from("shopify_files").delete().eq("source_key", `${bucket}/${path}`);
    if (cache.error) console.warn(`  no se pudo limpiar la caché de Shopify: ${cache.error.message}`);
    const rm = await db.storage.from(bucket).remove([path]);
    if (rm.error) console.warn(`  quedó el archivo viejo: ${rm.error.message}`);
    totals.converted++;
  } catch (e) {
    totals.failed++;
    console.error(`✗ ${bucket}/${path}: ${(e as Error).message}`);
  }
}

/** Filtros de la lectura: columnas que no pueden ser nulas, iguales a y distintas de un valor. */
type Filter = { notNull?: string; eq?: Record<string, string>; neq?: Record<string, string> };

/** Recorre una tabla por páginas (por id, así las filas que cambian no corren el cursor). */
async function* rows<T extends { id: string }>(table: string, columns: string, filter: Filter = {}) {
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    let q = db.from(table).select(columns).gt("id", after).order("id").limit(PAGE);
    if (USER) q = q.eq("user_id", USER);
    if (filter.notNull) q = q.not(filter.notNull, "is", null);
    for (const [k, v] of Object.entries(filter.eq ?? {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(filter.neq ?? {})) q = q.neq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`Leer ${table}: ${error.message}`);
    const list = (data ?? []) as unknown as T[];
    for (const r of list) yield r;
    if (list.length < PAGE || totals.seen >= LIMIT) return;
    after = list[list.length - 1].id;
  }
}

async function references() {
  for await (const r of rows<{ id: string; storage_path: string }>("product_reference_images", "id, storage_path", { notNull: "storage_path" })) {
    await convert(REFERENCES_BUCKET, r.storage_path, forLanding, async (next, img) => {
      const { data, error } = await db
        .from("product_reference_images")
        .update({ storage_path: next, mime_type: img.mime, size_bytes: img.data.byteLength })
        .eq("id", r.id)
        .eq("storage_path", r.storage_path)
        .select("id");
      if (error) throw new Error(`guardar la fila: ${error.message}`);
      return !!data?.length;
    });
  }
}

async function reviewPhotos() {
  type Photo = { path: string; source_url?: string };
  for await (const r of rows<{ id: string; photos: Photo[] }>("product_reviews", "id, photos", { neq: { photos: "[]" } })) {
    for (const photo of r.photos ?? []) {
      await convert(REFERENCES_BUCKET, photo.path, forReviews, async (next) => {
        // Se relee la fila: otra foto de la misma reseña pudo cambiar en esta misma corrida.
        const { data: row, error: readError } = await db.from("product_reviews").select("photos").eq("id", r.id).maybeSingle();
        if (readError) throw new Error(`leer la reseña: ${readError.message}`);
        const photos = (row?.photos ?? []) as Photo[];
        if (!photos.some((p) => p.path === photo.path)) return false;
        const { error } = await db
          .from("product_reviews")
          .update({ photos: photos.map((p) => (p.path === photo.path ? { ...p, path: next } : p)) })
          .eq("id", r.id);
        if (error) throw new Error(`guardar la reseña: ${error.message}`);
        return true;
      });
    }
  }
}

async function pageImages() {
  const filter: Filter = { notNull: "storage_path", eq: { render_status: "succeeded" }, neq: { slot: "gifs" } };
  for await (const r of rows<{ id: string; storage_path: string }>("page_images", "id, storage_path", filter)) {
    await convert(PAGE_MEDIA_BUCKET, r.storage_path, forLanding, async (next, img) => {
      const { data, error } = await db
        .from("page_images")
        .update({ storage_path: next, width: img.width, height: img.height, size_bytes: img.data.byteLength, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("storage_path", r.storage_path)
        .select("id");
      if (error) throw new Error(`guardar la fila: ${error.message}`);
      return !!data?.length;
    });
  }
}

async function creatives() {
  const filter: Filter = { notNull: "storage_path", eq: { render_status: "succeeded" } };
  for await (const r of rows<{ id: string; storage_path: string }>("creative_assets", "id, storage_path", filter)) {
    await convert(CREATIVES_BUCKET, r.storage_path, forAds, async (next, img) => {
      const { data, error } = await db
        .from("creative_assets")
        .update({ storage_path: next, width: img.width, height: img.height, size_bytes: img.data.byteLength, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("storage_path", r.storage_path)
        .select("id");
      if (error) throw new Error(`guardar la fila: ${error.message}`);
      return !!data?.length;
    });
  }
}

async function main() {
  console.log(`${APPLY ? "Convirtiendo" : "Simulación (agrega --apply para convertir)"}${USER ? ` · usuario ${USER}` : ""}${Number.isFinite(LIMIT) ? ` · hasta ${LIMIT}` : ""}\n`);
  for (const [name, step] of [
    ["Referencias", references],
    ["Fotos de reseñas", reviewPhotos],
    ["Imágenes de la página", pageImages],
    ["Creativos", creatives],
  ] as const) {
    console.log(`— ${name}`);
    await step();
  }
  const saved = totals.before ? Math.round((1 - totals.after / totals.before) * 100) : 0;
  console.log(
    `\n${totals.seen} revisadas · ${totals.converted} ${APPLY ? "convertidas" : "por convertir"} · ${totals.skipped} ya optimizadas · ${totals.failed} con error`,
  );
  if (totals.before) console.log(`${kb(totals.before)} → ${kb(totals.after)} (−${saved} %)`);
  if (totals.failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
