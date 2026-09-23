// Color de acento de la página del producto: botones y detalles de la tienda. Se guarda en hex
// (#rrggbb, minúsculas) en products.page_accent_color; lo usará la etapa Publicar. Puro.
//
// Contraste WCAG 2.1: todos los de la paleta llevan texto blanco encima con al menos 4,5:1 (AA para
// texto normal) y se leen como texto sobre fondo blanco con el mismo contraste.

export interface AccentOption {
  hex: string;
  name: string;
}

/** 18 colores sólidos, del azul al neutro. Cada uno pasa 4,5:1 con texto blanco (probado en accent.test.ts). */
export const ACCENT_PALETTE: AccentOption[] = [
  { hex: "#1f4bd8", name: "Cobalto" },
  { hex: "#1e3a8a", name: "Azul marino" },
  { hex: "#0e7490", name: "Petróleo" },
  { hex: "#0f766e", name: "Verde azulado" },
  { hex: "#047857", name: "Esmeralda" },
  { hex: "#15803d", name: "Verde" },
  { hex: "#3f6212", name: "Oliva" },
  { hex: "#92400e", name: "Ámbar tostado" },
  { hex: "#9a3412", name: "Terracota" },
  { hex: "#b91c1c", name: "Rojo" },
  { hex: "#be123c", name: "Frambuesa" },
  { hex: "#be185d", name: "Rosa intenso" },
  { hex: "#a21caf", name: "Fucsia" },
  { hex: "#7e22ce", name: "Púrpura" },
  { hex: "#4338ca", name: "Índigo" },
  { hex: "#78350f", name: "Café" },
  { hex: "#374151", name: "Grafito" },
  { hex: "#111827", name: "Negro" },
];

export const DEFAULT_ACCENT = ACCENT_PALETTE[0].hex;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** «1F4BD8», «#1f4bd8» o «#14d» → «#1f4bd8». null si no es un hex válido. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(HEX);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores hex normalizados (1 a 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const WHITE = "#ffffff";
export const BLACK = "#000000";
/** AA para texto normal. */
export const MIN_CONTRAST = 4.5;

/** El texto que va encima del acento (blanco o negro, el de más contraste) y su contraste. */
export function onAccent(hex: string): { text: string; ratio: number } {
  const white = contrast(hex, WHITE);
  const black = contrast(hex, BLACK);
  return white >= black ? { text: WHITE, ratio: white } : { text: BLACK, ratio: black };
}

/** Cómo se lee el acento: como botón (texto encima) y como texto o enlace sobre el fondo blanco de la tienda. */
export function accentCheck(hex: string): { onAccent: string; buttonRatio: number; onWhiteRatio: number; ok: boolean } {
  const { text, ratio } = onAccent(hex);
  const onWhiteRatio = contrast(hex, WHITE);
  return { onAccent: text, buttonRatio: ratio, onWhiteRatio, ok: ratio >= MIN_CONTRAST && onWhiteRatio >= 3 };
}
