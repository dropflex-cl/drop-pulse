// La etapa Publicar para la pantalla y su sondeo: conexión y permisos, el tema, lo que falta y lo que
// se va a publicar. No toca Shopify salvo para corregir el estado del tema (themeView).
import "server-only";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { missingPublishScopes } from "@/lib/integrations/shopify/oauth";
import { connectionProblem, getPublications, preparePublish } from "@/lib/pipeline/publish";
import { themeView } from "@/lib/pipeline/theme";
import { deliveryDays } from "@/lib/settings/policies";
import { getStorePolicies } from "@/lib/settings/policies-store";
import { componentName } from "@/lib/copy/page-ui";
import { fingerprint } from "@/lib/shopify/publish/mapping";
import { money } from "@/lib/format";
import type { PublishState } from "@/lib/types";

export async function publishState(userId: string, productId: string): Promise<PublishState> {
  const [conn, prepared, publications, settings] = await Promise.all([
    getShopifyConnection(userId),
    preparePublish(userId, productId),
    getPublications(userId, [productId]),
    getStorePolicies(userId),
  ]);
  const theme = await themeView(userId);
  const pub = publications.get(productId);
  const { input, missing } = prepared;
  const currency = settings?.currency ?? "CLP";
  const p = settings?.policies;
  const days = p ? deliveryDays(p) : null;
  const policies = [
    "Pago al recibir",
    p?.freeShipping ? (p.freeShippingThreshold ? `Envío gratis desde ${money(p.freeShippingThreshold, currency)}` : "Envío gratis") : null,
    days ? `Entrega en ${days.min} a ${days.max} días` : null,
    p?.returnDays ? `Cambios por ${p.returnDays} días` : null,
    p?.warrantyMonths ? `Garantía de ${p.warrantyMonths} ${p.warrantyMonths === 1 ? "mes" : "meses"}` : null,
    p?.whatsapp ? "Atención por WhatsApp" : null,
  ].filter((x): x is string => Boolean(x));
  return {
    shop: conn?.shop_domain ?? null,
    connection: connectionProblem(conn),
    needsPermissions: Boolean(conn && conn.status === "connected" && missingPublishScopes(conn.scopes).length),
    theme,
    missing,
    plan: {
      title: input.listing.title,
      components: input.components.map((c) => componentName(c.id)),
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
          stale: pub.status === "published" && !missing.length && pub.fingerprint !== fingerprint(input),
        }
      : null,
  };
}
