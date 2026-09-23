// Datos de ejemplo para /dev/screens/base (textos e imágenes de design-system/reference/bundle.js:
// PP_TEXT, ppRefs). No se usan fuera de desarrollo.
import type { CustomerAvatar } from "@/lib/ai/schemas";
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { AvatarProposal, OptimizationRun, ProductBase } from "@/lib/types";

export const PP_TEXT =
  "Corrector Postura Espalda Ajustable Unisex. Material: neopreno + velcro. Talla única, ajustable hasta 110 cm de pecho. Ayuda a mantener la espalda recta y reduce la tensión en hombros. Se usa debajo de la ropa. Clientes preguntan si sirve para trabajar sentado 8 horas: sí, recomendado 2 a 3 horas al día al inicio.";

export const AVATAR: CustomerAvatar = {
  name: "Andrés",
  summary: "Andrés, 38, analista contable en Santiago que pasa 9 horas sentado frente al computador y llega a casa con la espalda cargada.",
  demographics: { age_range: "30-45", gender: "male", location: "Santiago y otras ciudades grandes", socioeconomic_level: "Medio", occupation_or_role: "Oficinista" },
  awareness_level: "problem_aware",
  awareness_reason: "Siente el dolor todos los días, pero cree que es normal del trabajo y no conoce soluciones que no le quiten tiempo.",
  market_sophistication: 3,
  sophistication_reason: "Ya vio fajas y correctores que prometen “postura perfecta”; la promesa directa ya no le basta.",
  identity: {
    current_identity: "Se ve como alguien responsable pero cansado, que dejó su cuerpo para después.",
    desired_identity: "Quiere verse firme y seguro, alguien que se cuida sin complicarse.",
    lifestyle: "Oficina de lunes a viernes, poco movimiento, pantallas también en la noche.",
  },
  priorities: {
    primary_focus: "Terminar el día sin dolor de espalda alta y cuello.",
    secondary_priorities: "No sumar rutinas nuevas ni gastar en sesiones de kinesiología.",
    long_term_outcome: "Llegar bien a los 50, sin una lesión que lo frene.",
    immediate_outcome: "Sentarse derecho una tarde completa sin pensar en eso.",
  },
  problems: {
    main_problem: "Se encorva frente al computador y a media tarde le duelen los hombros.",
    underlying_problem: "Ya no confía en su cuerpo: enderezarse le cuesta y siente que se está poniendo viejo antes de tiempo.",
    current_frustration: "Sabe cómo debería sentarse, pero a los diez minutos vuelve a encorvarse.",
    trigger_moments: [
      "A las 4 de la tarde, cuando se da cuenta de que lleva una hora encorvado sobre el teclado",
      "Al verse de lado en el reflejo de la ventana de la micro",
      "Cuando se levanta del escritorio y tiene que estirar la espalda con las dos manos",
    ],
  },
  emotions: {
    fears: "Terminar con una lesión que lo obligue a faltar al trabajo.",
    secret_desires: "Verse más alto y seguro en las reuniones.",
    core_motivation: "Recuperar el control de su cuerpo sin sacrificar tiempo.",
  },
  objections: {
    critical_question: "¿Esto se nota debajo de la camisa?",
    main_objection: "Cree que estos correctores son incómodos y terminan en un cajón.",
    common_excuses: "“Es el estrés, ya se me va a pasar.”",
    cash_on_delivery_concerns: "Desconfía de las tiendas de Instagram; pagar cuando le llega le quita el miedo a que no llegue.",
  },
  enemies: { external_enemy: "Las sillas de la oficina y las jornadas eternas.", internal_enemy: "La costumbre de dejarse para después." },
  vision: { future_vision: "Llega a la casa con energía para jugar con su hijo, sin la espalda cargada.", number_one: "Vivir sin dolor de espalda." },
  voice_of_customer: ["Llego a la casa con la espalda molida", "Me enderezo y a los cinco minutos estoy igual", "No tengo tiempo para ir al kine"],
  formula:
    "El nombre de mi cliente ideal es Andrés. Andrés es un oficinista responsable que vive una rutina sedentaria y exigente, y sueña con ser alguien firme y seguro en su propio cuerpo. Actualmente se enfoca en terminar el día sin dolor, aunque también prioriza no sumar rutinas nuevas…",
};

export function fixture(state: string): ProductBase {
  const now = "2026-09-24T12:00:00Z";
  const run: OptimizationRun | undefined =
    state === "optimizing"
      ? { id: "r1", status: "running", step: "customer_avatar", createdAt: now, startedAt: now }
      : state === "failed"
        ? { id: "r1", status: "failed", step: "product_brief", error: "La IA no respondió. Intenta de nuevo en un momento.", createdAt: now }
        : state === "review" || state === "approved"
          ? { id: "r1", status: "succeeded", step: "customer_avatar", createdAt: now }
          : undefined;
  const avatar: AvatarProposal | undefined =
    state === "review" || state === "approved"
      ? { id: "a1", status: state === "approved" ? "aprobado" : "generado", avatar: AVATAR, createdAt: "2026-09-24T12:01:00Z" }
      : undefined;
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    run: run ? { status: run.status, error: run.error, createdAt: run.createdAt } : null,
    avatar: avatar ? { status: avatar.status, createdAt: avatar.createdAt } : null,
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
    baseInfo: PP_TEXT,
    fromShopify: true,
    images: [
      { id: "i1", src: productImage(1, 1), alt: "Imagen 1 de Shopify", source: "shopify", excluded: false, cover: true, base: false },
      { id: "i2", src: productImage(5, 1), alt: "Imagen 2 de Shopify", source: "shopify", excluded: false, cover: false, base: false },
      { id: "i3", src: productImage(0, 1), alt: "Imagen 3 de Shopify, con texto del proveedor", source: "shopify", excluded: true, cover: false, base: false },
    ],
    run,
    pricingDefaults: { unitCost: 7000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, extraUnitDiscount: 35 },
    avatar,
    missingInputs:
      state === "review"
        ? [
            { field: "proof.guarantee_days", question: "¿Das garantía? ¿De cuántos días?" },
            { field: "proof.real_reviews", question: "¿Tienes reseñas de clientes que puedas pegar tal cual?" },
          ]
        : [],
  };
}
