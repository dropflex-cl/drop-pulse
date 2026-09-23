import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

// Las imágenes van al modelo como bytes (base64), no como enlaces: si el modelo descarga un enlace
// que falla o que pesa más de 5 MB (las subidas aceptan hasta 10 MB), la API responde 400 y se pierde
// la corrida entera. Aquí se descargan, se validan y se achican a 1568 px (lo más que el modelo usa
// sin reducir) en JPEG, muy por debajo del tope de 5 MB.

const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 1568;

export class ImageLoadError extends Error {}

async function download(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "image/jpeg,image/png,image/webp,image/*" } });
  } catch (e) {
    throw new ImageLoadError(`no se pudo descargar (${(e as Error).message})`);
  }
  if (!res.ok) throw new ImageLoadError(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new ImageLoadError(`pesa ${bytes.byteLength} bytes`);
  return bytes;
}

/** Una imagen lista para el modelo. Lanza ImageLoadError si no se puede descargar o no es una imagen. */
export async function imageBlock(url: string): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const bytes = await download(url);
  let jpeg: Buffer;
  try {
    jpeg = await sharp(bytes, { failOn: "error" })
      .rotate() // respeta la orientación EXIF de las fotos de teléfono
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG con transparencia → fondo blanco
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (e) {
    throw new ImageLoadError(`no es una imagen legible (${(e as Error).message})`);
  }
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } };
}
