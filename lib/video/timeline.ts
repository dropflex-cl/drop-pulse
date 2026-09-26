// El guion como lo lee el comerciante: las tomas en el orden en que se ven, con su tiempo, sus textos
// en pantalla y el número de toma que usan los clips. Puro, con tests.
import { wordKey, words, type UgcScript } from "./schemas";

export interface TimelineShot {
  /** A1…, B1… (la clave del clip). */
  key: string;
  kind: "a_roll" | "b_roll";
  /** Número de toma en el orden del video: «Toma 3». */
  n: number;
  /** K1… de su imagen clave. */
  keyframe: string;
  /** Hablada: segundos y dónde empieza. */
  seconds?: number;
  start?: number;
  /** Hablada: lo que dice. De apoyo: la palabra que la dispara. */
  line: string;
  anchor?: string;
  /** De apoyo: segundos que tapa. */
  cut?: number;
  /** Índices de text_beats que aparecen durante esta toma hablada. */
  beats: number[];
}

/** La toma hablada que dice la palabra (sin tildes ni mayúsculas); si ninguna, la última. */
function owner(s: UgcScript, anchor: string): number {
  const w = wordKey(anchor);
  const i = s.a_roll.findIndex((a) => words(a.line).includes(w));
  return i < 0 ? s.a_roll.length - 1 : i;
}

/**
 * Las tomas en orden: cada hablada seguida de sus insertos de apoyo (los que se disparan con una de sus
 * palabras). Los textos en pantalla quedan en la toma que dice su palabra.
 *
 * @example
 * scriptTimeline(guion).map((t) => `${t.n}:${t.key}`) // → ["1:A1", "2:B1", "3:A2", …]
 */
export function scriptTimeline(s: UgcScript): TimelineShot[] {
  const beatOwner = s.text_beats.map((b) => owner(s, b.anchor));
  const bOwner = s.b_roll.map((b) => owner(s, b.anchor));
  const out: TimelineShot[] = [];
  let t = 0;
  s.a_roll.forEach((a, i) => {
    out.push({
      key: a.key,
      kind: "a_roll",
      n: out.length + 1,
      keyframe: a.keyframe,
      seconds: a.seconds,
      start: t,
      line: a.line,
      beats: beatOwner.flatMap((o, j) => (o === i ? [j] : [])),
    });
    t += a.seconds;
    s.b_roll.forEach((b, j) => {
      if (bOwner[j] === i) out.push({ key: b.key, kind: "b_roll", n: out.length + 1, keyframe: b.keyframe, line: b.anchor, anchor: b.anchor, cut: b.cut_s, beats: [] });
    });
  });
  return out;
}
