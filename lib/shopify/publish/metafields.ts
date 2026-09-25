// Escribir y borrar metafields dropflex.* de un recurso (producto o tienda). Lo usan Publicar
// (lib/pipeline/publish.ts) y Eventos (lib/events/store.ts). Lotes de 25, el máximo de metafieldsSet.
import "server-only";
import { shopifyMutation } from "@/lib/integrations/shopify/client";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { assertNoUserErrors } from "./files";

const METAFIELDS_SET = /* GraphQL */ `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_DELETE = /* GraphQL */ `
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key }
      userErrors { field message }
    }
  }
`;

export async function setMetafields(conn: ShopifyConnection, ownerId: string, list: { namespace: string; key: string; type: string; value: string }[]) {
  for (let i = 0; i < list.length; i += 25) {
    const res = await shopifyMutation<{ metafieldsSet: { userErrors: { message: string }[] } }>(conn, METAFIELDS_SET, {
      metafields: list.slice(i, i + 25).map((m) => ({ ...m, ownerId })),
    });
    assertNoUserErrors("Guardar el contenido de la página", res.metafieldsSet.userErrors);
  }
}

export async function deleteMetafields(conn: ShopifyConnection, ownerId: string, keys: string[]) {
  if (!keys.length) return;
  const res = await shopifyMutation<{ metafieldsDelete: { userErrors: { message: string }[] } }>(conn, METAFIELDS_DELETE, {
    metafields: keys.map((key) => ({ ownerId, namespace: "dropflex", key })),
  });
  assertNoUserErrors("Quitar lo que ya no va en la página", res.metafieldsDelete.userErrors);
}
