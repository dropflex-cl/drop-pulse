// La etapa Publicar para la pantalla y su sondeo: conexión y permisos, el tema, lo que falta y lo que
// se va a publicar. No toca Shopify salvo para corregir el estado del tema (themeView).
import "server-only";
import { getPreparedProduct } from "./product-content";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { missingPublishScopes } from "@/lib/integrations/shopify/oauth";
import { connectionProblem, getPublications } from "@/lib/pipeline/publish";
import { themeView } from "@/lib/pipeline/theme";
import { previewFacts } from "@/lib/products/preview-facts";
import { componentName } from "@/lib/copy/page-ui";
import { effectivePage } from "@/lib/products/effective-page";
import { fingerprint } from "@/lib/shopify/publish/mapping";
import { money } from "@/lib/format";
import type { PublishState } from "@/lib/types";

export async function publishState(userId: string, productId: string): Promise<PublishState> {
  const [conn, prepared, publications, theme] = await Promise.all([
    getShopifyConnection(userId),
    getPreparedProduct(userId, productId),
    getPublications(userId, [productId]),
    themeView(userId),
  ]);
  const pub = publications.get(productId);
  const { input, missing } = prepared;
  const currency = prepared.currency;
  const facts = previewFacts(input, {}, currency), p = facts.policies, days = facts.logistics;
  const policies = [
    "Pago al recibir",
    p.free_shipping ? (p.threshold ? `Envío gratis desde ${money(p.threshold, currency)}` : "Envío gratis") : null,
    days ? `Entrega en ${days.min} a ${days.max} días` : null,
    p.return_days ? `Cambios por ${p.return_days} días` : null,
    p.warranty_months ? `Garantía de ${p.warranty_months} ${p.warranty_months === 1 ? "mes" : "meses"}` : null,
    p.whatsapp ? "Atención por WhatsApp" : null,
  ].filter((x): x is string => Boolean(x));
  return {
    shop: conn?.shop_domain ?? null,
    connection: connectionProblem(conn),
    needsPermissions: Boolean(conn && conn.status === "connected" && missingPublishScopes(conn.scopes).length),
    theme,
    missing,
    plan: {
      title: effectivePage(input).listing.title,
      components: effectivePage(input).components.map((c) => componentName(c.id)),
      images: input.gallery.length,
      packs: input.packs.length > 1 ? input.packs.map((x) => ({ units: x.units, price: x.price, label: x.label })) : [],
      reviews: input.reviews.length,
      accent: input.accent,
      policies,
    },
    currency,
    publication: pub
      ? {
          status: pub.status,
          error: pub.error_message ?? undefined,
          publishedAt: pub.published_at ?? undefined,
          productUrl: pub.product_url ?? undefined,
          stale: pub.fingerprint !== fingerprint(input),
        }
      : null,
  };
}
