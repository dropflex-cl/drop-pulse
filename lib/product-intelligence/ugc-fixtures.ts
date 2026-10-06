// Guion ficticio del organizador para pruebas; ninguna llamada ni dato de producción.
import { randomUUID } from "node:crypto";
import { parseToolInput } from "./validation";
export function ugcInputFixture(product: string = randomUUID(), strategy: string = randomUUID(), angle: string = randomUUID()) {
  const lines = ["¿Otra vez buscando ese lápiz? Pon cada cosa en su lugar.", "Este organizador separa los útiles para encontrarlos cuando los necesitas.", "Mira cómo quedan los lápices, las notas y los accesorios sobre la mesa.", "Elige el pack para tu espacio y paga cuando llegue a casa."];
  return parseToolInput("save_ugc_content", {
    product_id: product, schema_version: "1.0", expected_revision: 0, expected_ugc_etag: "a".repeat(64), idempotency_key: randomUUID(),
    execution_key: "desk-hook-a", strategy_id: strategy, angle_id: angle, angle_slot: 1, landing_angle_id: "desk", landing_hook_id: "lost-pencil",
    hook: { spoken: "¿Otra vez buscando ese lápiz?", screen: "¿Dónde está ese lápiz?", delivery: "intrigued", opening_shot: "selfie_talk", first_motion: "The person leans toward the phone." },
    content: { format: "ugc", lines: { format_fit: { recommended: "ugc_ai", why: "Muestra el uso del organizador." }, speaker: "Una persona que ordena su escritorio", hook_source: 0,
      hook_why: "Abre con el problema de buscar un útil.", a_roll: lines.map((line) => ({ line, seconds: 6, delivery: "Conversational and clear.", acting: "Points to the desk." })),
      end_card: { title: "Organizador", subtitle: "Pagas al recibir", cta: "Comprar", small_print: [] }, compliance_notes: [] },
      plan: { persona: "An ordinary adult at a desk", character: { look: "brown hair, natural face", wardrobe: "a casual shirt", setting: "a small lived-in room with window light" },
        opening: { keyframe: "K2", first_motion: "The person leans toward the phone." }, keyframes: [
          { key: "K2", uses_character: true, uses_product: true, one_hand: true, camera: "selfie", prompt: "The person holds the phone at arm length at home and points at the product on the desk." },
          { key: "K3", uses_character: false, uses_product: true, one_hand: false, camera: "pov", prompt: "The product on a lived-in desk with pencils in it, photographed from above with a phone." }],
        a_roll: lines.map(() => ({ keyframe: "K2", motion: "Small natural hand shake." })),
        b_roll: [{ keyframe: "K3", anchor: "organizador", cut_s: 1.5, motion: "The phone moves down toward the desk." }],
        text_beats: [{ anchor: "lápiz", until: null, text: "¿Dónde está ese lápiz?" }, { anchor: "pack", until: null, text: "Elige tu pack" }] } },
  });
}
