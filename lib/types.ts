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
import type { AngleRole, SalesAngle } from "@/lib/angles/catalog";

export type { ContentStatus, Verdict };

/** Etapas de la ruta de un producto, en orden. */
export type StageKey = "importado" | "resenas" | "angulos" | "textos" | "imagenes" | "publicar" | "anuncios";

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
  /** Fase de la etapa Ángulos (lib/products/stages.ts › anglesPhase). */
  anglesPhase?: "locked" | "new" | "evaluating" | "failed" | "choose" | "developing" | "review" | "done";
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

/** Un ángulo del ranking del orquestador, con su puntaje calculado en código (AngleCard). */
export interface AngleOption {
  angle: SalesAngle;
  name: string;
  rank: number;
  score: number;
  why: string;
  /** La penalización fuerte trae sus puntos; `fix` dice qué dato la resuelve. */
  risks: { text: string; penalty?: number; fix?: "reviews" | "expert" }[];
  breakdown: { label: string; value: number }[];
}

export interface AnglePair {
  primary: SalesAngle;
  secondary: SalesAngle;
}

/** La evaluación del orquestador y la elección del comerciante. */
export interface AngleRankingView {
  id: string;
  status: RunStatus;
  error?: string;
  createdAt: string;
  /** Los 6, de mayor a menor (vacío mientras evalúa o si falló). */
  angles: AngleOption[];
  suggested?: AnglePair;
  /** Lo que confirmó el comerciante. */
  chosen?: AnglePair;
  confirmedAt?: string;
  /** Cómo se combinan los pares con más sentido, según el orquestador. */
  combos: (AnglePair & { text: string })[];
  /** “Para elegir mejor, falta”: nunca bloquea la confirmación. */
  missing: { text: string; fix?: "reviews" | "expert" }[];
  /** El cliente ideal cambió después de evaluar. */
  avatarChanged: boolean;
}

/** Lo que el comerciante revisa y edita de un desarrollo (AngleDevelopment). */
export interface AngleBriefContent {
  coreMessage: string;
  hooks: string[];
  recommendedHook: number;
  aida: { attention: string; interest: string; desire: string; action: string };
  objections: { objection: string; answer: string }[];
  offer: string;
}

export interface AngleBriefView {
  id: string;
  angle: SalesAngle;
  name: string;
  role: AngleRole;
  generation: RunStatus;
  error?: string;
  status: ContentStatus;
  content?: AngleBriefContent;
  createdAt: string;
  editedAt?: string;
}

/** El estado de la etapa Ángulos (lo que devuelve el sondeo). */
export interface AnglesState {
  /** El cliente ideal vigente (IcpSummary). */
  avatar?: { summary: string; tags: string[]; approved: boolean };
  ranking?: AngleRankingView;
  briefs: Partial<Record<AngleRole, AngleBriefView>>;
}

/** Todo lo que necesita la etapa Ángulos. */
export interface ProductAngles extends AnglesState {
  product: Product;
}

/** Ciclo de una reseña importada (ReviewItem): pendiente → aprobada o rechazada → publicada. */
export type CustomerReviewState = "pending" | "approved" | "rejected" | "published";

/** Una reseña importada de AliExpress, lista para curar. */
export interface CustomerReview {
  id: string;
  /** Anonimizado: “M***a”. */
  author: string;
  /** ISO 3166 (CL, MX…). */
  country?: string;
  /** “ago 2026”. */
  date?: string;
  rating: number;
  variant?: string;
  /** Lo que se muestra y se publica: tu versión, la traducción o el original. */
  text: string;
  /** El texto tal como lo escribió el cliente (se ve al editar o con “ver original”). */
  original?: string;
  translated: boolean;
  edited: boolean;
  photos: string[];
  flags: string[];
  state: CustomerReviewState;
}

/** Una importación de reseñas en curso o terminada (ReviewImporter). */
export interface ReviewImport {
  id: string;
  status: RunStatus;
  step?: "reading" | "photos";
  read: number;
  total?: number;
  imported: number;
  skipped: number;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

/** La etapa Reseñas: las reseñas, el listado de origen y la última importación. */
export interface ProductReviews {
  product: Product;
  reviews: CustomerReview[];
  source?: { url: string; avgRating?: number; totalReviews?: number };
  lastImport?: ReviewImport;
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
