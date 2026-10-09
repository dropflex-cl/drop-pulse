import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { RequestOptions } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import sharp from "sharp";
import { adminClient } from "@/lib/integrations/admin";
import { optimizeImage } from "@/lib/media/optimize";
import { ProductIntelligenceError } from "./errors";
import { VISUAL_LIMITS } from "./visual-schemas";

export const visualByteHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function publicVisualAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
/** DNS is pinned to the validated address for each request, including redirects. */
export async function downloadVisual(raw: string, signal = AbortSignal.timeout(20000), allowOctetStream = false): Promise<Buffer> {
  let url = new URL(raw);
  for (let hop = 0; hop <= 3; hop++) {
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new ProductIntelligenceError("VALIDATION_ERROR", "Usa una URL HTTPS pública de la imagen.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    if (!addresses.length || addresses.some(a => !publicVisualAddress(a.address))) throw new ProductIntelligenceError("VALIDATION_ERROR", "La dirección debe ser pública. Usa el ticket de subida si el archivo es local.");
    const pinned = addresses[0];
    const response = await new Promise<{ bytes?: Buffer; redirect?: string }>((resolve, reject) => {
      const options: RequestOptions & { autoSelectFamily: boolean } = { family: pinned.family, autoSelectFamily: false };
      const req = request(url, { ...options, signal, headers: { Accept: "image/jpeg,image/png,image/webp" }, lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family) }, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve({ redirect: res.headers.location }); return; }
        const contentType = res.headers["content-type"] ?? "";
        const supported = /^image\/(jpeg|png|webp)(;|$)/i.test(contentType) || allowOctetStream && /^application\/octet-stream(;|$)/i.test(contentType);
        if (res.statusCode !== 200 || !supported) { res.destroy(); reject(new ProductIntelligenceError("VALIDATION_ERROR", "El enlace no devolvió una imagen JPG, PNG o WebP. Renueva el archivo o súbelo con un ticket.")); return; }
        if (Number(res.headers["content-length"]) > VISUAL_LIMITS.uploadBytes) { res.destroy(); reject(new Error("La imagen supera los 15 MB.")); return; }
        const chunks: Buffer[] = []; let size = 0;
        res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > VISUAL_LIMITS.uploadBytes) res.destroy(new Error("La imagen supera los 15 MB.")); else chunks.push(chunk); });
        res.on("error", reject); res.on("end", () => resolve({ bytes: Buffer.concat(chunks) }));
      });
      req.on("error", reject); req.end();
    });
    if (response.bytes) return response.bytes;
    url = new URL(response.redirect!, url);
  }
  throw new ProductIntelligenceError("VALIDATION_ERROR", "El enlace tiene demasiadas redirecciones. Usa su URL final.");
}
export async function optimizeVisual(bytes: Uint8Array) {
  if (bytes.byteLength > VISUAL_LIMITS.uploadBytes) throw new Error("La imagen supera los 15 MB.");
  const meta = await sharp(bytes, { limitInputPixels: VISUAL_LIMITS.maxPixels, failOn: "error" }).metadata();
  if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("Usa una imagen estática JPG, PNG o WebP válida.");
  if (Math.min(meta.width, meta.height) < VISUAL_LIMITS.minSide) throw new Error("La imagen necesita al menos 600 píxeles por lado.");
  return optimizeImage(bytes);
}
export async function visualStoredBytes(bucket: string, path: string) {
  const { data, error } = await adminClient().storage.from(bucket).download(path);
  if (error || !data || data.size > VISUAL_LIMITS.uploadBytes) throw new Error("No pudimos leer la imagen. Revisa el archivo y vuelve a subirlo.");
  return Buffer.from(await data.arrayBuffer());
}
export async function visualSignedUrl(bucket: string, path: string) {
  const { data, error } = await adminClient().storage.from(bucket).createSignedUrl(path, VISUAL_LIMITS.snapshotSeconds);
  if (error || !data) throw new Error("No pudimos abrir la imagen. Intenta de nuevo.");
  return data.signedUrl;
}
