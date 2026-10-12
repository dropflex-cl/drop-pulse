import { z } from "zod";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import { listingSchema, LISTING_INFO } from "@/lib/copy/listing";
import { strictSchema } from "@/lib/copy/page-schema";
import { contentVariants, imagePickSchema } from "@/lib/copy/variants";
import { componentCapabilityCatalog } from "./component-capabilities";
import { ProductIntelligenceError } from "./errors";
import type { VisualState } from "./visual-domain";

// Cada contrato cumple una tarea distinta dentro de la dirección comercial elegida.
export const COMPONENT_ARGUMENTS: Record<string, string> = {
  listing: "Presenta el producto y la promesa central del hook con su oferta principal.",
  "review-stars": "Resume la valoración agregada real para reducir la incertidumbre inicial.",
  "benefit-usps": "Explica ventajas concretas que hacen adecuado el producto para esta necesidad.",
  inventory: "Comunica disponibilidad actual y sus condiciones sin inventar urgencia.",
  "shipping-timeline": "Resuelve cuándo y cómo llega el pedido con la logística vigente.",
  "benefit-double-box": "Reduce dos fricciones de compra con condiciones comerciales concretas.",
  "gif-strip": "Demuestra visualmente una acción del producto que hace creíble su utilidad.",
  "review-slider": "Selecciona reseñas existentes que respondan dudas puntuales de esta dirección.",
  "ugc-slider": "Muestra el uso en una escena cotidiana, con un guion coherente con el hook.",
  "scrolling-benefits": "Recuerda ventajas de compra en mensajes breves que acompañan el recorrido.",
  "pain-block": "Desarrolla el problema cotidiano reconocido por el hook y su consecuencia.",
  "image-with-benefits": "Conecta características visibles con beneficios distintos para el comprador.",
  mechanism: "Explica cómo funciona el producto y por qué permite el beneficio presentado.",
  "use-cases": "Describe situaciones específicas en las que esta solución encaja.",
  "before-after": "Contrasta la situación inicial y la deseada, indicando la naturaleza de la representación.",
  "stats-with-image": "Hace tangible la magnitud del beneficio con datos contextualizados y su imagen.",
  "results-timeline": "Ordena las expectativas de uso y resultados en el tiempo sin inventar plazos.",
  "usage-steps": "Reduce el esfuerzo percibido con instrucciones simples y concretas.",
  "product-includes": "Explica qué recibe el comprador y el valor de cada elemento incluido.",
  "insta-story": "Desarrolla una secuencia visual de descubrimiento, uso y beneficio.",
  "customer-stories": "Narra una situación y su resolución; distingue relato ilustrativo de testimonio real.",
  "review-wall": "Presenta variedad de experiencias existentes para mostrar coincidencias entre compradores.",
  "expert-endorsement": "Explica un criterio experto pertinente; distingue explicación editorial de respaldo real.",
  "comparison-table": "Compara alternativas por criterios que importan al comprador de este hook.",
  guarantee: "Reduce el riesgo percibido con la garantía y las condiciones vigentes.",
  "faq-and-text": "Resuelve objeciones aún abiertas con respuestas directas y específicas.",
  "offer-summary": "Cierra el recorrido uniendo valor, contenido del pack y precio canónico.",
};

export const componentLandingSchema = z.object({
  rows: z.array(z.object({ component: z.string(), proposal: z.unknown(), content: z.unknown(),
    images: z.array(imagePickSchema).default([]), enabled: z.boolean().default(true), status: z.string().default("generated") })),
  review_count: z.number(), image_catalog: z.array(imagePickSchema.omit({ slot: true })).default([]),
  reviews: z.array(z.looseObject({ id: z.string(), body: z.string(), rating: z.number() })).default([]),
});
const knowledgeSchema = z.object({ product: z.unknown(), context: z.unknown(), pricing: z.unknown(), policies: z.unknown(),
  strategy: z.object({ id: z.string(), snapshot: z.object({ angles: z.array(z.looseObject({ id: z.string(), hook: z.string() })) }).passthrough() }).nullable(),
  graph: z.unknown(), landing: componentLandingSchema,
  media: z.object({ selected_gifs: z.array(z.string()), available_video_scripts: z.array(z.string()) }).default({ selected_gifs: [], available_video_scripts: [] }) });
const contentSchema = (id: string) => strictSchema(id) ?? listingSchema;
const isEmpty = (content: unknown) => content == null || (typeof content === "object" && "state" in content && content.state === "empty");
function canonicalReference(state: VisualState) {
  const base = state.references.find(r => r.is_base);
  return base ? { ...base, ...(state.live[`reference:${base.id}`]?.value as object ?? {}) } : null;
}

export function componentGenerationContext(state: VisualState, component: string, variantKey = "default") {
  const k = knowledgeSchema.parse(state.knowledge), native = componentById(component);
  if (component !== "listing" && !native) throw new ProductIntelligenceError("INVALID_REFERENCE", "Ese componente no existe en el tema.");
  const row = k.landing.rows.find(r => r.component === component);
  const variants = row ? contentVariants(row.content ?? row.proposal) : contentVariants(null);
  const variant = variants.find(v => v.key === variantKey);
  if (!variant) throw new ProductIntelligenceError("INVALID_REFERENCE", "Esa variante no existe. Guarda su contenido antes de asignarle imágenes.");
  const primary = k.strategy?.snapshot.angles[0] ?? null;
  const targets = state.targets.filter(t => {
    const target = (t.value as { target: { type: string; component?: string; content_variant_key?: string } }).target;
    return target.type === "landing_component" && target.component === component && target.content_variant_key === variantKey;
  });
  return { product: k.product, context: k.context, pricing: k.pricing, policies: k.policies,
    selected_strategy: k.strategy, primary_direction: primary, evidence_context: k.graph,
    component: { id: component, name: native?.name ?? LISTING_INFO.name, kind: native?.kind ?? "listing",
      argument_job: COMPONENT_ARGUMENTS[component], objection: native?.objection ?? LISTING_INFO.objection,
      placement: native?.placement ?? LISTING_INFO.placement, capability: componentCapabilityCatalog().find(c => c.component === component),
      schema: JSON.parse(JSON.stringify(z.toJSONSchema(contentSchema(component), { target: "draft-7", unrepresentable: "any" }))),
      rules: native?.rules ?? [], forbidden: native?.forbidden ?? [], real_data: native?.realData ?? ["Precio y packs, variantes, disponibilidad y políticas vigentes"],
      media: native?.media ?? [], image_slots: native?.imageSlots ?? [] },
    current: { enabled: row?.enabled ?? true, status: row?.status ?? "missing", variant: { ...variant, images: variant.images ?? row?.images ?? [] }, variants: variants.map(v => ({ key: v.key, angle_id: v.angle_id, hook_id: v.hook_id })) },
    other_arguments: ["listing", ...CATALOG.map(c => c.id)].filter(id => id !== component).map(id => {
      const peer = k.landing.rows.find(r => r.component === id);
      return { component: id, argument_job: COMPONENT_ARGUMENTS[id], enabled: peer?.enabled ?? true,
        excerpt: JSON.stringify(peer ? contentVariants(peer.content ?? peer.proposal).find(v => v.key === variantKey)?.content ?? null : null).slice(0, 500) };
    }),
    canonical_reference: canonicalReference(state), targets,
    available_images: k.landing.image_catalog, available_reviews: k.landing.reviews, media: k.media,
    instructions: ["Desarrolla un argumento propio de este componente desde primary_direction.hook y la información vigente del producto. Consulta other_arguments para evitar repetir titulares y razones.",
      "La variante default sigue el hook primario. Conserva la dirección específica de variantes comerciales existentes y los usos, imágenes omitidas y secciones ocultas.",
      "Antes de editar variantes, lee get_landing_content para conservar su contenido completo. Guarda textos con save_landing_content respetando este schema. No publiques ni generes imágenes por el solo hecho de guardar.",
      "Para una imagen solicitada, traduce el argumento a una escena y mensaje propios del slot, con su ratio y posición. Inspecciona y adjunta la imagen base real al generador; conserva identidad, envase y proporciones.",
      "Prepara la toma con prepare_visual_iteration, ingiere el archivo y consulta su estado. Selecciona el destino landing_component exacto con bind_visual_asset; cada posición conserva las demás imágenes.",
      "GIF y video requieren sus medios específicos; una imagen fija no los completa. Reseñas existentes se reutilizan por ID; una ilustración generada no se presenta como evidencia real."],
  };
}

export function pdpCompletionReport(state: VisualState) {
  const k = knowledgeSchema.parse(state.knowledge);
  const components = ["listing", ...CATALOG.map(c => c.id)].map(component => {
    const row = k.landing.rows.find(r => r.component === component), native = componentById(component);
    const variants = (row ? contentVariants(row.content ?? row.proposal) : contentVariants(null)).map(v => {
      const parsed = contentSchema(component).safeParse(v.content), picks = v.images ?? row?.images ?? [];
      const unavailable = picks.filter(p => !k.landing.image_catalog.some(i => i.id === p.id && i.source === p.source));
      const videoIds = z.object({ script_ids: z.array(z.string()).optional() }).safeParse(v.content);
      const requestedVideos = videoIds.success ? videoIds.data.script_ids ?? k.media.available_video_scripts : [];
      const mediaPending = component === "gif-strip" && !k.media.selected_gifs.length ? ["gifs"]
        : component === "ugc-slider" && (!requestedVideos.length || requestedVideos.some(id => !k.media.available_video_scripts.includes(id))) ? ["videos"]
        : ["review-stars", "review-slider", "review-wall"].includes(component) && !k.landing.review_count ? ["reviews"] : [];
      return { key: v.key, media_pending: mediaPending, angle_id: v.angle_id, hook_id: v.hook_id,
        content_state: !row || isEmpty(v.content) ? "missing" : parsed.success ? "complete" : "invalid",
        missing_fields: parsed.success || isEmpty(v.content) ? [] : parsed.error.issues.slice(0, 10).map(i => ({ field: i.path.join("."), message: i.message })),
        image_slots: (native?.imageSlots ?? []).map(slot => {
          const count = picks.filter(p => p.slot === slot.key && !unavailable.includes(p)).length;
          return { ...slot, selected: count, missing: Math.max(0, slot.min - count), fallback_available: slot.min === 0 && Boolean(state.references.length) };
        }), unavailable_images: unavailable,
      };
    });
    return { component, enabled: row?.enabled ?? true, discarded: row?.status === "rejected", argument_job: COMPONENT_ARGUMENTS[component], variants,
      media_requirements: native?.media ?? [], real_data: native?.realData ?? [], review_count: k.landing.review_count };
  });
  const active = components.filter(c => c.enabled && !c.discarded);
  return { primary_direction: k.strategy?.snapshot.angles[0] ?? null, canonical_reference: canonicalReference(state), components,
    summary: { total: components.length, active: active.length, hidden: components.filter(c => !c.enabled).length,
      content_pending: active.filter(c => c.variants.some(v => v.content_state !== "complete")).map(c => c.component),
      media_pending: active.filter(c => c.variants.some(v => v.media_pending.length)).map(c => c.component),
      images_pending: active.filter(c => c.variants.some(v => v.unavailable_images.length || v.image_slots.some(s => s.missing))).map(c => c.component) },
    limitations: ["La validación del contrato no certifica calidad, argumentos distintos ni alineación semántica: revísalos con get_component_generation_context.",
      "Los slots opcionales pueden usar el respaldo del tema; no obligan a generar. Los requisitos de GIF, video y datos operativos se consultan en sus herramientas.",
      "Este reporte no publica ni sustituye preparePublish. Las secciones ocultas y descartadas se conservan."],
  };
}
