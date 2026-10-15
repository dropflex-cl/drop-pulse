import "server-only";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { shopifyMutation } from "@/lib/integrations/shopify/client";
import { assertNoUserErrors, PublishError } from "./files";
import type { PublishInput } from "./mapping";
import { getThemeInstallation, readThemeFile } from "./theme";
import { parseJson } from "./template-rules";

type Block = { type: string; disabled?: boolean; blocks?: Record<string, Block>; block_order?: string[]; [key: string]: unknown };

/** La visibilidad por producto vive en conversion_supports; el bloque del template debe renderizar. */
export function visibleGifTemplate(source: string): string | null {
  let template: { sections: Record<string, Block>; order: string[] };
  try { template = parseJson(source); }
  catch { throw new PublishError("No pudimos leer la plantilla del producto. Revisa el tema en Shopify y vuelve a publicar."); }
  const candidates = Object.entries(template?.sections ?? {}).flatMap(([sectionId, section]) =>
    section.type === "product-information" ? Object.entries(section.blocks ?? {}).filter(([, block]) => block.type === "_product-details").map(([id, details]) => ({ sectionId, section, id, details })) : []);
  if (candidates.length !== 1) throw new PublishError("No encontramos dónde mostrar los GIFs en esta plantilla. Actualiza el tema de DropFlex y vuelve a publicar.");
  const { sectionId, section, id, details } = candidates[0];
  // Horizon renderiza _product-details como bloque estático: su padre no tiene block_order.
  if (section.disabled || details.disabled || !template.order?.includes(sectionId) || (Array.isArray(section.block_order) && !section.block_order.includes(id)))
    throw new PublishError("La sección del producto está oculta en Shopify. Muéstrala en el editor del tema y vuelve a publicar los GIFs.");
  const blocks = details.blocks ??= {};
  const order = details.block_order ??= [];
  const gifIds = Object.keys(blocks).filter(key => blocks[key].type === "df-gif-strip");
  if (gifIds.length > 1) throw new PublishError("La plantilla tiene más de un bloque GIFs. Conserva uno en el editor del tema y vuelve a publicar.");
  let gifId = gifIds[0];
  let changed = false;
  if (!gifId) {
    gifId = "gif_strip";
    while (blocks[gifId]) gifId += "_";
    blocks[gifId] = { type: "df-gif-strip", settings: {} };
    changed = true;
  }
  if (blocks[gifId].disabled === true) { blocks[gifId].disabled = false; changed = true; }
  if (!order.includes(gifId)) {
    const after = order.findIndex(key => blocks[key]?.type === "df-benefit-double-box");
    const before = order.findIndex(key => ["df-review-slider", "df-ugc-slider"].includes(blocks[key]?.type));
    order.splice(after >= 0 ? after + 1 : before >= 0 ? before : order.length, 0, gifId);
    changed = true;
  }
  return changed ? JSON.stringify(template) : null;
}

/** Solo al publicar contenido efectivo con GIFs; guardar medios nunca escribe en el tema. */
export async function ensureGifTemplateVisible(conn: ShopifyConnection, input: Pick<PublishInput, "components" | "disabledConversionComponents">, suffix: string | null, beforeWrite?: () => Promise<void>): Promise<void> {
  const gif = input.components.find(component => component.id === "gif-strip");
  if (!gif || input.disabledConversionComponents?.includes("gif-strip") ||
    ![gif.images, ...(gif.variantImages?.map(variant => variant.images) ?? [])].some(images => images.gifs?.length)) return;
  const installed = await getThemeInstallation(conn.user_id);
  // Se puede guardar la publicación antes de instalar el tema. Un kit nuevo ya trae el bloque visible.
  if (!installed?.theme_gid || installed.shop_domain !== conn.shop_domain) return;
  let filename = `templates/product${suffix ? `.${suffix}` : ""}.json`;
  let source = await readThemeFile(conn, installed.theme_gid, filename);
  if (!source && suffix) {
    if (await readThemeFile(conn, installed.theme_gid, `templates/product.${suffix}.liquid`))
      throw new PublishError("La plantilla Liquid de este producto no permite mostrar los GIFs automáticamente. Usa una plantilla JSON de DropFlex y vuelve a publicar.");
    filename = "templates/product.json";
    source = await readThemeFile(conn, installed.theme_gid, filename);
  }
  if (!source) throw new PublishError("Falta la plantilla del producto. Actualiza el tema de DropFlex y vuelve a publicar.");
  const value = visibleGifTemplate(source);
  if (!value) return;
  if (!await readThemeFile(conn, installed.theme_gid, "blocks/df-gif-strip.liquid"))
    throw new PublishError("Falta el bloque GIFs en Shopify. Actualiza el tema de DropFlex y vuelve a publicar.");
  await beforeWrite?.();
  const result = await shopifyMutation<{ themeFilesUpsert: { userErrors: { message: string }[] } }>(conn, `
    mutation ShowProductGifs($id: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $id, files: $files) { userErrors { message } }
    }`, { id: installed.theme_gid, files: [{ filename, body: { type: "TEXT", value } }] });
  assertNoUserErrors("Mostrar los GIFs en el tema", result.themeFilesUpsert.userErrors);
  const saved = await readThemeFile(conn, installed.theme_gid, filename);
  if (!saved || visibleGifTemplate(saved)) throw new PublishError("Shopify todavía no muestra el bloque GIFs. Intenta publicar de nuevo.");
}
