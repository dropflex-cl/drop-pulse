import "server-only";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { adminClient } from "@/lib/integrations/admin";
import { REFERENCES_BUCKET, withDisplayUrls, toReferenceImage, type ImageRow } from "./store";
import { ProductApiError } from "./http";
import type { ReferenceImage } from "@/lib/types";

// Imágenes de referencia agregadas por el comerciante (ImageUploader): desde su equipo o desde un
// enlace. JPG, PNG o WEBP, hasta 10 MB cada una y 10 agregadas por producto. Se guardan en Storage
// (privado) para no depender del enlace original.

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ADDED_PER_PRODUCT = 10;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

type Kind = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** El tipo real, por los primeros bytes (no por la extensión ni por lo que declare el cliente). */
export function sniffImage(bytes: Uint8Array): Kind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { mime: "image/webp", ext: "webp" };
  return null;
}

async function assertRoom(userId: string, productId: string) {
  const { count, error } = await adminClient()
    .from("product_reference_images")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .neq("source", "shopify");
  if (error) throw new Error(`Contar imágenes: ${error.message}`);
  if ((count ?? 0) >= MAX_ADDED_PER_PRODUCT) {
    throw new ProductApiError(`Ya agregaste ${MAX_ADDED_PER_PRODUCT} imágenes a este producto. Excluye o reemplaza alguna.`, 409);
  }
}

async function insertRow(
  userId: string,
  productId: string,
  path: string,
  kind: Kind,
  size: number,
  meta: { source: "upload" | "url"; alt: string; sourceUrl?: string },
): Promise<ReferenceImage> {
  const db = adminClient();
  const { data: last } = await db
    .from("product_reference_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from("product_reference_images")
    .insert({
      product_id: productId,
      user_id: userId,
      source: meta.source,
      storage_path: path,
      source_url: meta.sourceUrl ?? null,
      alt: meta.alt.slice(0, 200),
      mime_type: kind.mime,
      size_bytes: size,
      position: ((last?.position as number | undefined) ?? -1) + 1,
    })
    .select("id, product_id, source, url, storage_path, alt, position, is_cover, is_base, excluded")
    .single();
  if (error) {
    await db.storage.from(REFERENCES_BUCKET).remove([path]);
    throw new Error(`Guardar la imagen: ${error.message}`);
  }
  const row = data as ImageRow;
  const urls = await withDisplayUrls([row]);
  return toReferenceImage(row, urls.get(row.id) ?? "");
}

/** Guarda en Storage bytes que ya tiene el servidor (los traídos por enlace). */
async function store(
  userId: string,
  productId: string,
  bytes: Uint8Array,
  meta: { source: "upload" | "url"; alt: string; sourceUrl?: string },
): Promise<ReferenceImage> {
  if (bytes.byteLength > MAX_BYTES) throw new ProductApiError("La imagen pesa más de 10 MB. Usa una más liviana.", 413);
  const kind = sniffImage(bytes);
  if (!kind) throw new ProductApiError("Solo imágenes JPG, PNG o WEBP.", 415);
  await assertRoom(userId, productId);
  const path = `${userId}/${productId}/${randomUUID()}.${kind.ext}`;
  const up = await adminClient().storage.from(REFERENCES_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) throw new Error(`Subir la imagen: ${up.error.message}`);
  return insertRow(userId, productId, path, kind, bytes.byteLength, meta);
}

// ---------------------------------------------------------------- Desde el equipo
// El navegador sube directo a Storage con una URL firmada: una función de Vercel no acepta cuerpos
// de 10 MB. Después la app confirma: revisa el tipo real por los primeros bytes y registra la imagen.

const EXT: Record<string, Kind["ext"]> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function prepareUpload(userId: string, productId: string, file: { type?: string; size?: number }) {
  const ext = file.type ? EXT[file.type] : undefined;
  if (!ext) throw new ProductApiError("Solo imágenes JPG, PNG o WEBP.", 415, "file");
  if (!file.size || file.size > MAX_BYTES) throw new ProductApiError("La imagen pesa más de 10 MB. Usa una más liviana.", 413, "file");
  await assertRoom(userId, productId);
  const path = `${userId}/${productId}/${randomUUID()}.${ext}`;
  const { data, error } = await adminClient().storage.from(REFERENCES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Preparar la subida: ${error?.message ?? "sin URL"}`);
  return { path, uploadUrl: data.signedUrl };
}

export async function confirmUpload(userId: string, productId: string, path: string, name: string): Promise<ReferenceImage> {
  // Solo rutas propias de este producto: nadie registra un archivo ajeno.
  if (!path.startsWith(`${userId}/${productId}/`) || path.includes("..")) throw new ProductApiError("Esa subida no es de este producto.", 400, "path");
  const db = adminClient();
  const { data: blob, error } = await db.storage.from(REFERENCES_BUCKET).download(path);
  if (error || !blob) throw new ProductApiError("No encontramos la imagen subida. Intenta subirla de nuevo.", 404, "path");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind || bytes.byteLength > MAX_BYTES) {
    await db.storage.from(REFERENCES_BUCKET).remove([path]);
    throw new ProductApiError(kind ? "La imagen pesa más de 10 MB. Usa una más liviana." : "Solo imágenes JPG, PNG o WEBP.", 415, "file");
  }
  // Varias subidas en paralelo pudieron pasar el control al prepararse: se vuelve a mirar el tope.
  try {
    await assertRoom(userId, productId);
  } catch (e) {
    await db.storage.from(REFERENCES_BUCKET).remove([path]);
    throw e;
  }
  return insertRow(userId, productId, path, kind, bytes.byteLength, { source: "upload", alt: name.replace(/\.[a-z0-9]+$/i, "") });
}

// ---------------------------------------------------------------- Desde un enlace

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Solo http(s) hacia direcciones públicas: el servidor no descarga nada de la red interna. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ProductApiError("Ese enlace no es válido. Copia la dirección completa, con https://.", 400, "url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProductApiError("Ese enlace no es válido. Copia la dirección completa, con https://.", 400, "url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new ProductApiError("No encontramos ese sitio. Revisa el enlace.", 400, "url");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new ProductApiError("Ese enlace no es público. Usa el enlace de la imagen en la página del proveedor.", 400, "url");
  return url;
}

async function download(raw: string): Promise<{ bytes: Uint8Array; finalUrl: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" },
      });
    } catch {
      throw new ProductApiError("El sitio no respondió. Intenta de nuevo o descarga la imagen y súbela desde tu equipo.", 502, "url");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new ProductApiError(`El sitio respondió con un error (${res.status}). Revisa el enlace.`, 502, "url");
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) {
      throw new ProductApiError("Ese enlace es una página, no una imagen. Abre la imagen y copia su dirección.", 400, "url");
    }
    const length = Number(res.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BYTES) throw new ProductApiError("La imagen pesa más de 10 MB. Usa una más liviana.", 413, "url");

    // Leer con tope: un servidor sin content-length no puede mandarnos gigas.
    const reader = res.body?.getReader();
    if (!reader) throw new ProductApiError("El sitio no devolvió una imagen. Revisa el enlace.", 400, "url");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ProductApiError("La imagen pesa más de 10 MB. Usa una más liviana.", 413, "url");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { bytes, finalUrl: url.toString() };
  }
  throw new ProductApiError("El enlace redirige demasiadas veces. Abre la imagen y copia su dirección final.", 400, "url");
}

export async function addImageFromUrl(userId: string, productId: string, raw: string): Promise<ReferenceImage> {
  const { bytes, finalUrl } = await download(raw);
  if (!sniffImage(bytes)) {
    throw new ProductApiError("Ese enlace no es una imagen JPG, PNG o WEBP. Abre la imagen y copia su dirección.", 415, "url");
  }
  const name = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  return store(userId, productId, bytes, { source: "url", alt: name || "Imagen del enlace", sourceUrl: finalUrl });
}

export async function setImageExcluded(userId: string, productId: string, imageId: string, excluded: boolean) {
  let q = adminClient()
    .from("product_reference_images")
    .update({ excluded })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("id", imageId);
  // La imagen base no se excluye: primero se elige otra como base.
  if (excluded) q = q.eq("is_base", false);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`Guardar la imagen: ${error.message}`);
  if (!data?.length) {
    if (excluded) {
      const { data: row } = await adminClient().from("product_reference_images").select("is_base").eq("user_id", userId).eq("product_id", productId).eq("id", imageId).maybeSingle();
      if (row?.is_base) throw new ProductApiError("Es la imagen base. Elige otra como base antes de dejar de usarla.", 409);
    }
    throw new ProductApiError("No encontramos esa imagen.", 404);
  }
}

/** Elige la imagen base del producto (y la vuelve a usar si estaba excluida). */
export async function setBaseImage(userId: string, productId: string, imageId: string) {
  const { data, error } = await adminClient().rpc("set_base_reference_image", { p_user_id: userId, p_product_id: productId, p_image_id: imageId });
  if (error) throw new Error(`Elegir la imagen base: ${error.message}`);
  if (!data) throw new ProductApiError("No encontramos esa imagen.", 404);
}
