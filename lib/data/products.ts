// Acceso a productos desde Supabase (products, product_reference_images, pipeline_runs y
// customer_avatars). Los textos e imágenes generados todavía no existen: esas lecturas devuelven
// vacío y las pantallas muestran su estado de espera.
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sessionUser } from "@/lib/integrations/session";
import { NOTE } from "@/lib/mock/content";
import { syncSelectedProducts } from "@/lib/products/sync";
import { productPosition } from "@/lib/products/stages";
import {
  baseImage,
  expireStaleRuns,
  getProductRow,
  latestAvatars,
  latestBrief,
  latestRuns,
  listImageRows,
  listProductRows,
  toProposal,
  toReferenceImage,
  toRun,
  withDisplayUrls,
  type AvatarRow,
  type ImageRow,
  type ProductRow,
  type RunRow,
} from "@/lib/products/store";
import type { ContentItem, ImageOption, Pricing, Product, ProductBase, ProductFilter } from "@/lib/types";

const userId = cache(async () => {
  const user = await sessionUser();
  if (!user) redirect("/auth/login");
  return user.id;
});

/** La miniatura del producto es su imagen base (o, si todas están excluidas, la primera). */
function cover(images: ImageRow[]): ImageRow | undefined {
  return baseImage(images) ?? images[0];
}

function toProduct(row: ProductRow, image: string, run?: RunRow, avatar?: AvatarRow): Product {
  const position = productPosition({
    price: Number(row.price),
    currency: row.currency,
    run: run ? { status: run.status, error: run.error_message, createdAt: run.created_at } : null,
    avatar: avatar ? { status: toProposal(avatar).status, createdAt: avatar.created_at } : null,
  });
  return {
    id: row.id,
    name: row.title,
    image,
    sku: "",
    filter: position.filter,
    meter: position.meter,
    reason: position.reason,
    tone: position.tone,
    nextStage: position.nextStage,
    stages: position.stages,
    summary: position.summary,
    status: position.status,
    supplierCost: row.cost == null ? 0 : Number(row.cost),
    price: Number(row.price),
    currency: row.currency,
  };
}

/** Todos los productos del comerciante, con su posición en la ruta. Una sola ida por tabla. */
const allProducts = cache(async (): Promise<Product[]> => {
  const uid = await userId();
  // Los elegidos en el onboarding que aún no se crearon (p. ej., antes de esta versión).
  await syncSelectedProducts(uid).catch((e) => console.error("[data/products] sincronizar", e));
  await expireStaleRuns(uid);
  const rows = await listProductRows(uid);
  const ids = rows.map((r) => r.id);
  const [images, runs, avatars] = await Promise.all([listImageRows(uid, ids), latestRuns(uid, ids), latestAvatars(uid, ids)]);
  const covers = rows.map((r) => cover(images.filter((i) => i.product_id === r.id))).filter((i): i is ImageRow => !!i);
  const urls = await withDisplayUrls(covers);
  return rows.map((r) => {
    const c = covers.find((i) => i.product_id === r.id);
    return toProduct(r, c ? (urls.get(c.id) ?? "") : "", runs.get(r.id), avatars.get(r.id));
  });
});

export async function getProducts(filter?: ProductFilter): Promise<Product[]> {
  const all = await allProducts();
  return filter ? all.filter((p) => p.filter === filter) : all;
}

export async function getProductCounts(): Promise<Record<ProductFilter, number> & { total: number }> {
  const all = await allProducts();
  const count = (f: ProductFilter) => all.filter((p) => p.filter === f).length;
  return { avanzan: count("avanzan"), detenidos: count("detenidos"), publicados: count("publicados"), total: all.length };
}

export const getProduct = cache(async (id: string): Promise<Product | null> => {
  return (await allProducts()).find((p) => p.id === id) ?? null;
});

/** La etapa Información base: texto, imágenes de referencia, la optimización y el cliente ideal. */
export const getProductBase = cache(async (id: string): Promise<ProductBase | null> => {
  const uid = await userId();
  const [product, row] = await Promise.all([getProduct(id), getProductRow(uid, id)]);
  if (!product || !row) return null;
  const [images, runs, avatars, brief] = await Promise.all([
    listImageRows(uid, [id]),
    latestRuns(uid, [id]),
    latestAvatars(uid, [id]),
    latestBrief(uid, id),
  ]);
  const urls = await withDisplayUrls(images);
  const run = runs.get(id);
  const avatar = avatars.get(id);
  return {
    product,
    baseInfo: row.base_info,
    baseInfoUpdatedAt: row.base_info_updated_at ?? undefined,
    fromShopify: Boolean(row.description?.trim()) && row.base_info.includes(row.description!.trim().slice(0, 40)),
    images: images.filter((i) => urls.has(i.id)).map((i) => toReferenceImage(i, urls.get(i.id)!)),
    run: run ? toRun(run) : undefined,
    avatar: avatar ? toProposal(avatar) : undefined,
    missingInputs: brief?.missing_inputs ?? [],
  };
});

/** Propuestas de texto de un producto, en orden de revisión. Aún no se generan. */
export async function getProductContent(productId: string): Promise<ContentItem[]> {
  void productId;
  return [];
}

/** Opciones de imagen generadas. Aún no se generan. */
export async function getProductImages(productId: string): Promise<ImageOption[]> {
  void productId;
  return [];
}

export async function getPricing(productId: string): Promise<Pricing | null> {
  const product = await getProduct(productId);
  if (!product) return null;
  const cost = product.supplierCost;
  // Con precio en la tienda se parte de él; sin precio, la IA propone uno a partir del costo (entra como `generado`).
  const price = product.price && product.price > 0 ? product.price : Math.round((cost * 3.2) / 1000) * 1000 - 10;
  return {
    productId,
    price,
    costs: [
      { label: "Costo del producto", value: cost },
      { label: "Envío", value: 3500 },
      { label: "Publicidad por venta", value: 6000 },
    ],
    note: NOTE,
    status: "generado",
  };
}
