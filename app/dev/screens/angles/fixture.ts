// Datos de ejemplo para /dev/screens/angles (textos de design-system/reference/bundle.js: ANG, SUG, DEV,
// con las 6 formas del orquestador y los ángulos de testeo de docs/spec-angulos-testeo.md). No se usan
// fuera de desarrollo.
import { productImage } from "@/lib/mock/images";
import { productPosition, type AngleFacts } from "@/lib/products/stages";
import type { AngleBriefView, AngleCandidateView, AngleOption, AngleRankingView, ProductAngles, TestAngleView } from "@/lib/types";
import { AVATAR } from "../base/fixture";

const NOW = "2026-09-24T12:00:00Z";

const ANGLES: AngleOption[] = [
  {
    angle: "unique_mechanism",
    name: "Mecanismo único",
    rank: 1,
    score: 84,
    why: "Tu cliente ideal cree que el dolor es de la silla: el ajuste cruzado que lleva los hombros atrás es un «no es la silla, es cómo te sientas» fácil de mostrar.",
    risks: [],
    breakdown: [
      { label: "Se explica en una frase", value: 34 },
      { label: "Las alternativas atacan otra causa", value: 30 },
      { label: "Se puede mostrar en un diagrama", value: 20 },
    ],
  },
  {
    angle: "age_identity",
    name: "Edad e identidad",
    rank: 2,
    score: 71,
    why: "Oficinistas de 30 a 45 que pasan 9 horas sentados se reconocen en una línea, y el vocero puede ser uno de ellos.",
    risks: [{ text: "Evita «¿te duele la espalda?»: habla del grupo, no del espectador" }],
    breakdown: [
      { label: "Problema típico de una etapa o rol", value: 34 },
      { label: "Audiencia estrecha que se reconoce", value: 23 },
      { label: "El vocero puede ser uno de ellos", value: 14 },
    ],
  },
  {
    angle: "common_enemy",
    name: "Enemigo común",
    rank: 3,
    score: 62,
    why: "Ya probó fajas rígidas y sillas «ergonómicas» que no sirvieron; se puede atacar la práctica, no una marca.",
    risks: [],
    breakdown: [
      { label: "Hay una solución popular que falló", value: 26 },
      { label: "El comprador ya vio muchas promesas", value: 23 },
      { label: "Se ataca una práctica, no una marca", value: 13 },
    ],
  },
  {
    angle: "offer",
    name: "Oferta",
    rank: 4,
    score: 55,
    why: "El pack de 3 al precio de 2 es claro, aunque para un dolor diario la oferta funciona mejor como capa que como gancho.",
    risks: [{ text: "Sin una fecha comercial real, la urgencia se lee como falsa" }],
    breakdown: [
      { label: "Precio bajo para su mercado y pack posible", value: 30 },
      { label: "Impulso, consumible o con variantes", value: 10 },
      { label: "Se entiende sin explicación", value: 15 },
      { label: "Hay una fecha comercial real", value: 0 },
    ],
  },
  {
    angle: "personal_story",
    name: "Historia personal",
    rank: 5,
    score: 25,
    why: "Funcionaría muy bien con un antes y después real, pero hoy no hay reseñas de clientes.",
    risks: [{ text: "No hay testimonios reales", penalty: 40, fix: "reviews" }],
    breakdown: [
      { label: "Hay reseñas reales con historia", value: 0 },
      { label: "El problema tiene carga emocional", value: 27 },
      { label: "Compra que necesita convencer", value: 13 },
      { label: "No hay testimonios reales", value: -40 },
    ],
  },
  {
    angle: "authority",
    name: "Autoridad (experto)",
    rank: 6,
    score: 21,
    why: "Un kinesiólogo le daría credibilidad, pero no hay uno real que lo recomiende.",
    risks: [{ text: "No hay experto real", penalty: 40, fix: "expert" }],
    breakdown: [
      { label: "Problema de un profesional reconocible", value: 38 },
      { label: "Es lo que el experto usaría", value: 23 },
      { label: "Hay un experto real", value: 0 },
      { label: "No hay experto real", value: -40 },
    ],
  },
];

const CANDIDATES: AngleCandidateView[] = [
  {
    index: 0,
    title: "No es la silla",
    painOrDesire: "La espalda cargada a las 4 de la tarde aunque la silla sea buena",
    segment: "Quien ya cambió de silla y sigue con dolor",
    promise: "Los hombros vuelven atrás sin pensar en la postura",
    frame: "unique_mechanism",
    frameName: "Mecanismo único",
    triggerMoment: "Estirarse en la silla a media tarde con el cuello tenso",
    competition: "Las 4 tiendas venden «postura perfecta»; ninguna habla de la causa.",
    competitorsUsing: 0,
    score: 94,
    frameScore: 84,
    competitionDelta: 10,
  },
  {
    index: 1,
    title: "9 horas frente al computador",
    painOrDesire: "Terminar la jornada encorvado y con los hombros adelante",
    segment: "Oficinistas de 30 a 45 que trabajan sentados",
    promise: "Verse firme en las reuniones otra vez",
    frame: "age_identity",
    frameName: "Edad e identidad",
    triggerMoment: "Verse encorvado en la cámara de una videollamada",
    competition: "Una tienda habla de oficinistas, sin vocero del grupo.",
    competitorsUsing: 1,
    score: 71,
    frameScore: 71,
    competitionDelta: 0,
  },
  {
    index: 2,
    title: "Adiós a la faja rígida",
    painOrDesire: "Probó fajas que aprietan la cintura y no cambiaron nada",
    segment: "Quien ya compró una faja y la dejó en el cajón",
    promise: "Sostiene los hombros, no la cintura",
    frame: "common_enemy",
    frameName: "Enemigo común",
    triggerMoment: "Sacar la faja del cajón y volver a guardarla",
    competition: "Nadie ataca la faja: todos la venden como alternativa.",
    competitorsUsing: 0,
    score: 72,
    frameScore: 62,
    competitionDelta: 10,
  },
  {
    index: 3,
    title: "Uno para la casa y otro para la oficina",
    painOrDesire: "Olvidarlo en la casa justo el día que más lo necesita",
    segment: "Quien trabaja híbrido",
    promise: "Siempre a mano, en los dos lugares",
    frame: "offer",
    frameName: "Oferta",
    triggerMoment: "Llegar a la oficina y darse cuenta de que lo dejó",
    competition: "3 tiendas empujan el 2x1 como gancho principal.",
    competitorsUsing: 3,
    score: 40,
    frameScore: 55,
    competitionDelta: -15,
  },
  {
    index: 4,
    title: "Lo que usa un kinesiólogo",
    painOrDesire: "Querer una recomendación de alguien que sepa",
    segment: "Quien desconfía de lo que ve en anuncios",
    promise: "La misma idea que te daría un profesional",
    frame: "authority",
    frameName: "Autoridad (experto)",
    triggerMoment: "Buscar en Google «postura correcta oficina»",
    competition: "Ninguna tienda tiene un experto real.",
    competitorsUsing: 0,
    score: 31,
    frameScore: 21,
    competitionDelta: 10,
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
});

function ranking(state: string): AngleRankingView | undefined {
  if (state === "start" || state === "locked" || state === "nodiff") return undefined;
  const ready = state !== "evaluating" && state !== "failed";
  const base: AngleRankingView = {
    id: "rk1",
    status: state === "evaluating" ? "running" : state === "failed" ? "failed" : "succeeded",
    error: state === "failed" ? "La IA no respondió. Intenta de nuevo en un momento." : undefined,
    createdAt: NOW,
    angles: ready ? ANGLES : [],
    candidates: ready ? CANDIDATES : [],
    suggested: ready ? [0, 2, 1] : [],
    competitors: 4,
    missing: [
      { text: "Reseñas reales: subirían Historia personal hasta ~70", fix: "reviews" },
      { text: "Una fecha comercial real (CyberDay, Día del Padre): subiría Oferta" },
    ],
    avatarChanged: false,
  };
  if (state === "legacy") return { ...base, candidates: [], suggested: [], chosen: [chosenOf({ ...CANDIDATES[0], title: "" }, 1), chosenOf({ ...CANDIDATES[1], title: "" }, 2)].map((a) => ({ ...a, name: a.frameName })), confirmedAt: NOW };
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
      "Tu silla no es el problema: es cómo te sientas.",
      "¿Por qué te duele la espalda a las 4 de la tarde aunque tu silla sea buena?",
      "Una faja aprieta la cintura. Esto lleva los hombros hacia atrás.",
      "Enderezarse no dura 10 minutos si nada sostiene los hombros.",
      "Esto es lo que le pasa a tu espalda después de 3 horas frente al computador.",
      "Dolor de hombros, cuello cargado y espalda encorvada: es el mismo problema.",
      "No necesitas una silla de $300.000. Necesitas que tus hombros no se vayan hacia adelante.",
    ],
    recommendedHook: 0,
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
  if (state === "legacy") return [{ ...PRIMARY, name: "Mecanismo único", status: "aprobado" }, { ...SECONDARY, name: "Edad e identidad", slot: 2, status: "aprobado" }];
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
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    avatar: { summary: AVATAR.summary, tags: ["30-45 años", "Oficinista", "Santiago y otras ciudades grandes"], approved: state !== "locked" },
    ranking: r,
    briefs: b,
    differentiator:
      state === "nodiff"
        ? { versus: "una faja o una silla ergonómica", claim: "Lleva los hombros atrás con un ajuste cruzado bajo la ropa", confirmed: false }
        : { versus: "una faja o una silla ergonómica", claim: "Lleva los hombros atrás con un ajuste cruzado bajo la ropa, en vez de apretar la cintura", confirmed: true },
    competitors: 4,
  };
}
