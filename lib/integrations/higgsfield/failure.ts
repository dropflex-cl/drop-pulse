// Por qué falló un trabajo de Higgsfield. El estado trae un `error` con el motivo; antes se descartaba y
// la pantalla decía «Higgsfield no pudo generarla» sin más: la toma A4 de la mascota del audífono falló
// tres veces (2026-10-04) y el comerciante pensó que era por créditos. Puro, con tests.

/** Lo que se muestra y se guarda del motivo: más largo, se corta. */
const DETAIL_MAX = 300;

/** El motivo que manda Higgsfield, en texto (puede venir como texto o como objeto), o null. */
export function providerDetail(raw: unknown): string | null {
  if (raw == null) return null;
  let text: string;
  if (typeof raw === "string") text = raw;
  else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const inner = o.message ?? o.detail ?? o.error ?? o.reason;
    text = typeof inner === "string" ? inner : JSON.stringify(raw);
  } else text = String(raw);
  text = text.replace(/\s+/g, " ").trim();
  if (!text || text === "{}") return null;
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}…` : text;
}

const CREDITS = /credit|balance|insufficient|quota/i;

/**
 * El mensaje de un trabajo que no terminó. `nsfw` y `failed` son los textos de cada etapa; el motivo de
 * Higgsfield va al final, tal cual, y si habla de créditos, el mensaje lo dice (antes no se sabía).
 */
export function failedMessage(status: string, detail: string | null, texts: { nsfw: string; failed: string }): string {
  if (detail && CREDITS.test(detail)) return `Higgsfield no tiene créditos suficientes para esto (motivo: «${detail}»). Recarga en higgsfield.ai y genera de nuevo.`;
  const base = status === "nsfw" ? texts.nsfw : texts.failed;
  return detail ? `${base} Motivo de Higgsfield: «${detail}».` : base;
}
