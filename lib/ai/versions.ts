// La versión vigente del prompt de cada paso, para registrarla con cada llamada (ai_generations.
// prompt_version) y medir cada cambio antes y después (docs/spec-prompts-simples.md §9). Un paso que
// sube su versión no toca este archivo: la constante viene de su módulo. Puro.

import { PACK_LABELS_PROMPT_VERSION } from "@/lib/ai/schemas";
import { COPY_PROMPT_VERSION } from "@/lib/copy/schemas";
import { CHAT_PROMPT_VERSION, CREATIVES_PROMPT_VERSION, QA_PROMPT_VERSION } from "@/lib/creatives/schemas";
import { EVENT_COPY_PROMPT_VERSION } from "@/lib/events/copy";
import { PAGE_IMAGES_PROMPT_VERSION } from "@/lib/page-images/schemas";
import { KEYFRAME_QA_PROMPT_VERSION, UGC_PROMPT_VERSION } from "@/lib/video/schemas";
import { STRATEGY_EXTRACT_PROMPT_VERSION } from "@/lib/strategy/prompts";
import { USAGE_TIP_PROMPT_VERSION } from "@/lib/whatsapp/tip";
import type { AiStep } from "./costs";

/**
 * Los pasos con prompt en el código. Los renders (Higgsfield, Gemini) no tienen. Los prompts guardados
 * en la base (product_data, strategy: prompt_templates) pasan la versión de su plantilla con
 * `promptVersion`, igual que el guion de mascota (MASCOT_PROMPT_VERSION).
 */
export const PROMPT_VERSIONS: Partial<Record<AiStep, number>> = {
  pack_labels: PACK_LABELS_PROMPT_VERSION,
  strategy_extract: STRATEGY_EXTRACT_PROMPT_VERSION,
  page_argument: COPY_PROMPT_VERSION,
  page_copy: COPY_PROMPT_VERSION,
  event_copy: EVENT_COPY_PROMPT_VERSION,
  page_plan: PAGE_IMAGES_PROMPT_VERSION,
  creative_concepts: CREATIVES_PROMPT_VERSION,
  creative_art: CREATIVES_PROMPT_VERSION,
  creative_chat: CHAT_PROMPT_VERSION,
  creative_qa: QA_PROMPT_VERSION,
  ugc_script: UGC_PROMPT_VERSION,
  video_plan: UGC_PROMPT_VERSION,
  video_qa: KEYFRAME_QA_PROMPT_VERSION,
  usage_tip: USAGE_TIP_PROMPT_VERSION,
};
