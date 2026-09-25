// Piezas puras de la lectura de una tienda de la competencia (lib/competitors/fetch.ts): validar el
// link, decidir si una IP es privada (anti-SSRF) y pasar el HTML a texto. Sin I/O, con tests.

/** Tope del texto que se le pasa al modelo. */
export const MAX_TEXT_CHARS = 20_000;
const MAX_URL_CHARS = 2048;

/**
 * El link pegado por el comerciante, normalizado (https:// si no trae esquema, sin #fragmento), o
 * null si no sirve: solo http/https, sin usuario ni clave, con un host con dominio o una IP.
 */
export function normalizeCompetitorUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_URL_CHARS || /\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname;
  if (!host) return null;
  const literal = ipLiteral(host);
  if (literal) {
    if (isPrivateAddress(literal)) return null;
  } else if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost" || host.endsWith(".localhost")) {
    return null;
  }
  url.hash = "";
  return url.toString();
}

/** La IP de un hostname que ya es una IP (sin corchetes), o null si es un nombre. */
export function ipLiteral(host: string): string | null {
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (parseIPv4(h)) return h;
  if (h.includes(":") && parseIPv6(h)) return h;
  return null;
}

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** Los 8 grupos de 16 bits de una IPv6 (acepta `::` y la cola IPv4 `::ffff:1.2.3.4`). */
function parseIPv6(input: string): number[] | null {
  let ip = input.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  // Cola IPv4 → dos grupos hex.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    ip = `${ip.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const part = (s: string) => (s ? s.split(":") : []);
  const head = part(halves[0]);
  const rest = halves.length === 2 ? part(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

function privateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "esta red"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local y metadatos de la nube (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24 (IETF) y 192.0.2/24 (documentación)
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // pruebas de rendimiento
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reservado y broadcast
  );
}

/**
 * La dirección no es de internet público: loopback, privada, link-local, CGNAT, metadatos, multicast
 * o reservada (IPv4 e IPv6, también IPv4 dentro de IPv6). Lo que no se puede leer cuenta como privada.
 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return privateV4(v4);
  const g = parseIPv6(ip);
  if (!g) return true;
  const embedded = () => [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // ::ffff:a.b.c.d (mapeada) y ::a.b.c.d (compatible, obsoleta)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return privateV4(embedded());
  // 64:ff9b::/96 (NAT64): vale la IPv4 de adentro.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return privateV4(embedded());
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 únicas locales (incluye fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (obsoleta)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentación
  if (g[0] === 0x2002) return privateV4([g[1] >> 8, g[1] & 0xff, g[2] >> 8, g[2] & 0xff]); // 6to4
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // 100::/64 descarte
  return false;
}

// ---------------------------------------------------------------- HTML → texto

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  agrave: "à", egrave: "è", ccedil: "ç", atilde: "ã", otilde: "õ", acirc: "â", ecirc: "ê", ocirc: "ô",
  iexcl: "¡", iquest: "¿", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·", deg: "°",
  copy: "©", reg: "®", trade: "™", euro: "€", times: "×", frac12: "½",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

const DROP_BLOCKS = /<(script|style|noscript|svg|template|iframe|object|canvas|head)\b[\s\S]*?<\/\1\s*>/gi;
const BREAK_TAGS = /<\/?(br|p|div|section|article|header|footer|main|aside|nav|li|ul|ol|tr|td|th|table|h[1-6]|blockquote|figure|figcaption|dt|dd|details|summary|button|label|option)\b[^>]*>/gi;

/** El texto visible de una página: sin scripts, estilos ni SVG, sin etiquetas, con los espacios juntos. */
export function htmlToText(html: string, max = MAX_TEXT_CHARS): string {
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(DROP_BLOCKS, " ")
      .replace(BREAK_TAGS, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\f\v ​]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return text.length > max ? text.slice(0, max) : text;
}

/** El título de la página: og:title o <title>. */
export function extractTitle(html: string): string | null {
  const og = metaContent(html, "og:title");
  if (og) return og;
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const t = m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
  return t || null;
}

/** El `content` de un <meta property|name="…">. */
export function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${esc}["'][^>]*>`, "i").exec(html)?.[0];
  if (!tag) return null;
  const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const value = decodeEntities((content?.[1] ?? content?.[2] ?? "").replace(/\s+/g, " ").trim());
  return value || null;
}

/**
 * Lo que la página dice de sí misma en sus metadatos (descripción y precio de Open Graph, que las
 * tiendas Shopify publican), como líneas para anteponer al texto. Vacío si no hay.
 */
export function pageMeta(html: string): string {
  const lines: string[] = [];
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  if (description) lines.push(`Descripción: ${description}`);
  const amount = metaContent(html, "og:price:amount") ?? metaContent(html, "product:price:amount");
  const currency = metaContent(html, "og:price:currency") ?? metaContent(html, "product:price:currency");
  if (amount) lines.push(`Precio publicado: ${amount}${currency ? ` ${currency}` : ""}`);
  return lines.join("\n");
}
