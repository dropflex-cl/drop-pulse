// Contratos del backend de onboarding (design-system/onboarding.md, docs/onboarding-backend.md).
// El estado se arma desde Supabase (tablas onboarding, shopify_connections, catalog_items y
// meta_connections); las conexiones reales viven en lib/integrations/.

export type StepKey = "shopify" | "productos" | "numeros" | "meta" | "meta-cuentas" | "listo";

/** Estado del comerciante, ya resuelto desde la base. Lo consumen las funciones puras de service.ts. */
export interface OnboardingState {
  version: 1;
  userId: string;
  account?: { email: string };
  shop?: ImportStatus;
  /** Ids de catalog_items elegidos, en orden. */
  selected: string[];
  numbers?: Numbers & { suggested: boolean };
  /** La generación con IA sigue simulada (fuera del alcance de la migración de conexiones). */
  generation?: { startedAt: number; items: { id: string; name: string; image: string }[] };
  meta?: {
    status: "authorizing" | "action" | "connected" | "later" | "error";
    error?: string;
    account?: string;
    page?: string;
    pixel?: string;
  };
  finishedAt?: number;
  checklistHidden: boolean;
}

export interface Numbers {
  /** De cada 10 pedidos, cuántos se entregan. */
  deliveredOf10: number;
  /** Envío por pedido, en la moneda de la tienda. */
  shipping: number;
  /** Máximo por venta en anuncios (CPA límite), en la moneda de la tienda. */
  maxCpa: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  cost: number;
  /** Ventas en los últimos 30 días. */
  sales30: number;
  issues: string[];
  score: "Alta" | "Media" | "Baja";
}

export interface ImportStatus {
  status: "connecting" | "importing" | "connected" | "error";
  domain?: string;
  imported: number;
  total: number;
  /** ISO 4217 de la tienda (vacío hasta conectar). Si el comerciante confirmó el mercado, la suya. */
  currency: string;
  error?: string;
  /** Mercado sugerido desde Shopify o ya confirmado (lib/market.ts). Solo con la tienda conectada. */
  market?: MarketStatus;
}

export interface MarketStatus {
  countryCode: string;
  currency: string;
  language: string;
  confirmed: boolean;
}

export interface GenerationRow {
  id: string;
  name: string;
  image: string;
  status: "generado" | "publicando" | "cola" | "error";
  detail: string;
}

export interface GenerationStatus {
  items: GenerationRow[];
  done: number;
  /** “unos 3 min”; vacío cuando terminó. */
  eta?: string;
  firstReady?: { id: string; name: string };
}

/** Lo que devuelve GET /api/onboarding/state: el estado con lo derivado ya calculado. */
export interface OnboardingSnapshot {
  step: StepKey;
  account?: OnboardingState["account"];
  shop?: ImportStatus;
  selected: string[];
  numbers?: OnboardingState["numbers"];
  generation?: GenerationStatus;
  meta?: OnboardingState["meta"];
  finished: boolean;
  checklistHidden: boolean;
  planLimit: number;
}

export interface MetaOption {
  value: string;
  title: string;
  meta?: string;
  tone?: "warning" | "danger";
  disabled?: boolean;
  tag?: string;
  id?: string;
  details?: string[];
}

export interface MetaAssets {
  adAccounts: MetaOption[];
  pages: MetaOption[];
  /** Píxeles de la cuenta sugerida (compatibilidad). */
  pixels: MetaOption[];
  /** Los píxeles dependen de la cuenta publicitaria elegida. */
  pixelsByAccount: Record<string, MetaOption[]>;
  suggested: { account: string; page: string; pixel: string };
}

export class OnboardingError extends Error {
  constructor(
    message: string,
    public status = 400,
    public field?: string,
  ) {
    super(message);
  }
}
