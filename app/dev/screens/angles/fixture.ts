// Datos de ejemplo para /dev/screens/angles (etapa Estrategia). No se usan fuera de desarrollo.
import { productImage } from "@/lib/mock/images";
import { productPosition, type AngleFacts } from "@/lib/products/stages";
import type { ProductStrategy, StrategyView } from "@/lib/types";

const NOW = "2026-10-05T12:00:00Z";

const REPORT = `## 🔎 Análisis del producto

**Problema que resuelve:** la espalda encorvada después de 8 horas sentado frente al computador.

**Qué lo diferencia:** no sostiene a la fuerza como una faja; tira los hombros hacia atrás y se usa debajo de la ropa.

## 🎯 40 hooks

| Hook | Gatillo psicológico | Potencial |
| --- | --- | --- |
| A las 4 de la tarde ya no sé cómo sentarme. | Dolor | 9 |
| Me vi de perfil en una videollamada y no me reconocí. | Identificación | 9 |
| No es la silla. Es lo que haces con los hombros. | Error común | 8 |

## 🚀 Plan de test inicial

Si tuviera que gastar mi primer dólar en publicidad para este producto, probaría estos 3 conceptos…`;

const ANGLES: StrategyView["angles"] = [
  { index: 0, title: "La videollamada que te delata", hook: "Me vi de perfil en una videollamada y no me reconocí.", promise: "Hombros atrás sin pensarlo, debajo de la camisa.", why: "Prueba si la vergüenza visual mueve más que el dolor.", segment: "Oficinistas de 30 a 45 en teletrabajo", frameName: "Edad e identidad" },
  { index: 1, title: "No es la silla", hook: "No es la silla. Es lo que haces con los hombros.", promise: "Corrige la causa, no el síntoma.", why: "Prueba si romper la creencia de la silla cara detiene el scroll.", segment: "Quienes ya compraron una silla ergonómica", frameName: "Mecanismo único" },
  { index: 2, title: "Las 4 de la tarde", hook: "A las 4 de la tarde ya no sé cómo sentarme.", promise: "Terminar el día sin la espalda molida.", why: "Prueba el dolor cotidiano con un momento exacto.", segment: "Oficinistas con jornadas largas", frameName: "Historia personal" },
  { index: 3, title: "Uno para cada uno", hook: "Mi pareja me lo robó a la semana.", promise: "Dos correctores, pagas al recibir.", why: "Prueba si el pack de 2 sube el ticket.", segment: "Parejas que trabajan desde la casa", frameName: "Oferta" },
  { index: 4, title: "Lo que el kinesiólogo repite", hook: "Lo que me dijo el kinesiólogo y nunca hice.", promise: "La indicación de siempre, sin tener que acordarte.", why: "Prueba la autoridad sin inventar un experto.", segment: "Quienes ya fueron al kinesiólogo", frameName: "Autoridad (experto)" },
];

const chosenFacts: AngleFacts = {
  ranking: { status: "succeeded", confirmed: true, chosen: 2 },
  briefs: [
    { slot: 1, name: "La videollamada que te delata", status: "aprobado", generation: "succeeded" },
    { slot: 2, name: "No es la silla", status: "aprobado", generation: "succeeded" },
  ],
};

/** ?state=locked|start|running|extract|failed|choose|done|ai (sin Anthropic). */
export function fixture(state: string): ProductStrategy {
  const strategy: StrategyView | undefined =
    state === "start" || state === "locked" || state === "ai"
      ? undefined
      : {
          id: "s1",
          status: state === "running" || state === "extract" ? "running" : state === "failed" ? "failed" : "succeeded",
          step: state === "running" ? "report" : state === "extract" ? "extract" : null,
          report: state === "running" ? REPORT.slice(0, 260) : REPORT,
          error: state === "failed" ? "La IA no respondió. Toca Volver a generar." : null,
          templateVersion: 1,
          angles: state === "choose" || state === "done" ? ANGLES : [],
          firstDollar: state === "choose" || state === "done" ? ["La videollamada que te delata", "No es la silla", "Las 4 de la tarde"] : [],
          chosen: state === "done" ? [0, 1] : null,
          confirmedAt: state === "done" ? NOW : null,
          createdAt: NOW,
          startedAt: NOW,
        };
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    base: { described: state !== "locked", priced: true },
    strategy: strategy ? { status: strategy.status, error: strategy.error, confirmed: Boolean(strategy.confirmedAt) } : null,
    angles: state === "done" ? chosenFacts : null,
    ai: state !== "ai",
  });
  return {
    product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Corrector de postura",
      image: productImage(1, 1),
      sku: "",
      filter: pos.filter,
      meter: pos.meter,
      reason: pos.reason,
      tone: pos.tone,
      nextStage: pos.nextStage,
      stages: pos.stages,
      summary: pos.summary,
      status: pos.status,
      anglesPhase: pos.anglesPhase,
      aiConnected: state !== "ai",
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    strategy,
    blocker: state === "locked" ? "Identifica el producto en Información base (Datos del producto)." : null,
    chosen:
      state === "done"
        ? [
            { slot: 1, title: ANGLES[0].title, hook: ANGLES[0].hook },
            { slot: 2, title: ANGLES[1].title, hook: ANGLES[1].hook },
          ]
        : [],
  };
}
