import { referenceWidgetScript } from "./visual-reference-widget-script";
import tokens from "@/design-system/tokens.json";
import { colorToken, colorTokens } from "@/lib/tokens";

export const VISUAL_REFERENCE_UI = "ui://dropflex/visual-reference/v1.html";

export function visualReferenceResource() {
  const variables = (theme: "light" | "dark") => colorTokens.map(token => `--${token.name}:${colorToken(token.name, theme)};`).join("");
  const measures = [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.size.tokens].map(token => `--${token.name}:${token.value};`).join("");
  const body = tokens.type.groups[0].styles.find(style => style.name === "type-body")!;
  const heading = tokens.type.groups[0].styles.find(style => style.name === "type-heading")!;
  const style = `:root{${variables("light")}${measures}}[data-theme=dark]{${variables("dark")}}
    body{margin:0;padding:var(--space-4);background:var(--background);color:var(--foreground);font-family:${tokens.type.families.sans};font-size:${body.fontSize};line-height:${body.lineHeight}}
    main{max-width:var(--size-content);margin:auto;display:grid;gap:var(--space-3)}h2,p{margin:0}h2{font-size:${heading.fontSize};line-height:${heading.lineHeight};font-weight:${heading.fontWeight}}
    img{width:100%;height:auto;border-radius:var(--radius-md)}button{font:inherit;min-height:var(--size-touch);padding:var(--space-2) var(--space-4);border:0;border-radius:var(--radius-md);background:var(--primary);color:var(--primary-foreground);cursor:pointer}
    button:disabled{background:var(--muted);color:var(--muted-foreground);cursor:default}#review{background:var(--secondary);color:var(--secondary-foreground)}a{color:var(--primary);min-height:var(--size-touch);display:flex;align-items:center}p{color:var(--muted-foreground)}
    :focus-visible{box-shadow:0 0 0 calc(var(--space-1)/2) var(--background);outline:calc(var(--space-1)/2) solid var(--ring);outline-offset:calc(var(--space-1)/2)}[hidden]{display:none}`;
  // Dominios conocidos del storage y del origen Shopify; nunca un origen pasado por el cliente.
  const domains = ["https://cdn.shopify.com"];
  try { const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!); if (url.protocol === "https:") domains.push(url.origin); } catch { /* Tests sin configuración de storage. */ }
  return { uri: VISUAL_REFERENCE_UI, name: "Referencia original del producto", mimeType: "text/html;profile=mcp-app",
    text: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style></head><body><main><h2>Referencia original del producto</h2><img id="reference" alt="Foto original del producto guardada en DropFlex" hidden><button id="attach" disabled>Adjuntar referencia al chat</button><button id="review" hidden>Revisar referencia en el chat</button><p id="status" role="status">Recuperando la referencia…</p><a id="download" target="_blank" rel="noopener noreferrer" hidden>Abrir fotografía original</a></main><script>${referenceWidgetScript}</script></body></html>`,
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: domains, resourceDomains: domains } }, "openai/widgetDescription": "Muestra la referencia original. El comerciante puede adjuntarla como archivo de ChatGPT con hash verificado. No genera imágenes." } };
}
