// Versiones de los únicos prompts de pago vigentes: revisión opcional de imágenes.
// Los pasos retirados siguen en AI_STEPS para leer el historial y sus costos.
import { QA_PROMPT_VERSION } from "@/lib/creatives/schemas";
import { PAGE_IMAGES_PROMPT_VERSION } from "@/lib/page-images/schemas";
import { KEYFRAME_QA_PROMPT_VERSION } from "@/lib/video/schemas";
import type { AiStep } from "./costs";

export const PROMPT_VERSIONS: Partial<Record<AiStep, number>> = {
  creative_qa: QA_PROMPT_VERSION,
  page_qa: PAGE_IMAGES_PROMPT_VERSION,
  video_qa: KEYFRAME_QA_PROMPT_VERSION,
};
