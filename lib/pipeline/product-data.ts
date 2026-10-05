import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { failure, recordAiGeneration } from "@/lib/ai/track";
import { adminClient } from "@/lib/integrations/admin";
import { productDataSchema, type ProductData } from "@/lib/products/product-data";
import { getProductRow, imagesForGeneration, listImageRows, withDisplayUrls } from "@/lib/products/store";
import { renderPrompt } from "@/lib/prompts/render";
import { activeTemplate } from "@/lib/prompts/store";
import { PRODUCT_DATA_TAGS } from "@/lib/prompts/tags";
import { OptimizeError, requireAiKey } from "./errors";
import { imageBlock } from "./images";

// Información base › «Identificar con IA» (docs/spec-estrategia.md §1): la IA mira la imagen base (y las
// demás en uso) y lo que sabe el comerciante, y escribe el nombre y la descripción del producto que
// llenan DATOS DEL PRODUCTO en la estrategia. El prompt vive en la base (prompt_templates, `product_data`).
// Una llamada corta (effort de la plantilla, por defecto low): se hace mientras la pantalla espera.

/** Imágenes que lee el modelo: las primeras en uso, la base primero. */
const MAX_IMAGES = 6;
/** Tope por comerciante en 24 h. */
const DAILY_LIMIT = 40;

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Guarda los datos (los de la IA o los que escribió el comerciante). */
export async function saveProductData(userId: string, productId: string, data: ProductData): Promise<ProductData> {
  const { data: rows, error } = await adminClient()
    .from("products")
    .update({ product_data: data, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", productId)
    .select("id");
  fail("Guardar los datos del producto", error);
  if (!rows?.length) throw new OptimizeError("No encontramos ese producto.", 404);
  return data;
}

/** Identifica el producto con IA y guarda el resultado. Lanza OptimizeError con el motivo en español. */
export async function identifyProduct(userId: string, productId: string): Promise<ProductData> {
  await requireAiKey(userId);
  const product = await getProductRow(userId, productId);
  if (!product) throw new OptimizeError("No encontramos ese producto.", 404);
  const rows = imagesForGeneration(await listImageRows(userId, [productId])).slice(0, MAX_IMAGES);
  if (!rows.length) throw new OptimizeError("Agrega al menos una imagen del producto para identificarlo.", 409);

  const db = adminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("step", "product_data").gte("created_at", since);
  fail("Contar identificaciones", recent.error);
  if ((recent.count ?? 0) >= DAILY_LIMIT) throw new OptimizeError(`Llegaste al máximo de ${DAILY_LIMIT} identificaciones en 24 horas. Vuelve a intentarlo mañana.`, 429);

  const template = await activeTemplate("product_data");
  // La imagen base va primero: es la foto principal. Una que no abre se salta; si es la base, se avisa.
  const urls = await withDisplayUrls(rows);
  const blocks = await Promise.all(
    rows.map(async (r) => {
      const url = urls.get(r.id);
      if (!url) return null;
      return imageBlock(url).catch((e: unknown) => {
        console.warn(`[product-data] imagen ${r.id} no se pudo leer:`, (e as Error).message);
        return null;
      });
    }),
  );
  if (!blocks[0]) throw new OptimizeError("No pudimos abrir la imagen base. Elige otra como base o vuelve a subirla.", 409);
  const prompt = renderPrompt(template.body, PRODUCT_DATA_TAGS, { shopifyTitle: product.title, baseInfo: product.base_info });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [...blocks.filter((b): b is NonNullable<typeof b> => !!b), { type: "text", text: prompt }];

  try {
    const { data, usage } = await generateStructured({
      userId,
      system: "",
      content,
      schema: productDataSchema,
      effort: template.effort,
      maxTokens: template.max_tokens,
      model: template.model,
    });
    await recordAiGeneration({ userId, productId, step: "product_data", usage, promptVersion: template.version });
    return saveProductData(userId, productId, {
      name: data.product_name.trim(),
      description: data.description.trim(),
      source: "ai",
      updated_at: new Date().toISOString(),
      prompt_version: template.version,
      model: usage.model,
    });
  } catch (e) {
    if (!(e instanceof AiStepError)) throw e;
    if (!e.logged) await recordAiGeneration({ userId, productId, step: "product_data", promptVersion: template.version, ...failure(e) });
    throw new OptimizeError(e.message, e.code === "no_key" ? 409 : 502);
  }
}
