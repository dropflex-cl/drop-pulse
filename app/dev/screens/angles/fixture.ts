// Datos de ejemplo para /dev/screens/angles (textos de design-system/reference/bundle.js: SUG, DEV, con
// los ángulos de testeo del orquestador v7 de docs/spec-angulos-testeo.md). No se usan fuera de
// desarrollo.
import { productImage } from "@/lib/mock/images";
import { productPosition, type AngleFacts } from "@/lib/products/stages";
import type { AngleBriefView, AngleCandidateView, AngleRankingView, ProductAngles, TestAngleView } from "@/lib/types";
import { AVATAR } from "../base/fixture";

const NOW = "2026-09-24T12:00:00Z";

const CANDIDATES: AngleCandidateView[] = [
  {
    index: 0,
    title: "No es la silla",
    hook: "Cambié la silla dos veces y a las 4 de la tarde me seguían pesando los hombros.",
    speaksTo: "user",
    tone: "Confesión",
    aida: {
      attention: "La escena de las 4 de la tarde: estirarse en la silla con el cuello tenso.",
      interest: "El problema no es la silla: son los hombros que se van hacia adelante.",
      desire: "El ajuste cruzado los lleva atrás bajo la ropa, sin pensar en la postura.",
      action: "Pide el pack de 3 al precio de 2 y paga al recibir.",
    },
    why: "Quien ya cambió de silla y sigue igual está listo para escuchar otra causa: es el dolor más común en la categoría.",
    painOrDesire: "La espalda cargada a las 4 de la tarde aunque la silla sea buena",
    segment: "Quien ya cambió de silla y sigue con dolor",
    promise: "Los hombros vuelven atrás sin pensar en la postura",
    frame: "unique_mechanism",
    frameName: "Mecanismo único",
    triggerMoment: "Estirarse en la silla a media tarde con el cuello tenso",
    competition: "",
    marketAmounts: [],
  },
  {
    index: 1,
    title: "Encorvado en la videollamada",
    hook: "Me vi en la cámara de la reunión y no me reconocí: parecía un signo de pregunta.",
    speaksTo: "user",
    tone: "Humor cotidiano",
    aida: {
      attention: "La miniatura de la videollamada con la espalda en curva.",
      interest: "Pasa a quienes trabajan 9 horas sentados: no es flojera, es el cansancio de los hombros.",
      desire: "Verse derecho en la cámara sin pensar en la postura en cada reunión.",
      action: "Pídelo hoy y paga al recibir.",
    },
    why: "La escena se reconoce en un segundo y el humor hace que se comparta.",
    painOrDesire: "Verse encorvado frente a los demás",
    segment: "Oficinistas de 30 a 45 que trabajan sentados",
    promise: "Verse firme en las reuniones otra vez",
    frame: "age_identity",
    frameName: "Edad e identidad",
    triggerMoment: "Verse encorvado en la cámara de una videollamada",
    competition: "",
    marketAmounts: [],
  },
  {
    index: 2,
    title: "Adiós a la faja rígida",
    hook: "Una faja ortopédica cuesta $45.000 y termina en el cajón. Esta no.",
    speaksTo: "user",
    tone: "Choque",
    aida: {
      attention: "El cajón con fajas que nadie usa.",
      interest: "La faja aprieta la cintura, pero la carga está en los hombros.",
      desire: "Algo que sostiene donde duele y no se nota bajo la polera.",
      action: "Pide el pack de 3 al precio de 2 y paga al recibir.",
    },
    why: "Muchos ya probaron la faja y la dejaron: el enemigo está a la vista y nadie lo nombra.",
    painOrDesire: "Probó fajas que aprietan la cintura y no cambiaron nada",
    segment: "Quien ya compró una faja y la dejó en el cajón",
    promise: "Sostiene los hombros, no la cintura",
    frame: "common_enemy",
    frameName: "Enemigo común",
    triggerMoment: "Sacar la faja del cajón y volver a guardarla",
    competition: "",
    marketAmounts: [45000],
  },
  {
    index: 3,
    title: "El regalo del Día del Padre",
    hook: "Mi papá trabaja doblado en el taller desde que tengo memoria. Este año le regalo esto.",
    speaksTo: "buyer",
    tone: "Emocional",
    aida: {
      attention: "Las manos del papá en el taller, la espalda curva.",
      interest: "Un regalo que va a usar todos los días, no otro que queda guardado.",
      desire: "Verlo enderezarse después de la jornada.",
      action: "Pide el pack de 2: uno para él y otro para ti. Paga al recibir.",
    },
    why: "La fecha está cerca y el pack de 2 tiene una razón real: uno para él y otro para quien lo regala.",
    painOrDesire: "Querer regalarle algo útil al papá que trabaja de pie o encorvado",
    segment: "Hijos e hijas de 25 a 45",
    promise: "Un regalo que se usa todos los días",
    frame: "offer",
    frameName: "Oferta",
    triggerMoment: "Ver al papá estirarse la espalda al llegar del trabajo",
    competition: "",
    marketAmounts: [],
  },
  {
    index: 4,
    title: "Uno para la casa y otro para la oficina",
    hook: "Lo dejé en la casa justo el día de la presentación. Nunca más.",
    speaksTo: "user",
    tone: "Cotidiano",
    aida: {
      attention: "Llegar a la oficina y darse cuenta de que lo olvidó.",
      interest: "Quien trabaja híbrido lo necesita en los dos lugares.",
      desire: "Siempre a mano, sin cargarlo de un lado a otro.",
      action: "Pide el pack de 2 y paga al recibir.",
    },
    why: "Empuja el pack con una razón concreta, pero el dolor es más débil que los otros.",
    painOrDesire: "Olvidarlo en la casa justo el día que más lo necesita",
    segment: "Quien trabaja híbrido",
    promise: "Siempre a mano, en los dos lugares",
    frame: "offer",
    frameName: "Oferta",
    triggerMoment: "Llegar a la oficina y darse cuenta de que lo dejó",
    competition: "",
    marketAmounts: [],
  },
];

const chosenOf = (c: AngleCandidateView, slot: 1 | 2 | 3): TestAngleView => ({
  slot,
  frame: c.frame,
  frameName: c.frameName,
  title: c.title,
  name: c.title,
  painOrDesire: c.painOrDesire,
  segment: c.segment,
  promise: c.promise,
  triggerMoment: c.triggerMoment,
  competition: c.competition,
  hook: c.hook,
  aida: c.aida,
  speaksTo: c.speaksTo,
  tone: c.tone,
  why: c.why,
  marketAmounts: c.marketAmounts.length ? c.marketAmounts : undefined,
});

function ranking(state: string): AngleRankingView | undefined {
  if (state === "start" || state === "locked" || state === "nodiff" || state === "ai") return undefined;
  const ready = state !== "evaluating" && state !== "failed";
  const base: AngleRankingView = {
    id: "rk1",
    status: state === "evaluating" ? "running" : state === "failed" ? "failed" : "succeeded",
    error: state === "failed" ? "La IA no respondió. Intenta de nuevo en un momento." : undefined,
    createdAt: NOW,
    candidates: ready ? CANDIDATES : [],
    suggested: ready ? [0, 2, 3] : [],
    suggestedReason: ready ? "El dolor más común, el enemigo que todos ya probaron y la fecha que se viene: tres razones distintas para comprar." : undefined,
    buyerAndUser: ready ? "Lo compra y lo usa la misma persona, salvo para regalo: ahí compra un hijo o una hija para su papá." : undefined,
    doubts: ready ? ["«Corrige la escoliosis»: es una promesa médica que el producto no puede sostener. No la uses."] : [],
    watchOut: ready ? ["No le atribuyas el dolor a quien mira: «tu espalda» no; «a las 4 de la tarde me pesaban los hombros», sí."] : [],
    competitors: 4,
    missing: [{ text: "Reseñas reales: con reseñas aprobadas la IA puede contar historias de compradores", fix: "reviews" }],
    avatarChanged: false,
  };
  const bare = (c: AngleCandidateView): AngleCandidateView => ({ ...c, hook: "", aida: undefined, speaksTo: undefined, tone: undefined, why: undefined, marketAmounts: [] });
  if (state === "legacy" || state === "legacy-nodiff")
    return { ...base, candidates: [], suggested: [], chosen: [chosenOf(bare({ ...CANDIDATES[0], title: "" }), 1), chosenOf(bare({ ...CANDIDATES[1], title: "" }), 2)].map((a) => ({ ...a, name: a.frameName })), confirmedAt: NOW };
  // Una evaluación de antes del orquestador v7: candidatos sin gancho ni AIDA, con lo que hacía la competencia.
  if (state === "ranking-v6")
    return {
      ...base,
      candidates: CANDIDATES.map((c) => ({ ...bare(c), competition: "Las 4 tiendas venden «postura perfecta»; ninguna habla de la causa." })),
      suggestedReason: undefined,
      buyerAndUser: undefined,
      doubts: [],
      watchOut: [],
      missing: [{ text: "Reseñas reales: subirían Historia personal hasta ~70", fix: "reviews" }],
    };
  if (["developing", "review", "approved", "changing"].includes(state)) return { ...base, chosen: [chosenOf(CANDIDATES[0], 1), chosenOf(CANDIDATES[2], 2), chosenOf(CANDIDATES[1], 3)], confirmedAt: NOW };
  return base;
}

const PRIMARY: AngleBriefView = {
  id: "b1",
  angle: "unique_mechanism",
  name: "No es la silla",
  frameName: "Mecanismo único",
  slot: 1,
  generation: "succeeded",
  status: "generado",
  createdAt: NOW,
  content: {
    coreMessage: "El dolor no viene de la silla: viene de hombros que se van hacia adelante, y el ajuste cruzado los devuelve atrás.",
    hooks: [
      "No es la silla, son los hombros.",
      "Mira lo que pasa cuando me lo ajusto.",
      "Una faja aprieta la cintura. Esto no.",
      "A las 4 de la tarde ya me pesaban los hombros.",
      "No compres otra silla todavía.",
      "Pensé que era puro cuento, pero…",
      "Acá preparamos los pedidos que salen hoy.",
    ],
    hookDetails: [
      { pattern: "Dolor", onScreen: "NO ES LA SILLA", visual: "Mujer en el escritorio que se encorva de a poco hacia la pantalla, el teléfono apoyado en el monitor.", openingShot: "El problema en su lugar" },
      { pattern: "Demostración", onScreen: "MIRA LOS HOMBROS", visual: "De espaldas, frente al espejo: se ajusta las cintas cruzadas y los hombros vuelven atrás.", openingShot: "Selfie en el espejo" },
      { pattern: "Contrario", onScreen: "NO ES UNA FAJA", visual: "Mano que suelta una faja sobre la mesa.", openingShot: "Las manos con el producto" },
      { pattern: "Dolor", followUp: "Y mi silla era buena.", onScreen: "4 PM: HOMBROS CARGADOS", visual: "Reloj de pared y hombros que se masajean." },
      { pattern: "Contrario", onScreen: "ANTES DE COMPRAR OTRA", visual: "Pantalla del celular con una silla ergonómica en el carrito." },
      { pattern: "Confesión", onScreen: "PENSÉ QUE ERA CUENTO", needsMaterial: "Un testimonio real en video" },
      { pattern: "Bastidores", onScreen: "PEDIDOS DE HOY", needsMaterial: "Grabar la bodega con los pedidos" },
    ],
    hookDiagnosis: { archetype: "Problema visible", objection: "¿Se nota bajo la ropa?" },
    recommendedHook: 1,
    aida: {
      attention: "Contradice la creencia: el dolor no es de la silla, es de la postura.",
      interest: "Muestra con un diagrama cómo los hombros hacia adelante cargan el cuello y la espalda alta.",
      desire: "El ajuste cruzado lleva los hombros atrás bajo la ropa, sin que nadie lo note.",
      action: "Pide el pack de 3 al precio de 2 y paga al recibir.",
    },
    objections: [
      { objection: "¿Se nota bajo la ropa?", answer: "Es delgado y se usa bajo una polera o camisa." },
      { objection: "¿Es incómodo?", answer: "Los primeros días úsalo 2 horas; el velcro permite ajustarlo." },
      { objection: "¿Y si no me llega?", answer: "Pagas cuando lo recibes: si no llega, no pagas nada." },
    ],
    offer: "$24.990 (antes $39.990) · Pack de 3 a $49.990 · Paga al recibir",
  },
};

const SECONDARY: AngleBriefView = {
  id: "b2",
  angle: "age_identity",
  name: "9 horas frente al computador",
  frameName: "Edad e identidad",
  slot: 3,
  generation: "succeeded",
  status: "generado",
  createdAt: NOW,
  content: {
    coreMessage: "Quienes pasan 9 horas sentados no están condenados a la espalda cargada.",
    hooks: ["Hecho para quienes pasan 9 horas frente al computador.", "Tengo 38 y nadie me advirtió lo que 10 años de oficina le hacen a la espalda.", "3 errores que comete todo oficinista con su postura."],
    recommendedHook: 0,
    aida: {
      attention: "Filtra por el grupo: oficinistas y quienes trabajan desde casa.",
      interest: "Normaliza: le pasa a todos los que trabajan sentados, no es falta de voluntad.",
      desire: "Se ve firme y seguro en las reuniones otra vez.",
      action: "Pídelo hoy y paga al recibir.",
    },
    objections: [{ objection: "¿Sirve si trabajo desde la casa?", answer: "Sí: se usa igual en el escritorio de la casa o de la oficina." }],
    offer: "$24.990 · Pack de 3 a $49.990 · Paga al recibir",
  },
};

const ENEMY: AngleBriefView = {
  ...PRIMARY,
  id: "b3",
  angle: "common_enemy",
  name: "Adiós a la faja rígida",
  frameName: "Enemigo común",
  slot: 2,
  content: {
    ...PRIMARY.content!,
    coreMessage: "La faja aprieta la cintura; el problema está en los hombros.",
    hooks: ["Una faja aprieta la cintura. Tu espalda se carga en los hombros.", "Guardé 3 fajas en el cajón antes de entender esto.", "Deja de apretar la cintura para arreglar la espalda."],
    recommendedHook: 0,
  },
};

function briefs(state: string): ProductAngles["briefs"] {
  if (state === "developing") return [PRIMARY, { ...ENEMY, generation: "running", content: undefined }, { ...SECONDARY, generation: "running", content: undefined }];
  if (state === "review" || state === "changing") return [{ ...PRIMARY, status: "aprobado" }, ENEMY, SECONDARY];
  if (state === "approved") return [{ ...PRIMARY, status: "aprobado" }, { ...ENEMY, status: "aprobado" }, { ...SECONDARY, status: "aprobado" }];
  if (state === "legacy" || state === "legacy-nodiff") return [{ ...PRIMARY, name: "Mecanismo único", status: "aprobado" }, { ...SECONDARY, name: "Edad e identidad", slot: 2, status: "aprobado" }];
  return [];
}

export function fixture(state: string): ProductAngles {
  const r = ranking(state);
  const b = briefs(state);
  const facts: AngleFacts | null = r
    ? {
        ranking: { status: r.status, error: r.error, confirmed: !!r.chosen, chosen: r.chosen?.length ?? 0 },
        briefs: b.map((x) => ({ slot: x.slot, name: x.name, status: x.status, generation: x.generation })),
      }
    : null;
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    avatar: { status: state === "locked" ? "revision" : "aprobado", createdAt: NOW },
    angles: facts,
     // ?state=ai: sin la clave de Anthropic.
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
      aiConnected: state !== "ai",
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    avatar: { summary: AVATAR.summary, tags: ["30-45 años", "Oficinista", "Santiago y otras ciudades grandes"], approved: state !== "locked" },
    ranking: r,
    briefs: b,
    differentiator:
      state === "nodiff" || state === "legacy-nodiff"
        ? { versus: "una faja o una silla ergonómica", claim: "Lleva los hombros atrás con un ajuste cruzado bajo la ropa", confirmed: false }
        : { versus: "una faja o una silla ergonómica", claim: "Lleva los hombros atrás con un ajuste cruzado bajo la ropa, en vez de apretar la cintura", confirmed: true },
    competitors: 4,
  };
}
