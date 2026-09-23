// Documentos GraphQL del Admin API de Shopify. Solo lectura: el onboarding no escribe en la tienda.
// Pedidos sin ningún campo de cliente (PERMS_SHOPIFY: “Nunca: datos de pago ni clientes fuera de tus pedidos”).

export const SHOP_QUERY = /* GraphQL */ `
  query DropFlexShop {
    shop { id name currencyCode myshopifyDomain }
    productsCount(query: "status:active") { count }
  }
`;

export interface ShopQuery {
  shop: { id: string; name: string; currencyCode: string; myshopifyDomain: string };
  productsCount: { count: number } | null;
}

export const PRODUCTS_QUERY = (withCost: boolean) => /* GraphQL */ `
  query DropFlexProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active", sortKey: ID) {
      nodes {
        id
        title
        handle
        status
        description(truncateAt: 20)
        mediaCount { count }
        featuredMedia { preview { image { url(transform: { maxWidth: 160, maxHeight: 160 }) } } }
        variants(first: 1) {
          nodes {
            price
            compareAtPrice
            ${withCost ? "inventoryItem { unitCost { amount } }" : ""}
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export interface ProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  description: string;
  mediaCount: { count: number } | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: {
    nodes: { price: string; compareAtPrice: string | null; inventoryItem?: { unitCost: { amount: string } | null } | null }[];
  };
}

export interface ProductsQuery {
  products: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

export const ORDERS_QUERY = /* GraphQL */ `
  query DropFlexOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      nodes { lineItems(first: 50) { nodes { quantity product { id } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export interface OrdersQuery {
  orders: {
    nodes: { lineItems: { nodes: { quantity: number; product: { id: string } | null }[] } }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

// País y zona horaria de la tienda, para sugerir el mercado (lib/market.ts). Va aparte de SHOP_QUERY
// para que, si Shopify negara algún campo, la conexión no falle: el mercado cae al valor por defecto.
export const SHOP_MARKET_QUERY = /* GraphQL */ `
  query DropFlexShopMarket {
    shop { currencyCode ianaTimezone billingAddress { countryCodeV2 } }
  }
`;

export interface ShopMarketQuery {
  shop: { currencyCode: string; ianaTimezone: string | null; billingAddress: { countryCodeV2: string | null } | null };
}

// Detalle de un producto para su información base: descripción completa, opciones y todas sus
// imágenes (hasta 20), acotadas a 1600 px para que la IA las lea sin pedir el original.
const PRODUCT_DETAIL_FIELDS = (withCost: boolean) => /* GraphQL */ `
  id
  title
  handle
  status
  vendor
  productType
  tags
  description
  category { fullName }
  options { name values }
  featuredMedia { id }
  media(first: 20) {
    nodes {
      id
      alt
      mediaContentType
      ... on MediaImage { image { url(transform: { maxWidth: 1600, maxHeight: 1600 }) width height } }
    }
  }
  variants(first: 1) {
    nodes {
      price
      compareAtPrice
      ${withCost ? "inventoryItem { unitCost { amount } }" : ""}
    }
  }
`;

export const PRODUCT_DETAIL_QUERY = (withCost: boolean) => /* GraphQL */ `
  query DropFlexProduct($id: ID!) {
    product(id: $id) { ${PRODUCT_DETAIL_FIELDS(withCost)} }
  }
`;

// Varios productos en una sola ida (sincronizar). Un id que ya no existe vuelve como null.
export const PRODUCTS_DETAIL_QUERY = (withCost: boolean) => /* GraphQL */ `
  query DropFlexProductsDetail($ids: [ID!]!) {
    nodes(ids: $ids) { ... on Product { ${PRODUCT_DETAIL_FIELDS(withCost)} } }
  }
`;

// Todos los ids de la tienda, en cualquier estado (activo, borrador, archivado): lo que no aparece
// aquí es lo que se eliminó en Shopify. Liviano a propósito: 250 por página.
export const PRODUCT_IDS_QUERY = /* GraphQL */ `
  query DropFlexProductIds($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: ID) {
      nodes { id status }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export interface ProductIdsQuery {
  products: { nodes: { id: string; status: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

export interface ProductDetailNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  description: string;
  category: { fullName: string } | null;
  options: { name: string; values: string[] }[];
  featuredMedia: { id: string } | null;
  media: {
    nodes: { id: string; alt: string | null; mediaContentType: string; image?: { url: string; width: number | null; height: number | null } | null }[];
  };
  variants: ProductNode["variants"];
}

export interface ProductDetailQuery {
  product: ProductDetailNode | null;
}

export interface ProductsDetailQuery {
  nodes: (ProductDetailNode | Record<string, never> | null)[];
}
