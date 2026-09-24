import "server-only";
import sharp from "sharp";

// Toda imagen entra a Storage ya optimizada: la landing la sirve tal cual (vía Shopify Files) y cada
// KB se paga en el tiempo de carga desde un teléfono. Un solo lugar decide formato, tamaño y calidad.
//
// - Landing y referencias → WebP q86 con `smartSubsample` (sin artefactos de color en bordes y textos
//   horneados), a lo más 2400 px por lado: el doble del ancho útil de una ficha en retina. A esa
//   calidad la diferencia con el original no se ve y pesa de 3 a 10 veces menos que un PNG de IA.
// - Anuncios → JPEG progresivo q90 (mozjpeg): Meta no garantiza WebP en /adimages.
// - Animadas (GIF / WebP animado) → WebP animado con todos sus cuadros.
// Nunca se agranda una imagen, y si el original ya es WebP liviano y no hay que achicarlo, se deja.

/** Lado mayor para la landing: nítido en pantallas 2x sin cargar píxeles que nadie ve. */
export const LANDING_MAX_SIDE = 2400;
const WEBP_QUALITY = 86;
const ANIMATED_QUALITY = 72;
const ADS_JPEG_QUALITY = 90;

export interface OptimizedImage {
  data: Buffer;
  mime: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
  width: number;
  height: number;
  /** Peso antes de optimizar, para medir lo ahorrado. */
  originalBytes: number;
}

export class ImageOptimizeError extends Error {}

async function readMeta(bytes: Buffer) {
  const meta = await sharp(bytes, { animated: true }).metadata().catch(() => null);
  if (!meta?.width || !meta.height || !meta.format) throw new ImageOptimizeError("No es una imagen legible.");
  return meta;
}

/** WebP para la landing (o cualquier imagen que se muestre en la tienda o en la app). */
export async function optimizeImage(input: Uint8Array, opts: { maxSide?: number } = {}): Promise<OptimizedImage> {
  const bytes = Buffer.from(input);
  const maxSide = opts.maxSide ?? LANDING_MAX_SIDE;
  const meta = await readMeta(bytes);
  const frameHeight = meta.pageHeight ?? meta.height!;
  const animated = (meta.pages ?? 1) > 1;
  // `rotate()` aplica el EXIF de las fotos de teléfono: al quitar los metadatos ya no se podría.
  const rotated = !animated && (meta.orientation ?? 1) >= 5;
  const [w, h] = rotated ? [frameHeight, meta.width!] : [meta.width!, frameHeight];
  const needsResize = Math.max(w, h) > maxSide;

  if (meta.format === "webp" && !needsResize && !(meta.orientation && meta.orientation > 1)) {
    // Ya es WebP y del tamaño correcto: re-codificar solo perdería calidad si no gana peso.
    const keep = { data: bytes, mime: "image/webp" as const, ext: "webp" as const, width: w, height: h, originalBytes: bytes.byteLength };
    if (animated) return keep;
    const out = await encodeWebp(bytes, maxSide, false);
    return out.data.byteLength < bytes.byteLength * 0.9 ? { ...out, originalBytes: bytes.byteLength } : keep;
  }
  return { ...(await encodeWebp(bytes, maxSide, animated)), originalBytes: bytes.byteLength };
}

async function encodeWebp(bytes: Buffer, maxSide: number, animated: boolean) {
  try {
    const pipeline = animated
      ? sharp(bytes, { animated: true, failOn: "error" })
          .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
          .webp({ quality: ANIMATED_QUALITY, effort: 4 })
      : sharp(bytes, { failOn: "error" })
          .rotate()
          .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY, alphaQuality: 100, smartSubsample: true, effort: 5 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const height = animated ? (info.pageHeight ?? info.height) : info.height;
    return { data, mime: "image/webp" as const, ext: "webp" as const, width: info.width, height };
  } catch (e) {
    throw new ImageOptimizeError(`No pudimos optimizar la imagen (${(e as Error).message})`);
  }
}

/** JPEG para lo que va a Meta Ads: progresivo, mozjpeg, sin transparencia (fondo blanco). */
export async function optimizeForAds(input: Uint8Array, opts: { maxSide?: number } = {}): Promise<OptimizedImage> {
  const bytes = Buffer.from(input);
  await readMeta(bytes);
  try {
    const { data, info } = await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({ width: opts.maxSide ?? LANDING_MAX_SIDE, height: opts.maxSide ?? LANDING_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: ADS_JPEG_QUALITY, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
    return { data, mime: "image/jpeg", ext: "jpg", width: info.width, height: info.height, originalBytes: bytes.byteLength };
  } catch (e) {
    throw new ImageOptimizeError(`No pudimos optimizar la imagen (${(e as Error).message})`);
  }
}

/** La ruta con la extensión del formato optimizado: `a/b/foto.png` → `a/b/foto.webp`. */
export function withExt(path: string, ext: string): string {
  return path.replace(/\.[a-z0-9]+$/i, "") + `.${ext}`;
}
