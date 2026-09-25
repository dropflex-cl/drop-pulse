// Eventos › «Publicar en la tienda» (docs/spec-eventos.md › Arquitectura): lleva el metafield
// dropflex.event a cada producto ya publicado, sin tocar ficha, precios ni imágenes, y dice qué
// productos tienen cambios de eventos sin publicar.
import "server-only";
import { approvedCopies, eventFingerprint, listActivations, listEventCopies, listEvents, publishProductEvent } from "@/lib/events/store";
import { eventMetafield, resolveProductEvents } from "@/lib/events/resolve";
import { shopifyQuery } from "@/lib/integrations/shopify/client";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { ProductApiError } from "@/lib/products/http";
import { listProductRows } from "@/lib/products/store";
import { connectionProblem, getPublications } from "./publish";

const PRODUCT_ID = /* GraphQL */ `
  query ProductId($id: ID!) { product(id: $id) { id } }
`;

const gidOf = (shopifyId: string) => (shopifyId.startsWith("gid://") ? shopifyId : `gid://shopify/Product/${shopifyId}`);

export interface EventsPublishResult {
  products: number;
  withEvent: number;
  failed: string[];
}

/**
 * «Publicar en la tienda» desde Eventos: solo el metafield del evento en cada producto ya publicado
 * (sin tocar ficha, precios ni imágenes). Lo que no está publicado recibe el evento al publicarlo.
 */
export async function publishEvents(userId: string): Promise<EventsPublishResult> {
  const conn = await getShopifyConnection(userId);
  const problem = connectionProblem(conn);
  if (problem || !conn) throw new ProductApiError(problem ?? "Conecta tu tienda Shopify.", 409);
  const rows = await listProductRows(userId);
  const pubs = await getPublications(userId, rows.map((r) => r.id));
  const published = rows.filter((r) => pubs.get(r.id)?.status === "published");
  const result: EventsPublishResult = { products: published.length, withEvent: 0, failed: [] };
  for (const p of published) {
    try {
      const found = await shopifyQuery<{ product: { id: string } | null }>(conn, PRODUCT_ID, { id: gidOf(p.shopify_product_id) });
      if (!found.product) throw new Error("no existe en Shopify");
      if (await publishProductEvent(conn, userId, p.id, found.product.id)) result.withEvent++;
    } catch (e) {
      console.error("[events] publicar", p.id, e);
      result.failed.push(p.title);
    }
  }
  return result;
}

/** Productos publicados cuyo evento cambió desde la última publicación (para «Publicar en la tienda»). */
export async function staleEventProducts(userId: string, market: string, now = Date.now()): Promise<{ id: string; title: string }[]> {
  const rows = await listProductRows(userId);
  const pubs = await getPublications(userId, rows.map((r) => r.id));
  const published = rows.filter((r) => pubs.get(r.id)?.status === "published");
  if (!published.length) return [];
  const [events, activations, copies] = await Promise.all([listEvents(market, now), listActivations(userId), listEventCopies(userId, {})]);
  return published
    .filter((p) => {
      const value = eventMetafield(resolveProductEvents(events, activations, p.id, now), approvedCopies(copies.filter((c) => c.product_id === p.id)), now);
      const pub = pubs.get(p.id) as { event_fingerprint?: string | null } | undefined;
      // Nunca publicado con eventos y sin eventos que mostrar: nada que hacer.
      if (!pub?.event_fingerprint && !value) return false;
      return pub?.event_fingerprint !== eventFingerprint(value);
    })
    .map((p) => ({ id: p.id, title: p.title }));
}
