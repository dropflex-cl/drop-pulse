// Datos de ejemplo de la pestaña Videos (docs/spec-video-ugc.md §2): el guion aprobado de la POC de
// Deep Collagen (variante E) en cada paso. Los clips no tienen archivo: aquí solo importa la pantalla.
import { productImage } from "@/lib/mock/images";
import type { VideoCardView, VideoShotView, VideoStep, VideosState } from "@/lib/types";
import type { UgcScript } from "@/lib/video/schemas";

const script: UgcScript = {
  format_fit: { recommended: "ugc_ai", why: "El problema se ve en el espejo y la solución es un gesto de 20 segundos." },
  persona: "a Latin American woman around 42, warm and relatable",
  character: { look: "dark-brown hair clipped up, natural skin with fine lines", wardrobe: "a light gray bathrobe", setting: "a small home bathroom, morning light" },
  hook_why: "Le habla de lo que hace cada mañana antes del trabajo: se reconoce en tres segundos.",
  keyframes: [
    { key: "K1", uses_character: true, uses_product: false, one_hand: false, prompt: "The person at the bathroom mirror dabbing foundation." },
    { key: "K2", uses_character: true, uses_product: true, one_hand: true, prompt: "The person by the window holding the product next to her cheek." },
    { key: "K3", uses_character: false, uses_product: false, one_hand: false, prompt: "A wall clock at 7:12." },
    { key: "K4", uses_character: false, uses_product: true, one_hand: false, prompt: "Macro of the dropper releasing drops." },
  ],
  a_roll: [
    { key: "A1", keyframe: "K1", seconds: 6, line: "¿Te maquillas en siete minutos antes del trabajo? Entonces seguro cometes estos tres errores.", delivery: "Rises on «siete minutos», complicit on «seguro».", acting: "Leans in.", motion: "Handheld selfie." },
    { key: "A2", keyframe: "K1", seconds: 6, line: "Uno: base sobre piel tirante. ¡A mí, a media mañana, se me marcaba todo en las líneas!", delivery: "Funny confession, stresses «todo».", acting: "Points under her eye.", motion: "Closer framing." },
    { key: "A3", keyframe: "K1", seconds: 6, line: "Dos: nos olvidamos del cuello. Y tres: creemos que la crema sola ya es rutina.", delivery: "Tone of «right?».", acting: "Counts on fingers.", motion: "Handheld." },
    { key: "A4", keyframe: "K2", seconds: 7, line: "¿Lo que cambié? Tres gotas en rostro y cuello, antes de la crema y la base. ¡Veinte segundos!", delivery: "Like revealing a secret.", acting: "Brings the bottle closer.", motion: "By the window." },
    { key: "A5", keyframe: "K2", seconds: 5, line: "Te dura hasta mes y medio, ¡y lo pagas cuando te llega!", delivery: "Good news.", acting: "Winks.", motion: "Handheld." },
  ],
  b_roll: [
    { key: "B1", keyframe: "K3", anchor: "minutos", cut_s: 1.2, motion: "The second hand ticks." },
    { key: "B2", keyframe: "K4", anchor: "gotas", cut_s: 1.8, motion: "Three drops fall." },
  ],
  text_beats: [
    { anchor: "minutos", until: null, text: "¿MAQUILLAJE EN 7 MIN?" },
    { anchor: "errores", until: null, text: "3 ERRORES" },
    { anchor: "dura", until: null, text: "Lleva 3, paga 2 · $18.663 c/u" },
  ],
  end_card: { title: "Deep Collagen", subtitle: "Pagas al recibir", cta: "Comprar", small_print: ["Prueba primero en una zona pequeña."] },
  compliance_notes: ["El rótulo «Dramatización» va durante todo el video.", "Sin antes y después de la piel."],
};

const STEPS: VideoStep[] = ["script", "keyframes", "clips", "montage", "final"];

const shot = (key: string, kind: VideoShotView["kind"], over: Partial<VideoShotView> = {}): VideoShotView => ({
  id: `s-${key}`,
  key,
  kind,
  attempt: 1,
  render: "succeeded",
  src: kind === "keyframe" ? productImage(Number(key.slice(1)), 1) : undefined,
  qa: kind === "keyframe" ? { pass: true, issues: [] } : undefined,
  status: "generado",
  ...over,
});

/** ?video=none|writing|failed|script|keyframes|clips|montage|final */
export function videosFixture(v: string): VideosState {
  const at = STEPS.indexOf(v as VideoStep);
  const card = (slot: 1 | 2 | 3, name: string, withScript: boolean): VideoCardView => {
    const step: VideoStep = at < 0 ? "script" : STEPS[at];
    const keyframes =
      at >= 1
        ? script.keyframes.map((k, i) =>
            shot(k.key, "keyframe", at >= 2 ? { status: "aprobado" } : i === 1 ? { qa: { pass: false, issues: ["Revisa las manos: hay una de más o está deforme."] } } : i === 3 ? { render: "running", src: undefined } : {}),
          )
        : [];
    const clips =
      at >= 2
        ? [...script.a_roll.map((a) => a.key), ...script.b_roll.map((b) => b.key)].map((k, i) => shot(k, k.startsWith("A") ? "a_roll" : "b_roll", at === 2 && i > 3 ? { render: "running" } : {}))
        : [];
    return {
      slot,
      angleName: name,
      step,
      script: !withScript
        ? undefined
        : v === "writing"
          ? { id: `v${slot}`, status: "running", approved: false, edited: false, createdAt: "2026-09-26T10:00:00Z" }
          : v === "failed"
            ? { id: `v${slot}`, status: "failed", error: "La IA escribió un guion que no cumple las reglas. Toca Reintentar.", approved: false, edited: false, createdAt: "2026-09-26T10:00:00Z" }
            : { id: `v${slot}`, status: "succeeded", payload: script, approved: at >= 1, edited: false, createdAt: "2026-09-26T10:00:00Z" },
      keyframes,
      clips,
      final: at >= 4 ? { durationS: 31.2, sizeBytes: 8_000_000, status: "revision", inAds: false } : undefined,
      cost: { keyframes: 0.4, clips: 9.43 },
    };
  };
  return {
    locked: v === "locked" ? "Conecta tu cuenta de Higgsfield en Ajustes para hacer videos: las voces y los clips se generan ahí." : null,
    cards: v === "locked" ? [] : [card(3, "Cuando la base se mete en las líneas", v !== "none"), card(1, "La crema se queda arriba, las gotas van primero", false)],
  };
}
