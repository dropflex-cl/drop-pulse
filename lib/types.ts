// Tipos de dominio de DropFlex. Hoy los llenan los mocks de lib/mock/; mañana, Supabase
// (ver docs/esquema-supabase.md). La UI solo los recibe a través de lib/data/*.

import type { ContentStatus } from "@/components/df/status-badge";
import type { MeterStage } from "@/components/df/stage-meter";
import type { StageState } from "@/components/df/stage-list";
import type { Verdict } from "@/components/df/campaign-card";
import type { MetricProps } from "@/components/df/metric";
import type { AttentionKind } from "@/components/df/attention-item";
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import type { PricingForm, PricingPlan } from "@/lib/pricing/plan";

export type { ContentStatus, Verdict };

/** Etapas de la ruta de un producto, en orden. */
export type StageKey = "importado" | "textos" | "imagenes" | "publicar" | "anuncios";

export interface Stage {
  key: StageKey;
  title: string;
  state: StageState;
  desc?: string;
  optional?: boolean;
}

/** Filtro de la lista de productos: Avanzan · Detenidos · Publicados. */
export type ProductFilter = "avanzan" | "detenidos" | "publicados";

export interface Product {
  id: string;
  name: string;
  image: string;
  sku: string;
  filter: ProductFilter;
  /** Una rayita por etapa (StageMeter). */
  meter: MeterStage[];
  /** Por qué está donde está: “Detenido: falta el precio · 3 días”. */
  reason: string;
  tone: "warning" | "danger" | "success" | "primary" | "muted";
  /** Etapa a la que lleva la fila y “Continuar”. */
  nextStage: StageKey;
  stages: Stage[];
  /** “2 de 5 etapas · editado hace 2 h”. */
  summary: string;
  /** Estado del contenido en el encabezado; un producto sin optimizar no tiene. */
  status?: ContentStatus;
  supplierCost: number;
  /** Precio actual en la tienda y su moneda (ISO 4217). */
  price?: number;
  currency?: string;
}

/** Estado de una corrida del pipeline de IA (pipeline_runs.status). */
export type RunStatus = "queued" | "running" | "succeeded" | "failed";

/** Una imagen de origen que la IA usa como referencia (ReferenceImage). */
export interface ReferenceImage {
  id: string;
  src: string;
  alt: string;
  source: "shopify" | "upload" | "url";
  excluded: boolean;
  /** Portada actual en la tienda. */
  cover: boolean;
  /** Elegida como imagen base. Sin elección, la base se resuelve con pickBase (lib/products/base.ts). */
  base: boolean;
}

/** Plan de precios guardado (lib/pricing/store.ts), tal como lo recibe la pantalla. */
export type SavedPricingDto = PricingPlan & { updatedAt: string };

export interface OptimizationRun {
  id: string;
  status: RunStatus;
  step: "product_brief" | "customer_avatar" | null;
  /** Qué pasó y qué hacer, en español. */
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

/** Propuesta de cliente ideal: la IA propone, el comerciante acepta, edita o regenera. */
export interface AvatarProposal {
  id: string;
  status: ContentStatus;
  avatar: CustomerAvatar;
  createdAt: string;
  editedAt?: string;
}

/** Etiquetas de los packs propuestas por la IA; se aprueban aparte del cliente ideal. */
export interface PackLabelsProposal {
  id: string;
  status: ContentStatus;
  labels: PackLabel[];
  /** Los precios de los packs cambiaron desde que se generaron: hay que revisarlas. */
  stale: boolean;
  /** Precios de los packs con que se generaron o aprobaron (para recalcular `stale` en vivo). */
  prices: { units: number; price: number }[];
  createdAt: string;
  editedAt?: string;
}

/** Todo lo que necesita la etapa Información base. */
export interface ProductBase {
  product: Product;
  baseInfo: string;
  baseInfoUpdatedAt?: string;
  /** El texto partió de la descripción de Shopify. */
  fromShopify: boolean;
  images: ReferenceImage[];
  run?: OptimizationRun;
  avatar?: AvatarProposal;
  /** Precio y packs guardados; sin ellos no se puede optimizar. */
  pricing?: SavedPricingDto;
  /** Etiquetas de los packs (salen con el cliente ideal). */
  packLabels?: PackLabelsProposal;
  /** Valores para abrir la calculadora la primera vez (costo de Shopify, números del onboarding). */
  pricingDefaults: Partial<PricingForm>;
  /** Lo que la ficha dice que falta, como preguntas para el comerciante. */
  missingInputs: { field: string; question: string }[];
}

/** Una propuesta de la IA para un campo del producto. */
export interface ContentItem {
  id: string;
  productId: string;
  field: string;
  original?: string;
  proposal: string;
  status: ContentStatus;
  /** Por qué la IA lo propone: “Más corto, con el beneficio al frente. 62 caracteres.” */
  note?: string;
}

export type ImageStatus = "idle" | "selected" | "discarded" | "generating" | "error";

export interface ImageOption {
  id: string;
  productId: string;
  src?: string;
  alt: string;
  status: ImageStatus;
  /** Posición en la tienda cuando está elegida (1 = portada). */
  order?: number;
}

export interface Campaign {
  id: string;
  productId: string;
  name: string;
  image: string;
  verdict: Verdict;
  verdictTitle?: string;
  reason: string;
  meta: string;
  paused?: boolean;
  nextBudget?: string;
  /** Métricas por orden de importancia; en móvil se muestran las dos primeras. */
  metrics: MetricProps[];
  budget: number;
  history: { day: string; spend: number; sales: number; cpa: number | null }[];
}

export interface AttentionEntry {
  id: string;
  group: "primero" | "revisar";
  kind: AttentionKind;
  title: string;
  product: string;
  detail?: string;
  actions: { label: string; href: string; variant?: "primary" | "secondary" | "ghost"; iconEnd?: "chevron-right" }[];
}

export interface TodaySummary {
  /** Fecha del resumen (ISO), para el subtítulo de Hoy. */
  date: string;
  pending: number;
  errors: number;
  published: number;
}

export interface Assumptions {
  /** Pedidos entregados de cada 5 (1 de cada 5 sin entregar → 0,8). */
  deliveryRate: number;
  maxCpa: number;
  store: string;
  metaAccount: string;
}
