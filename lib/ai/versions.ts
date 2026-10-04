// La versión vigente del prompt de cada paso, para registrarla con cada llamada (ai_generations.
// prompt_version) y medir cada cambio antes y después (docs/spec-prompts-simples.md §9). Un paso que
// sube su versión no toca este archivo: la constante viene de su módulo. Puro.

import { CUSTOMER_AVATAR_PROMPT_VERSION, PACK_LABELS_PROMPT_VERSION, PRODUCT_BRIEF_PROMPT_VERSION } from "@/lib/ai/schemas";
import { ANGLE_BRIEF_PROMPT_VERSION, ANGLE_ROUTER_PROMPT_VERSION } from "@/lib/angles/schemas";
import { COMPETITOR_PROMPT_VERSION } from "@/lib/competitors/schemas";
import { COPY_PROMPT_VERSION } from "@/lib/copy/schemas";
import { CHAT_PROMPT_VERSION, CREATIVES_PROMPT_VERSION, QA_PROMPT_VERSION } from "@/lib/creatives/schemas";
import { EVENT_COPY_PROMPT_VERSION } from "@/lib/events/copy";
import { HOOK_CRITIC_PROMPT_VERSION } from "@/lib/hooks/critic";
import { HOOKS_PROMPT_VERSION } from "@/lib/hooks/schemas";
import { PAGE_IMAGES_PROMPT_VERSION } from "@/lib/page-images/schemas";
import { KEYFRAME_QA_PROMPT_VERSION, UGC_PROMPT_VERSION } from "@/lib/video/schemas";
import { USAGE_TIP_PROMPT_VERSION } from "@/lib/whatsapp/tip";
import type { AiStep } from "./costs";

/**
 * Los pasos con prompt propio. Los renders (Higgsfield, Gemini) no tienen. El guion de mascota tiene su
 * versión (MASCOT_PROMPT_VERSION), en el guion y en sus tomas: la pasa quien registra.
 */
export const PROMPT_VERSIONS: Partial<Record<AiStep, number>> = {
  product_brief: PRODUCT_BRIEF_PROMPT_VERSION,
  customer_avatar: CUSTOMER_AVATAR_PROMPT_VERSION,
  pack_labels: PACK_LABELS_PROMPT_VERSION,
  competitor_analysis: COMPETITOR_PROMPT_VERSION,
  angle_ranking: ANGLE_ROUTER_PROMPT_VERSION,
  angle_frames: ANGLE_ROUTER_PROMPT_VERSION,
  angle_brief: ANGLE_BRIEF_PROMPT_VERSION,
  angle_hooks: HOOKS_PROMPT_VERSION,
  hook_critic: HOOK_CRITIC_PROMPT_VERSION,
  page_argument: COPY_PROMPT_VERSION,
  page_copy: COPY_PROMPT_VERSION,
  event_copy: EVENT_COPY_PROMPT_VERSION,
  page_plan: PAGE_IMAGES_PROMPT_VERSION,
  creative_concepts: CREATIVES_PROMPT_VERSION,
  creative_chat: CHAT_PROMPT_VERSION,
  creative_qa: QA_PROMPT_VERSION,
  ugc_script: UGC_PROMPT_VERSION,
  video_plan: UGC_PROMPT_VERSION,
  video_qa: KEYFRAME_QA_PROMPT_VERSION,
  usage_tip: USAGE_TIP_PROMPT_VERSION,
};
