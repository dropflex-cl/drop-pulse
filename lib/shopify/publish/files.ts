// Subir archivos a Shopify sin URL pública: stagedUploadsCreate → POST del archivo al destino que
// da Shopify → (imágenes) fileCreate con el resourceUrl y esperar READY. Así funciona igual en local
// (el bucket de Supabase no es alcanzable desde Shopify) y en producción.
import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { shopifyMutation, shopifyQuery } from "@/lib/integrations/shopify/client";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";

export class PublishError extends Error {}

interface UserError {
  field?: string[] | null;
  message: string;
}

export function assertNoUserErrors(what: string, errors: UserError[] | undefined | null) {
  if (errors?.length) throw new PublishError(`${what}: ${errors.map((e) => e.message).join("; ")}`);
}

const STAGED = /* GraphQL */ `
  mutation Staged($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

interface StagedResult {
  stagedUploadsCreate: {
    stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[];
    userErrors: UserError[];
  };
}

export interface Upload {
  filename: string;
  mimeType: string;
  data: Buffer;
}

/** Sube los archivos a destinos temporales de Shopify. Devuelve el resourceUrl de cada uno, en orden. */
export async function stageUploads(conn: ShopifyConnection, resource: "IMAGE" | "FILE", uploads: Upload[]): Promise<string[]> {
  if (!uploads.length) return [];
  const res = await shopifyMutation<StagedResult>(conn, STAGED, {
    input: uploads.map((u) => ({ resource, filename: u.filename, mimeType: u.mimeType, httpMethod: "POST", fileSize: String(u.data.length) })),
  });
  assertNoUserErrors("Preparar la subida", res.stagedUploadsCreate.userErrors);
  const targets = res.stagedUploadsCreate.stagedTargets;
  await Promise.all(
    uploads.map(async (u, i) => {
      const t = targets[i];
      const form = new FormData();
      for (const p of t.parameters) form.append(p.name, p.value);
      form.append("file", new Blob([new Uint8Array(u.data)], { type: u.mimeType }), u.filename);
      const up = await fetch(t.url, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
      if (!up.ok) throw new PublishError(`Shopify no recibió ${u.filename} (${up.status})`);
    }),
  );
  return targets.map((t) => t.resourceUrl);
}

const FILE_CREATE = /* GraphQL */ `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id fileStatus }
      userErrors { field message }
    }
  }
`;

const FILE_STATUS = /* GraphQL */ `
  query FileStatus($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on MediaImage { id fileStatus fileErrors { message } }
      ... on GenericFile { id fileStatus fileErrors { message } }
    }
  }
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Crea imágenes en Shopify Files desde subidas preparadas y espera a que estén listas (máx. 2 min). */
async function createImages(conn: ShopifyConnection, items: { resourceUrl: string; alt: string; filename: string }[]): Promise<string[]> {
  const res = await shopifyMutation<{ fileCreate: { files: { id: string; fileStatus: string }[]; userErrors: UserError[] } }>(conn, FILE_CREATE, {
    files: items.map((i) => ({ originalSource: i.resourceUrl, contentType: "IMAGE", alt: i.alt, filename: i.filename, duplicateResolutionMode: "APPEND_UUID" })),
  });
  assertNoUserErrors("Crear las imágenes en Shopify", res.fileCreate.userErrors);
  const ids = res.fileCreate.files.map((f) => f.id);
  const deadline = Date.now() + 120_000;
  for (;;) {
    const st = await shopifyQuery<{ nodes: ({ id: string; fileStatus: string; fileErrors: { message: string }[] } | null)[] }>(conn, FILE_STATUS, { ids });
    const failed = st.nodes.find((n) => n?.fileStatus === "FAILED");
    if (failed) throw new PublishError(`Shopify rechazó una imagen: ${failed.fileErrors.map((e) => e.message).join("; ") || "sin detalle"}`);
    if (st.nodes.every((n) => n?.fileStatus === "READY")) return ids;
    if (Date.now() > deadline) throw new PublishError("Shopify tardó demasiado en procesar las imágenes. Intenta publicar de nuevo.");
    await sleep(2000);
  }
}

export interface SourceImage {
  /** «<bucket>/<path>» o la URL: la llave de la caché. */
  key: string;
  /** En Supabase Storage… */
  bucket?: string;
  path?: string;
  /** …o en una URL pública (las fotos que ya estaban en Shopify). */
  url?: string;
  alt: string;
}

async function readSource(img: SourceImage): Promise<{ data: Buffer; name: string }> {
  if (img.bucket && img.path) {
    const file = await adminClient().storage.from(img.bucket).download(img.path);
    if (file.error || !file.data) throw new PublishError(`No pudimos leer una imagen (${img.path})`);
    return { data: Buffer.from(await file.data.arrayBuffer()), name: img.path.split("/").pop() ?? "imagen.jpg" };
  }
  if (!img.url) throw new PublishError("Una imagen no tiene de dónde leerse.");
  const res = await fetch(img.url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new PublishError(`No pudimos descargar una imagen (${res.status})`);
  return { data: Buffer.from(await res.arrayBuffer()), name: new URL(img.url).pathname.split("/").pop() ?? "imagen.jpg" };
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/**
 * Deja cada imagen en Shopify Files una sola vez por tienda (caché shopify_files) y devuelve su GID
 * por llave. Lo que ya estaba subido no se vuelve a subir.
 */
export async function ensureImages(conn: ShopifyConnection, productId: string, images: SourceImage[]): Promise<Map<string, string>> {
  const db = adminClient();
  const out = new Map<string, string>();
  const unique = [...new Map(images.map((i) => [i.key, i])).values()];
  if (!unique.length) return out;
  const { data, error } = await db
    .from("shopify_files")
    .select("source_key, file_gid")
    .eq("user_id", conn.user_id)
    .eq("shop_domain", conn.shop_domain)
    .in("source_key", unique.map((i) => i.key));
  if (error) throw new Error(`Leer los archivos subidos: ${error.message}`);
  const cached = (data ?? []) as { source_key: string; file_gid: string }[];
  if (cached.length) {
    // Si el comerciante borró el archivo en Shopify, la caché miente: se vuelve a subir.
    const st = await shopifyQuery<{ nodes: ({ id: string; fileStatus: string } | null)[] }>(conn, FILE_STATUS, { ids: cached.map((c) => c.file_gid) });
    const alive = new Set(st.nodes.filter((n) => n && n.fileStatus !== "FAILED").map((n) => n!.id));
    for (const r of cached) if (alive.has(r.file_gid)) out.set(r.source_key, r.file_gid);
  }

  const missing = unique.filter((i) => !out.has(i.key));
  // De a 10: cada subida pesa y Shopify procesa las imágenes en paralelo.
  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    const uploads = await Promise.all(
      batch.map(async (img) => {
        const { data, name } = await readSource(img);
        const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
        return { filename: `dropflex-${name}`, mimeType: MIME[ext] ?? "image/jpeg", data };
      }),
    );
    const urls = await stageUploads(conn, "IMAGE", uploads);
    const gids = await createImages(
      conn,
      batch.map((img, j) => ({ resourceUrl: urls[j], alt: img.alt, filename: uploads[j].filename })),
    );
    const rows = batch.map((img, j) => ({ user_id: conn.user_id, product_id: productId, shop_domain: conn.shop_domain, source_key: img.key, file_gid: gids[j] }));
    const ins = await db.from("shopify_files").upsert(rows, { onConflict: "user_id,shop_domain,source_key" });
    if (ins.error) throw new Error(`Guardar los archivos subidos: ${ins.error.message}`);
    batch.forEach((img, j) => out.set(img.key, gids[j]));
  }
  return out;
}
