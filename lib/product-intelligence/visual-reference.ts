import sharp from "sharp";
import { createHash } from "node:crypto";
import { ProductIntelligenceError } from "./errors";
import { VISUAL_LIMITS } from "./visual-schemas";

// Deja espacio para metadata duplicada y el bloque base64 dentro de 128 KiB MCP.
export const REFERENCE_IMAGE_BYTES = 80 * 1024;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Preview derivada sin recorte ni cambios de color, forma o transparencia. */
export async function referenceImageContent(original: Buffer) {
  if (original.length > VISUAL_LIMITS.uploadBytes) throw new ProductIntelligenceError("VALIDATION_ERROR", "La referencia supera el tamaño permitido. Reemplázala en Información base.");
  const metadata = await sharp(original, { limitInputPixels: VISUAL_LIMITS.maxPixels, failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new ProductIntelligenceError("VALIDATION_ERROR", "La referencia necesita una imagen estática JPG, PNG o WebP válida.");
  }
  let bytes = original, mime = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
  // EXIF aplicado también cuando el archivo original cabría en el transporte.
  if (original.length > REFERENCE_IMAGE_BYTES || metadata.orientation && metadata.orientation !== 1) {
    for (const side of [1600, 1200, 960, 768, 600]) {
      bytes = await sharp(original, { limitInputPixels: VISUAL_LIMITS.maxPixels, failOn: "error" }).rotate()
        .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, smartSubsample: true }).toBuffer();
      if (bytes.length <= REFERENCE_IMAGE_BYTES) break;
    }
    mime = "image/webp";
  }
  if (bytes.length > REFERENCE_IMAGE_BYTES) throw new ProductIntelligenceError("RESPONSE_TOO_LARGE", "La referencia no cabe como adjunto MCP sin perder detalle. Descarga la URL canónica y adjunta el archivo original al generador.");
  const image = await sharp(bytes).metadata();
  return {
    content: { type: "image" as const, data: bytes.toString("base64"), mimeType: mime },
    metadata: { mime_type: mime as "image/jpeg" | "image/png" | "image/webp", width: image.width!, height: image.height!,
      content_hash: hash(bytes), derived: !bytes.equals(original), delivery: "mcp_image_content" as const },
  };
}
