// Reglas de los creativos (docs/spec-anuncios.md §7.2), compartidas por el navegador (antes de subir)
// y el servidor (al confirmar). Puro.

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_MEDIA_PER_PRODUCT = 30;
export const ACCEPTED_MEDIA = "image/jpeg,image/png,video/mp4,video/quicktime";
export const MEDIA_FORMATS = "Imagen JPG o PNG · video MP4 o MOV · 1:1, 4:5 o 9:16";
export const FORMAT_ERROR = "Solo imagen JPG o PNG, o video MP4 o MOV.";
export const RATIO_ERROR = "La proporción tiene que ser 1:1, 4:5 o 9:16. Recórtalo y súbelo de nuevo.";

export type MediaRatio = "1:1" | "4:5" | "9:16";

/** La proporción aceptada más cercana (2 % de tolerancia), o null. */
export function ratioOf(width: number, height: number): MediaRatio | null {
  if (!(width > 0 && height > 0)) return null;
  const r = width / height;
  const options: [MediaRatio, number][] = [
    ["1:1", 1],
    ["4:5", 0.8],
    ["9:16", 9 / 16],
  ];
  return options.find(([, v]) => Math.abs(r - v) / v <= 0.02)?.[0] ?? null;
}

/** El tipo real por los primeros bytes: JPG, PNG o un contenedor MP4/MOV («ftyp»). */
export function sniffMedia(bytes: Uint8Array): { kind: "image" | "video"; mime: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { kind: "image", mime: "image/png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return { kind: "video", mime: brand.startsWith("qt") ? "video/quicktime" : "video/mp4" };
  }
  return null;
}

/** «0:18» */
export function durationLabel(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s)) return null;
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
