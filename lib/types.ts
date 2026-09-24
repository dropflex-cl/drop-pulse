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
export type StageKey = "importado" | "resenas" | "angulos" | "textos" | "imagenes" | "publicar" | "creativos" | "anuncios";

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
  /** Fase de la etapa Textos, la página del producto (lib/products/stages.ts › copyPhase). */
  copyPhase?: "locked" | "new" | "writing" | "failed" | "review" | "done";
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

/** Un bloque de la página del producto (ReviewCard en la etapa Textos). */
export interface CopyItem {
  id: string;
  /** lib/copy/blocks.ts › PAGE_BLOCKS o "faq". */
  key: string;
  /** «Beneficio 2», «Pregunta frecuente 1». */
  label: string;
  section: string;
  /** Lo que hay hoy en Shopify (título; en «Cómo funciona», la descripción como referencia). */
  original?: string;
  /** El texto vigente: tu versión si la editaste, si no la propuesta. Preguntas: «pregunta\nrespuesta». */
  text: string;
  edited: boolean;
  angle?: AngleRole;
  note?: string;
  /** Dato que la IA no tiene («el plazo de entrega y tu WhatsApp»). */
  missing?: string;
  status: ContentStatus;
  required: boolean;
  limit: number;
  unit: "caracteres" | "palabras";
}

/** El estado de la etapa Textos (lo que devuelve el sondeo). */
export interface CopyState {
  /** Se habilita con los 2 desarrollos de Ángulos aprobados. */
  locked: boolean;
  run?: { id: string; status: RunStatus; error?: string; createdAt: string };
  items: CopyItem[];
  /** Los ángulos cambiaron después de escribir la página. */
  stale: boolean;
  /** La ficha no trae días de garantía: el bloque no se incluye a propósito. */
  noGuarantee: boolean;
}

export interface ProductCopy extends CopyState {
  product: Product;
  /** Color de acento de la página (#rrggbb, lib/copy/accent.ts); null si todavía no se eligió. */
  accent: string | null;
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

// ---------------------------------------------------------------- Anuncios (docs/spec-anuncios.md)

/** Un creativo subido por el comerciante (bucket ad-media). */
export interface AdMedia {
  id: string;
  kind: "image" | "video";
  name: string;
  /** URL firmada para mostrarlo. */
  url: string;
  ratio: "1:1" | "4:5" | "9:16" | null;
  durationS: number | null;
  status: "uploading" | "processing" | "ready" | "error";
  error: string | null;
}

/** Una plantilla propia (Ajustes › Plantillas de campaña). */
export interface AdTemplate {
  id: string;
  name: string;
  structure: import("./ads/schemas").Structure;
  launch: import("./ads/schemas").LaunchConfig;
  engine: import("./ads/schemas").EngineConfig;
  basedOn: string | null;
  updatedAt: string;
}

/** El borrador del configurador: la configuración que es SUYA. */
export interface AdDraft {
  id: string | null;
  name: string;
  structure: import("./ads/schemas").Structure;
  templateKey: string | null;
  templateId: string | null;
  launch: import("./ads/schemas").LaunchConfig;
  engine: import("./ads/schemas").EngineConfig;
  status: "draft" | "launching" | "failed";
  progress: { step: string; done: number; total: number } | null;
  error: string | null;
}

/** Una campaña ya creada en Meta, para la lista de la etapa. */
export interface AdCampaignSummary {
  id: string;
  name: string;
  structure: import("./ads/schemas").Structure;
  status: "paused" | "active" | "failed" | "archived" | "launching" | "draft";
  launchedAt: string | null;
  publishedAt: string | null;
}

/** La etapa Anuncios del producto (/products/[id]/ads). */
export interface ProductAds {
  product: Product;
  /** Por qué no se puede lanzar todavía (página sin terminar, Meta sin conectar). */
  locked: string | null;
  meta: { ready: boolean; account: string | null; page: string | null; pixel: string | null };
  currency: string;
  timezone: string;
  country: string;
  cpaLimit: number | null;
  spendCap: number | null;
  productUrl: string | null;
  draft: AdDraft;
  media: AdMedia[];
  templates: AdTemplate[];
  campaigns: AdCampaignSummary[];
  /** Los textos por defecto (de lo aprobado), para «Restablecer». */
  defaultTexts: { primary_texts: string[]; headlines: string[]; description: string };
  /** CBO de ganadores: el nombre y el id de la campaña ABO de la que sale. */
  source: string | null;
  sourceId: string | null;
}

/** Lo que el motor decidió para una unidad, listo para DecisionRow. */
export interface AdDecisionView {
  id: string;
  unitId: string;
  level: "campaign" | "adset" | "ad";
  /** wait · keep · pause · scale · winners, y si ya se aplicó. */
  verdict: "wait" | "keep" | "pause" | "scale" | "winners";
  disposition: "pending" | "applied" | "auto_applied" | "ignored" | "expired" | "undone" | "info";
  reason: string;
  rule: string | null;
  progress: number | null;
  suggestedBudget: number | null;
  winners?: string[];
  decidedAt: string | null;
  lastSeenAt: string;
}

/** Un conjunto (ABO) o anuncio (CBO) de la campaña, con su decisión vigente. */
export interface AdUnitView {
  id: string;
  level: "adset" | "ad";
  name: string;
  active: boolean;
  budget: number | null;
  image: string | null;
  video: boolean;
  spend: number;
  purchases: number;
  cpa: number | null;
  decision: AdDecisionView | null;
}

export interface AdChangeView {
  id: string;
  unitName: string;
  text: string;
  actor: "merchant" | "engine" | "meta";
  rule: string | null;
  at: string;
  undoable: boolean;
  undone: boolean;
}

export interface AdSeriesPoint {
  date: string;
  spend: number;
  purchases: number;
  cpa: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
}

export interface AdHourPoint {
  hour: number;
  spend: number;
  purchases: number;
}

/** El detalle de una campaña real (/campaigns/[id]). */
export interface CampaignDetail {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  name: string;
  structure: import("./ads/schemas").Structure;
  status: "paused" | "active" | "archived";
  currency: string;
  timezone: string;
  engine: import("./ads/schemas").EngineConfig;
  dailyBudget: number | null;
  dailyTotal: number;
  launchedAt: string | null;
  publishedAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  totals: { spend: number; purchases: number; cpa: number | null; roas: number | null; ctr: number | null };
  units: AdUnitView[];
  /** CBO: la decisión de escalar la campaña. ABO: la sugerencia de ganadores. */
  campaignDecision: AdDecisionView | null;
  changes: AdChangeView[];
  /** Series diarias: la campaña (`campaign`) y cada unidad por su id. */
  daily: Record<string, AdSeriesPoint[]>;
  /** Acumulado de hoy y de ayer, hora a hora (campaña). */
  hourly: { today: AdHourPoint[]; yesterday: AdHourPoint[] };
}

// ---------------------------------------------------------------- Creativos (docs/spec-creativos.md)

/** Una pieza generada con Higgsfield: su generación, el QA y la decisión del comerciante. */
export interface CreativeAssetView {
  id: string;
  ratio: "1:1" | "9:16";
  /** 1: con el preset; 2: edición directa, después de que el QA rechazó el primero. */
  attempt: number;
  render: "queued" | "running" | "succeeded" | "failed";
  /** Por qué falló, o por qué sigue en cola. */
  error?: string;
  /** URL firmada de la imagen (1 h). */
  src?: string;
  width?: number;
  height?: number;
  qa?: { pass: boolean; issues: string[] };
  status: ContentStatus;
  /** Ya está en Anuncios (se copió a los creativos del producto). */
  inAds: boolean;
  /** Falló después de llegar a Higgsfield por un corte nuestro: se puede recuperar sin volver a cobrar. */
  recoverable?: boolean;
  createdAt: string;
}

export interface CreativeConceptView {
  id: string;
  angle: AngleRole;
  angleName: string;
  family: import("./creatives/catalog").Family;
  familyName: string;
  name: string;
  why: string;
  /** Cómo se va a ver la pieza, para decidir antes de pagarla (conceptos con dirección de arte). */
  look?: string;
  preset?: { id: string; name: string; group: string; cover?: string };
  texts: { role: import("./creatives/catalog").TextRole; text: string }[];
  edited: boolean;
  assets: CreativeAssetView[];
}

export interface CreativesState {
  /** Por qué no se puede usar todavía (ángulos sin aprobar, Higgsfield sin conectar). */
  locked: string | null;
  connected: boolean;
  run?: { id: string; status: RunStatus; error?: string; createdAt: string };
  concepts: CreativeConceptView[];
  /** Cota de USD por imagen para mostrar antes de generar. */
  imageCostUsd: number;
}

export interface ProductCreatives extends CreativesState {
  product: Product;
}

// ---------------------------------------------------------------- Costo de IA (arquitectura.md › 11)

/** Una etapa en el desglose de AiCostCard. */
export interface AiStageCost {
  label: string;
  /** En la moneda de la tienda. */
  cost: number;
  runs?: number;
  retries?: number;
  /** Por qué no tiene costo (“Sin uso aún” por defecto). */
  note?: string;
  /** Solo administrador: “18,2k tok”. */
  tokens?: string;
}

/** Una llamada a la IA en AiRunList. */
export interface AiRun {
  kind: "gen" | "regen" | "retry" | "fail";
  what: string;
  stage: string;
  /** “hoy 10:42”, “ayer 18:02”, “12 sep 18:02”. */
  when: string;
  cost?: number;
  /** Solo administrador. */
  model?: string;
  tokens?: string;
}

/** Cuánto costó en IA llevar un producto hasta donde está. */
export interface ProductAiCost {
  currency: string;
  total: number;
  totalUsd: number;
  generations: number;
  /** Tope por producto en la moneda de la tienda (Ajustes). */
  cap?: number;
  stages: AiStageCost[];
  /** Más reciente primero. */
  runs: AiRun[];
  /** “Equivale al 4,5% de lo que ganas en una venta ($8.590).” Solo con precio definido. */
  context: string | null;
  /** Hay una generación en curso. */
  running: boolean;
  audience: "merchant" | "admin";
  /** Costo estimado de una llamada por paso (AI_STEPS), en la moneda de la tienda: para avisar antes de gastar. */
  estimates: Record<string, number>;
}
