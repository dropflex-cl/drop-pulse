import * as z from "zod/v4";
import { defineComponent, ICON_KEYS } from "../define";

const noDigits = (field: string, allow: RegExp = /$^/g) =>
  z.string().refine((s) => !/\d/.test(s.replaceAll(allow, "")), {
    message: `${field}: sin números escritos; medidas y cifras van en la ficha del producto`,
  });
const noEndPunctuation = (s: string) => !/[.!]$/.test(s.trim());

const benefit = z.object({
  icon: z.enum(ICON_KEYS).describe("Ícono del eje del beneficio: target (función), hand (comodidad), feather o leaf (material), clock (facilidad), globe (versatilidad), droplet (cuidado)…"),
  title: noDigits("title")
    .pipe(z.string().min(4).max(24))
    .refine(noEndPunctuation, { message: "Sin punto final" })
    .describe("2 o 3 palabras, sustantivo + adjetivo concreto. Ej.: «Tela respirable»."),
  body: noDigits("body")
    .pipe(z.string().min(40).max(110))
    .describe("Una oración: característica real → beneficio en tu día a día, con el momento de uso cuando aplique. Tuteo."),
});

export const imageWithBenefits = defineComponent({
  id: "image-with-benefits",
  name: "DropFlex · Foto y razones",
  kind: "section",
  file: "sections/df-image-with-benefits.liquid",
  metafield: { namespace: "dropflex", key: "image_with_benefits", type: "json" },
  media: [
    {
      key: "image_with_benefits_image",
      type: "file_reference",
      source: "La «Foto central» elegida en la etapa Página del producto (Información base o Imágenes). Sin ella, la foto destacada del producto.",
    },
  ],
  imageSlots: [
    { key: "main", label: "Foto central", min: 0, max: 1, ratio: "1:1", hint: "El producto solo, idealmente sin fondo. Sin elegir, va la foto principal del producto." },
  ],
  placement:
    "Mitad de la landing, después del hero y la primera prueba social y antes de la comparativa o las preguntas: el comprador ya sabe qué es y ahora busca por qué es mejor.",
  objection: "¿Qué tiene de especial? ¿Vale lo que cuesta?",
  levers: [
    "Mapa mental del producto: foto + beneficios alrededor se leen como un diagrama técnico y se recuerdan mejor que texto solo.",
    "Valor por acumulación: 4 o 6 razones distintas justifican el precio.",
    "Fluidez cognitiva: basta leer los títulos (≈ 100 caracteres en total) para captar el argumento.",
    "Pregunta retórica en el título («¿Por qué …?»): abre curiosidad y la sección la responde.",
  ],
  content: z.object({
    heading: noDigits("heading", /\{count\}/g)
      .pipe(z.string().min(8).max(40))
      .describe("«¿Por qué [marca o producto]?» o «{count} razones para elegirlo» ({count} = cantidad real de beneficios, la pone la tienda)."),
    benefits: z
      .array(benefit)
      .min(4)
      .max(6)
      .refine((list) => list.length % 2 === 0, { message: "4 o 6 beneficios: se reparten mitad a cada lado de la foto" })
      .describe("4 o 6 beneficios, cada uno de un eje distinto: función principal, comodidad, material, facilidad de uso, versatilidad, cuidado o durabilidad."),
  }),
  realData: [
    "Foto central: ajuste del editor o la foto destacada del producto (idealmente sin fondo). Nunca un render con características que el producto no tiene.",
    "Materiales, tallas, medidas y cuidados que se mencionen: solo si están en la ficha del producto; las cifras exactas quedan en la ficha, no aquí.",
    "{count}: la cantidad de beneficios que se muestran.",
  ],
  rules: [
    "Cada beneficio cubre un eje distinto; no repetir la misma idea con otras palabras.",
    "Título: 2 o 3 palabras, sustantivo + adjetivo concreto, sin punto final.",
    "Texto: una oración de 40 a 110 caracteres, característica real → beneficio en tu día, mencionando el momento de uso cuando aplique.",
    "Tono claro, cálido y concreto; tuteo; nada de relleno («de la más alta calidad»).",
  ],
  forbidden: [
    "Superlativos («el mejor del mundo»), porcentajes y «garantizado» sin remitir a la garantía real.",
    "Claims de salud o terapéuticos: «alivia dolores», «corrige la columna», «previene hernias» (Ley 19.496, art. 28; sin registro ISP).",
    "«Aprobado por especialistas» y certificaciones sin respaldo.",
    "Características que no están en la ficha del producto.",
  ],
  examples: [
    {
      heading: "¿Por qué PosturaFit?",
      benefits: [
        { icon: "target", title: "Recordatorio constante", body: "Lleva tus hombros suavemente hacia atrás para que notes cuando te encorvas." },
        { icon: "ruler", title: "Ajuste a tu medida", body: "Correas con velcro que regulas en segundos según tu contorno y tu comodidad." },
        { icon: "feather", title: "Tela respirable", body: "Material liviano que deja pasar el aire, pensado para usarlo varias horas al día." },
        { icon: "eye", title: "Discreto bajo la ropa", body: "Su perfil delgado se oculta bajo una polera o camisa, en la oficina o en clases." },
        { icon: "clock", title: "Listo en segundos", body: "Te lo pones como una mochila, sin ayuda y sin pasos complicados." },
        { icon: "droplet", title: "Fácil de cuidar", body: "Se lava a mano con agua fría y se seca rápido para usarlo al día siguiente." },
      ],
    },
    {
      heading: "{count} razones para elegirlo",
      benefits: [
        { icon: "target", title: "Mejor hábito postural", body: "Te ayuda a tomar conciencia de tu postura mientras trabajas frente al computador." },
        { icon: "feather", title: "Liviano y cómodo", body: "Pesa muy poco y sus bordes acolchados no rozan las axilas durante el día." },
        { icon: "ruler", title: "Tallas S a XL", body: "Elige tu talla con la guía de medidas y ajusta el resto con las correas." },
        { icon: "shield", title: "Compra protegida", body: "Pagas al recibirlo en tu casa y tienes la garantía legal si llega con fallas." },
      ],
    },
  ],
});
