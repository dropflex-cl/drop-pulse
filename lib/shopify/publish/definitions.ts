// Definiciones de los metafields dropflex.* (spec del tema §5.1): con acceso PUBLIC_READ, porque sin
// él la tienda no los ve y la sección queda vacía sin error. Se crean una vez; las que ya existen
// (TAKEN) se dejan como están.
import "server-only";
import { shopifyMutation, shopifyQuery } from "@/lib/integrations/shopify/client";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { SHARED_METAFIELDS } from "@/lib/shopify/components/define";
import { PublishError } from "./files";
import { SLOT_METAFIELD } from "./mapping";

export interface Definition {
  ownerType: "PRODUCT" | "SHOP";
  key: string;
  type: string;
  name: string;
}

/** Todas las que usa el tema, con su tipo (puro). */
export function definitions(): Definition[] {
  const out = new Map<string, Definition>();
  const add = (d: Definition) => out.set(`${d.ownerType}.${d.key}`, d);
  for (const c of CATALOG) {
    const name = c.name;
    if (c.metafield) add({ ownerType: "PRODUCT", key: c.metafield.key, type: "json", name });
    for (const m of c.media) add({ ownerType: "PRODUCT", key: m.key, type: m.type, name: `${name} (archivos)` });
  }
  for (const [id, slots] of Object.entries(SLOT_METAFIELD)) {
    for (const s of Object.values(slots)) add({ ownerType: "PRODUCT", key: s.key, type: s.type, name: `DropFlex · ${id} (fotos)` });
  }
  for (const m of Object.values(SHARED_METAFIELDS)) add({ ownerType: m.owner === "shop" ? "SHOP" : "PRODUCT", key: m.key, type: m.type, name: `DropFlex · ${m.key}` });
  return [...out.values()];
}

const EXISTING = /* GraphQL */ `
  query Defs($owner: MetafieldOwnerType!) {
    metafieldDefinitions(first: 250, ownerType: $owner, namespace: "dropflex") { nodes { key } }
  }
`;

const CREATE = /* GraphQL */ `
  mutation Def($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { code message }
    }
  }
`;

export async function ensureDefinitions(conn: ShopifyConnection): Promise<number> {
  const all = definitions();
  let created = 0;
  for (const owner of ["PRODUCT", "SHOP"] as const) {
    const res = await shopifyQuery<{ metafieldDefinitions: { nodes: { key: string }[] } }>(conn, EXISTING, { owner });
    const have = new Set(res.metafieldDefinitions.nodes.map((n) => n.key));
    for (const d of all.filter((x) => x.ownerType === owner && !have.has(x.key))) {
      const r = await shopifyMutation<{ metafieldDefinitionCreate: { userErrors: { code: string; message: string }[] } }>(conn, CREATE, {
        definition: { name: d.name, namespace: "dropflex", key: d.key, type: d.type, ownerType: owner, access: { storefront: "PUBLIC_READ" } },
      });
      const errors = r.metafieldDefinitionCreate.userErrors.filter((e) => e.code !== "TAKEN");
      if (errors.length) throw new PublishError(`Definir el metafield ${d.key}: ${errors.map((e) => e.message).join("; ")}`);
      created++;
    }
  }
  return created;
}
