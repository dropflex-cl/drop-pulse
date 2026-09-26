// Constantes del video UGC (docs/spec-video-ugc.md). Lo que aprendió la POC del 2026-09-25/26 vive
// aquí como números, no en el criterio del modelo. Puro.

/** Tomas habladas por guion. Con menos, el video queda largo por toma y se siente lento. */
export const A_ROLL_MIN = 4;
export const A_ROLL_MAX = 6;
/** Segundos por toma hablada: Seedance 2.0 acepta 4–15; más de 8 se siente monótono. */
export const A_ROLL_SECONDS_MIN = 4;
export const A_ROLL_SECONDS_MAX = 8;
/** El largo del video ≈ la suma de las tomas habladas (Seedance no deja silencios). */
export const TOTAL_SECONDS_MIN = 24;
export const TOTAL_SECONDS_MAX = 32;
/**
 * Palabras por segundo: la variante E de la POC (la aprobada) llegó a 2,7–3,0 con la voz entusiasta
 * y sonó natural (A2: 17 palabras en 5,6 s). Más, y la toma se apura o se corta.
 */
export const WORDS_PER_SECOND_MAX = 3;
export const B_ROLL_MAX = 10;
/** Cuánto tapa un B-roll la toma hablada (el montaje lo corta de un clip de 5 s). */
export const B_ROLL_CUT_MIN = 1;
export const B_ROLL_CUT_MAX = 2;
export const KEYFRAMES_MAX = 9;
/** La imagen clave del personaje: todas las demás la usan de referencia para la cara. */
export const CHARACTER_KEY = "K1";

/** Palabras que Seedance pronuncia mal de forma consistente (POC: «Rinde» → «Ride»). */
export const MISPRONOUNCED: { word: string; instead: string }[] = [{ word: "rinde", instead: "«te dura» o «alcanza para»" }];

export const KEYFRAME_ENDPOINT = "marketing-studio/image/flare";
export const A_ROLL_ENDPOINT = "bytedance/seedance-2.0/image-to-video";
export const B_ROLL_ENDPOINT = "kling-video/v2.5-turbo/standard/image-to-video";
/** Kling 2.5 Turbo solo genera 5 o 10 s. */
export const B_ROLL_SECONDS = 5;
export const A_ROLL_RESOLUTION = "720p";
/** Lo que entrega Seedance 2.0 a 720p en 9:16 (el costo se calcula con esto si falta la medida real). */
export const A_ROLL_SIZE = { width: 720, height: 1280 };

/** USD por 1.000 tokens de video de Seedance 2.0 (480p a 1080p). Tokens = ceil(ancho × alto × s × 24 / 1024). */
export const SEEDANCE_USD_PER_1K_TOKENS = 0.014;
/** Kling 2.5 Turbo std, 5 s (medido en la POC). */
export const KLING_TURBO_5S_USD = 0.179;
/** Flare 1k baja: la API no informa el costo, se usa la misma cota que Creativos. */
export const KEYFRAME_COST_USD = 0.1;

/** Topes por comerciante en 24 h: protegen su cuenta de Higgsfield de un bucle. */
export const DAILY_SCRIPTS = 6;
export const DAILY_KEYFRAMES = 60;
export const DAILY_CLIPS = 40;

/** El video final que se sube después del montaje local. */
export const FINAL_MAX_BYTES = 100 * 1024 * 1024;
export const FINAL_SECONDS_MIN = 10;
export const FINAL_SECONDS_MAX = 60;

/** Versión del paquete de montaje (scripts/ugc-montage.py la valida). */
export const PACKAGE_VERSION = 1;

export type ShotKind = "keyframe" | "a_roll" | "b_roll";
