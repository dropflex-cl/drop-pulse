// Tipos de dominio de DropFlex. Hoy los llenan los mocks de lib/mock/; mañana, Supabase
// (ver docs/esquema-supabase.md). La UI solo los recibe a través de lib/data/*.

import type { ContentStatus } from "@/components/df/status-badge";
import type { MeterStage } from "@/components/df/stage-meter";
import type { StageState } from "@/components/df/stage-list";
import type { Verdict } from "@/components/df/campaign-card";
import type { MetricProps } from "@/components/df/metric";
import type { AttentionKind } from "@/components/df/attention-item";
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import type { ImageProvider, ImageProviderChoice } from "@/lib/image-provider";
import type { PricingForm, PricingPlan } from "@/lib/pricing/plan";
import type { StoreFacts } from "@/lib/store-preview/facts";
import type { AngleSlot, SalesAngle } from "@/lib/angles/catalog";

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

/** Producto de upsell del checkout (/products/upsell): no se optimiza, así que no tiene ruta. */
export interface UpsellProduct {
  id: string;
  name: string;
  image: string;
}

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
  /** Hay ficha (el diferenciador y la competencia se muestran desde ahí). */
  hasBrief: boolean;
  /** El diferenciador confirmado o propuesto. */
  differentiator: DifferentiatorView;
  /** Tiendas de la competencia pegadas por el comerciante. */
  competitors: CompetitorView[];
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

/** Un ángulo candidato del orquestador para testear, con su puntaje calculado en código. */
export interface AngleCandidateView {
  /** Posición en la lista del orquestador (lo que se guarda como sugerido). */
  index: number;
  title: string;
  painOrDesire: string;
  segment: string;
  promise: string;
  /** La forma recomendada (una de las 6). */
  frame: SalesAngle;
  frameName: string;
  triggerMoment: string;
  competition: string;
  /** Tiendas de la competencia que ya lo usan (0 sin datos). */
  competitorsUsing: number;
  score: number;
  frameScore: number;
  /** Lo que sumó o restó la competencia. */
  competitionDelta: number;
}

/** Un ángulo de testeo elegido (uno por conjunto de anuncios). */
export interface TestAngleView {
  slot: AngleSlot;
  frame: SalesAngle;
  frameName: string;
  /** El título que puso la IA o el comerciante (vacío en los elegidos antes de los ángulos de testeo). */
  title: string;
  /** El título o, si no hay, el nombre de la forma. */
  name: string;
  painOrDesire: string;
  segment: string;
  promise: string;
  triggerMoment: string;
  competition: string;
}

/** La evaluación del orquestador y la elección del comerciante. */
export interface AngleRankingView {
  id: string;
  status: RunStatus;
  error?: string;
  createdAt: string;
  /** Las 6 formas, de mayor a menor (vacío mientras evalúa o si falló). */
  angles: AngleOption[];
  /** Los ángulos candidatos para testear (vacío en las evaluaciones de antes). */
  candidates: AngleCandidateView[];
  /** Índices de candidates que sugiere el código (hasta 3). */
  suggested: number[];
  /** Lo que confirmó el comerciante (2 o 3 ángulos). */
  chosen?: TestAngleView[];
  confirmedAt?: string;
  /** Tiendas de la competencia analizadas al evaluar. */
  competitors: number;
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
  /** La forma con que se cuenta. */
  angle: SalesAngle;
  /** El nombre del ángulo (título o, si no hay, la forma). */
  name: string;
  frameName: string;
  slot: AngleSlot;
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
  /** Los desarrollos de los ángulos elegidos, en orden de slot. */
  briefs: AngleBriefView[];
  /** El diferenciador del producto (confirmado o propuesto); sin él no se evalúa. */
  differentiator?: { versus: string; claim: string; confirmed: boolean } | null;
  /** Tiendas de la competencia analizadas (Información base). */
  competitors: number;
}

/** Todo lo que necesita la etapa Ángulos. */
export interface ProductAngles extends AnglesState {
  product: Product;
}

/** Una foto elegida para un espacio de imagen de un componente (ImageSlot en su content.ts). */
export interface ImagePick {
  slot: string;
  source: "reference" | "page_image";
  id: string;
}

/** Una imagen del catálogo del producto, para elegir en los componentes que llevan fotos. */
export interface CatalogImage {
  source: ImagePick["source"];
  id: string;
  src: string;
  /** De dónde viene, en la pantalla. */
  origin: "Información base" | "Generada" | "Subida";
  alt?: string;
}

/** La ficha o un componente de la página (lib/shopify/components/catalog.ts), en la etapa Página del producto. */
export interface PageComponentView {
  id: string;
  /** "listing" (la ficha) o el id del catálogo. */
  component: string;
  /** La versión vigente: la tuya si la editaste, si no la propuesta de la IA. */
  content: unknown;
  edited: boolean;
  /** «Usar en la página». La ficha siempre va. */
  enabled: boolean;
  status: ContentStatus;
  images: ImagePick[];
}

/** El estado de la etapa Página del producto (lo que devuelve el sondeo). */
export interface CopyState {
  /** Qué falta para habilitarla: los 2 desarrollos de Ángulos, o las imágenes (Imágenes va antes). null si está habilitada. */
  locked: "angles" | "images" | null;
  run?: { id: string; status: RunStatus; error?: string; createdAt: string };
  /** La ficha y los componentes escritos, en el orden de la página. */
  components: PageComponentView[];
  /** Las imágenes del producto que se pueden elegir. */
  images: CatalogImage[];
  /** Los datos reales que llenan los componentes en la tienda (y en la vista previa). */
  facts: StoreFacts;
  /** El contexto del producto cambió después de escribir la página. */
  stale: boolean;
  /** Qué cambió (lib/copy/stale.ts), en el orden en que se muestra. */
  staleReasons: import("@/lib/copy/stale").CopyStaleReason[];
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
  /** El borrador frente a los ángulos de hoy (lib/ads/angles.ts); null sin borrador guardado o sin ángulos. */
  draftAngles: import("./ads/angles").DraftAngles | null;
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
  /** Inicio programado de los conjuntos (null: al publicar). Meta retiene la entrega hasta entonces. */
  startsAt: string | null;
  /** Nunca entregó según nuestras lecturas: se ofrece «Rehacer» (Meta lo confirma al tocarlo). */
  canRedo: boolean;
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
  /** Con qué se generó: las piezas de un proveedor no esconden las del otro. */
  provider: ImageProvider;
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
  /** Su copia en Anuncios ya está en Meta o la usa un anuncio: «Proponer otros» no la borra. */
  kept?: boolean;
  /** Falló después de llegar a Higgsfield por un corte nuestro: se puede recuperar sin volver a cobrar. */
  recoverable?: boolean;
  createdAt: string;
}

export interface CreativeConceptView {
  id: string;
  /** El ángulo de testeo al que pertenece (su conjunto de anuncios). */
  angle: AngleSlot;
  angleName: string;
  family: import("./creatives/catalog").ConceptFamily;
  familyName: string;
  name: string;
  why: string;
  /** Cómo se va a ver la pieza, para decidir antes de pagarla (conceptos con dirección de arte). */
  look?: string;
  preset?: { id: string; name: string; group: string; cover?: string };
  texts: { role: import("./creatives/catalog").TextRole; text: string }[];
  /** Solo el chat de WhatsApp: la conversación (texts va vacío). */
  chat?: import("./creatives/chat").WhatsappChat;
  edited: boolean;
  assets: CreativeAssetView[];
}

export interface CreativesState {
  /** Por qué no se puede usar todavía (ángulos sin aprobar, sin proveedor de imágenes). */
  locked: string | null;
  /** Hay un proveedor de imágenes disponible (Higgsfield conectado o Gemini activado). */
  connected: boolean;
  /** Con qué se genera y qué más se puede elegir (la elección queda guardada). */
  imageProvider: ImageProviderChoice;
  run?: { id: string; status: RunStatus; error?: string; createdAt: string };
  concepts: CreativeConceptView[];
  /** Cota de USD por imagen del proveedor elegido, para mostrar antes de generar. */
  imageCostUsd: number;
}

export interface ProductCreatives extends CreativesState {
  product: Product;
  /** La pestaña Videos (docs/spec-video-ugc.md): un video por ángulo y formato. */
  videos: VideosState;
}

// ---------------------------------------------------------------- Video UGC (docs/spec-video-ugc.md)

/** Una toma de un guion: imagen clave, toma hablada o B-roll. */
export interface VideoShotView {
  id: string;
  key: string;
  kind: "keyframe" | "a_roll" | "b_roll";
  attempt: number;
  render: "queued" | "running" | "succeeded" | "failed";
  error?: string;
  /** URL firmada (1 h): imagen en las imágenes clave, MP4 en los clips. */
  src?: string;
  qa?: { pass: boolean; issues: string[] };
  /** Solo las imágenes clave se aprueban una a una. */
  status: ContentStatus;
  /** Falló después de llegar a Higgsfield: se puede recuperar sin volver a cobrar. */
  recoverable?: boolean;
}

/** En qué paso está el video de un ángulo en un formato. */
export type VideoStep = "script" | "keyframes" | "clips" | "montage" | "final";

export interface VideoCardView {
  slot: AngleSlot;
  angleName: string;
  /** UGC (persona de IA) o mascota animada: cada ángulo tiene una tarjeta por formato, con su propio avance. */
  format: import("./video/catalog").VideoFormat;
  step: VideoStep;
  script?: {
    id: string;
    status: RunStatus;
    error?: string;
    payload?: import("./video/schemas").UgcScript;
    approved: boolean;
    edited: boolean;
    createdAt: string;
  };
  /** La última de cada clave (K1…), en orden. */
  keyframes: VideoShotView[];
  /** La última de cada toma hablada y B-roll (A1…, B1…), en orden. */
  clips: VideoShotView[];
  final?: { src?: string; durationS?: number; sizeBytes?: number; status: ContentStatus; inAds: boolean };
  /** USD estimados antes de gastar. */
  cost: { keyframes: number; clips: number };
}

export interface VideosState {
  /** Por qué no se puede usar todavía (ángulos sin aprobar, sin Higgsfield). */
  locked: string | null;
  /** Una por ángulo aprobado y formato (VIDEO_FORMATS), en el orden de los ángulos. */
  cards: VideoCardView[];
}

// ---------------------------------------------------------------- Imágenes de la página (docs/spec-imagenes.md)

/** Una opción para un espacio de la página: generada, subida o una foto de Información base. */
export interface PageImageOptionView {
  id: string;
  source: "ai" | "upload" | "reference";
  shotId?: string;
  referenceId?: string;
  render: "queued" | "running" | "succeeded" | "failed";
  /** 2: el reintento automático después de que el QA rechazó el primero. */
  attempt: number;
  /** Por qué falló, o por qué sigue en cola. */
  error?: string;
  /** URL firmada de la imagen (1 h). */
  src?: string;
  width?: number;
  height?: number;
  qa?: { pass: boolean; issues: string[] };
  /** Elegida para la página. */
  chosen: boolean;
  /** Descartada: se borra pasado el plazo de Deshacer. */
  discarded: boolean;
  /** Orden en la galería (1 = la primera después de la portada). */
  order?: number;
  /** De la galería: es la portada elegida («Usar de portada»). */
  cover?: boolean;
  recoverable?: boolean;
  createdAt: string;
}

/** Un espacio de la página del producto (MediaSlot): Portada, Galería o un Beneficio. */
export interface PageImageSlotView {
  key: string;
  kind: import("./page-images/catalog").SlotKind;
  title: string;
  required: boolean;
  /** «1:1 · imagen». */
  format: string;
  ratio: "1:1" | "3:4";
  /** El texto aprobado en Textos que acompaña a este espacio (beneficios). */
  pairs?: string;
  /**
   * Las tomas que propuso el director para este espacio («Generar» o «Generar otra»). `auto`: se genera
   * sola al armar la galería (la portada y las primeras de galería); las demás, a pedido.
   */
  shots: { id: string; name: string; type: string; look: string; auto: boolean }[];
  options: PageImageOptionView[];
}

export interface PageImagesState {
  /** Por qué la etapa no se puede usar todavía (la página del producto sin aprobar). */
  locked: string | null;
  /** Hay un proveedor de imágenes: sin él se puede elegir y subir, pero no generar. */
  connected: boolean;
  /** Con qué se genera y qué más se puede elegir (la elección queda guardada). */
  imageProvider: ImageProviderChoice;
  /** Por qué no se puede generar (sin proveedor, sin ángulos aprobados). */
  cannotGenerate: string | null;
  run?: { id: string; status: RunStatus; error?: string; createdAt: string };
  slots: PageImageSlotView[];
  /** Las fotos en uso de Información base: se pueden elegir en cualquier espacio. */
  references: { id: string; src: string; alt: string }[];
  /** Cota de USD por imagen del proveedor elegido, para mostrar antes de generar. */
  imageCostUsd: number;
  /** Los beneficios aprobados cambiaron después de proponer la galería. */
  stale: boolean;
}

export interface ProductPageImages extends PageImagesState {
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
  /** Unidades de la moneda de la tienda por dólar: para mostrar en esa moneda un costo en USD (imágenes, clips). */
  usdRate: number;
}

/** Etapa Publicar (docs/spec-publicar.md): lo que la pantalla necesita saber. */
export interface PublishState {
  shop: string | null;
  /** Por qué no se puede publicar por la conexión (sin Shopify, sin permisos); null si está bien. */
  connection: string | null;
  /** Faltan los permisos de temas y archivos: se piden de nuevo en Shopify. */
  needsPermissions: boolean;
  theme: {
    status: "none" | "installing" | "preview" | "published" | "failed";
    name?: string;
    error?: string;
    previewUrl?: string;
    outdated: boolean;
  };
  /** Lo que falta en DropFlex para publicar (ficha, portada, galería, precio). */
  missing: string[];
  /** Lo que se va a publicar. */
  plan: {
    title: string;
    components: string[];
    images: number;
    packs: { units: number; price: number; label?: string }[];
    reviews: number;
    accent: string | null;
    policies: string[];
  };
  currency: string;
  publication: {
    status: "publishing" | "published" | "error";
    error?: string;
    publishedAt?: string;
    productUrl?: string;
    /** Lo aprobado cambió desde la última publicación. */
    stale: boolean;
  } | null;
}

// ---------------------------------------------------------------- Eventos (docs/spec-eventos.md)

export type EventPhaseUi = "upcoming" | "teaser" | "live" | "ended";
export type EventIntensityUi = "subtle" | "medium" | "full";
export type EventDecorUi = "bolt" | "tag" | "pumpkin" | "heart" | "snowflake" | "sparkles" | "sun" | "pencil";

/** Los colores y textos con que se ve el evento (tema + cambios del comerciante). */
export interface EventLook {
  accent: string;
  onAccent: string;
  surface: string;
  onSurface: string;
  badge: string;
  announcement: string;
  decor: EventDecorUi;
  earlyLabel: string;
  countdownDuring: string;
}

export interface EventActivationView {
  enabled: boolean;
  intensity: EventIntensityUi;
  overrides: { accent?: string; announcement?: string; badge_label?: string };
  /** AAAA-MM-DD en la zona de la tienda; null = la del evento. */
  startsOn: string | null;
  endsOn: string | null;
}

export interface EventView {
  slug: string;
  name: string;
  kindLabel: string;
  phase: EventPhaseUi;
  /** «En antesala · el evento empieza en 7 días». */
  phaseLabel: string;
  /** El evento en sí: «27 – 30 nov». */
  eventLabel: string;
  /** Lo que se ve en la tienda, con antesala: «16 – 30 nov». */
  windowLabel: string;
  /** Fechas del calendario (AAAA-MM-DD) para los campos. */
  defaultStartsOn: string;
  defaultEndsOn: string;
  look: EventLook;
  /** La activación de toda la tienda, o null. */
  store: EventActivationView | null;
  /** Productos con su propia activación. */
  productOverrides: number;
}

export interface EventProductView {
  id: string;
  name: string;
  image: string;
  published: boolean;
  /** Lo que vale para este producto: la suya o la de la tienda; null = sin evento. */
  effective: { scope: "product" | "store"; intensity: EventIntensityUi } | null;
  override: EventActivationView | null;
  copy: { status: "generating" | "generated" | "approved" | "failed"; text: { announcement: string; subtitle: string; badge_label: string } | null; error: string | null } | null;
  /** Por qué no se pueden escribir textos del evento todavía, o null. */
  copyLocked: string | null;
  /** Para la vista previa. */
  preview: { title: string; subtitle: string; price: number | null; compareAt: number | null; currency: string };
}

export interface EventsOverview {
  timezone: string;
  countryName: string;
  events: EventView[];
  /** Por qué no se puede publicar en la tienda, o null. */
  connection: string | null;
  /** Productos publicados con cambios de eventos sin publicar. */
  stale: { id: string; name: string }[];
  publishedProducts: number;
}

export interface EventDetail extends EventsOverview {
  event: EventView;
  products: EventProductView[];
}

// ---------------------------------------------------------------- Diferenciador y competencia
// (Información base, docs/spec-angulos-testeo.md › §3)

/** El diferenciador: lo confirmado por el comerciante o, si no hay, la propuesta de la ficha. */
export interface DifferentiatorView {
  value: import("@/lib/ai/schemas").Differentiator | null;
  /** El comerciante lo confirmó (products.differentiator). */
  confirmed: boolean;
  /** Lo que propuso la ficha (product_briefs.payload.differentiator). */
  proposed: import("@/lib/ai/schemas").Differentiator | null;
  /** La ficha es de antes del diferenciador: la IA no llegó a proponerlo. */
  oldBrief?: boolean;
}

/** Una tienda de la competencia y el resumen de su análisis. */
export interface CompetitorView {
  id: string;
  url: string;
  /** El dominio, sin www. */
  host: string;
  status: "queued" | "running" | "succeeded" | "failed";
  /** «No pudimos leer esa página: …» cuando falló. */
  error?: string;
  createdAt: string;
  analysis?: {
    storeName?: string;
    price?: number;
    compareAt?: number;
    offer?: string;
    painOrDesire: string;
    promise: string;
    frame: SalesAngle;
    /** Nombre de la forma en la pantalla (ANGLES[frame].name). */
    frameName: string;
  };
}
