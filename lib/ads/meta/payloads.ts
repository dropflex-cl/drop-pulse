// Cuerpos de creación de Meta (Graph API), puros para poder probarlos sin red (docs/spec-anuncios.md
// §3 y §9). Portado de dropflex (lib/ads/meta/mappers.ts › buildAdsetTargeting y meta/creative.ts),
// con estos cambios:
// - `is_dynamic_creative` y `asset_feed_spec` solo cuando el anuncio lleva más de una variante (CBO dco);
//   un anuncio de ABO es un creativo normal: un medio y un texto (R1 del análisis).
// - Ubicación explícita (vive o estuvo) y `attribution_spec` y `url_tags` explícitos (C17, C18).

import type { Audience, LaunchConfig } from "../schemas";

export const URL_TAGS = "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}";
/** 7 días clic + 1 día vista (C17). */
export const ATTRIBUTION_SPEC = [
  { event_type: "CLICK_THROUGH", window_days: 7 },
  { event_type: "VIEW_THROUGH", window_days: 1 },
];

export interface Targeting {
  geo_locations: { countries: string[]; location_types: string[] };
  excluded_geo_locations?: { regions: { key: string }[] };
  age_min: number;
  /** Advantage+ audience: Meta exige declararlo. 1 = abierto; 0 = respetar los intereses. */
  targeting_automation: { advantage_audience: 0 | 1 };
  flexible_spec?: { interests: { id: string; name: string }[] }[];
}

/** El público de un conjunto. Las regiones excluidas sobreviven a Advantage+ (expande edad e intereses, no geografía). */
export function buildTargeting(launch: Pick<LaunchConfig, "countries" | "excluded_regions" | "location" | "min_age">, audience: Audience): Targeting {
  const interests = audience.kind === "interests" ? audience.interests : [];
  const t: Targeting = {
    geo_locations: { countries: [...launch.countries], location_types: launch.location === "home" ? ["home"] : ["home", "recent"] },
    age_min: launch.min_age,
    targeting_automation: { advantage_audience: interests.length ? 0 : 1 },
  };
  if (launch.excluded_regions.length) t.excluded_geo_locations = { regions: launch.excluded_regions.map((r) => ({ key: r.key })) };
  if (interests.length) t.flexible_spec = [{ interests: interests.map((i) => ({ id: i.id, name: i.name })) }];
  return t;
}

/** Un medio ya subido a la cuenta. */
export type UploadedMedia = { kind: "image"; imageHash: string } | { kind: "video"; videoId: string; thumbnailHash: string };

export interface AdText {
  primaryTexts: string[];
  headlines: string[];
  description: string;
  link: string;
  cta: string;
}

export interface CreativePayload {
  name: string;
  object_story_spec: Record<string, unknown>;
  asset_feed_spec?: Record<string, unknown>;
  url_tags: string;
}

/** Un creativo normal: un medio, un texto principal y un título. */
export function singleCreative(name: string, pageId: string, media: UploadedMedia, text: { primaryText: string; headline: string; description: string; link: string; cta: string }): CreativePayload {
  const cta = { type: text.cta, value: { link: text.link } };
  const story =
    media.kind === "image"
      ? { page_id: pageId, link_data: { image_hash: media.imageHash, link: text.link, message: text.primaryText, name: text.headline, ...(text.description ? { description: text.description } : {}), call_to_action: cta } }
      : { page_id: pageId, video_data: { video_id: media.videoId, image_hash: media.thumbnailHash, message: text.primaryText, title: text.headline, ...(text.description ? { link_description: text.description } : {}), call_to_action: cta } };
  return { name, object_story_spec: story, url_tags: URL_TAGS };
}

/** Un creativo dinámico (DCO): varios medios y textos que Meta combina. Solo CBO `dco`. */
export function dynamicCreative(name: string, pageId: string, media: UploadedMedia[], text: AdText): CreativePayload {
  const images = media.filter((m) => m.kind === "image").map((m) => ({ hash: (m as { imageHash: string }).imageHash }));
  const videos = media.filter((m) => m.kind === "video").map((m) => ({ video_id: (m as { videoId: string }).videoId, thumbnail_hash: (m as { thumbnailHash: string }).thumbnailHash }));
  return {
    name,
    object_story_spec: { page_id: pageId },
    asset_feed_spec: {
      ...(images.length ? { images } : {}),
      ...(videos.length ? { videos } : {}),
      bodies: text.primaryTexts.map((t) => ({ text: t })),
      titles: text.headlines.map((t) => ({ text: t })),
      ...(text.description ? { descriptions: [{ text: text.description }] } : {}),
      link_urls: [{ website_url: text.link }],
      call_to_action_types: [text.cta],
      ad_formats: [...(images.length ? ["SINGLE_IMAGE"] : []), ...(videos.length ? ["SINGLE_VIDEO"] : [])],
    },
    url_tags: URL_TAGS,
  };
}

/** Un anuncio con más de una variante (texto o medio) necesita un conjunto de contenido dinámico. */
export function needsDynamicCreative(mediaCount: number, text: Pick<AdText, "primaryTexts" | "headlines">): boolean {
  return mediaCount > 1 || text.primaryTexts.length > 1 || text.headlines.length > 1;
}
