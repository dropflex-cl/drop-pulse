import * as z from "zod/v4";
import { defineComponent } from "../define";

/** Tokens que la tienda reemplaza con datos reales (logística y políticas). */
const TOKENS = /\{(min|max|return_days|warranty_months)\}/g;

const noDigits = (field: string) =>
  z.string().refine((s) => !/\d/.test(s.replaceAll(TOKENS, "")), {
    message: `${field}: los plazos y cifras van como {min}, {max}, {return_days} o {warranty_months}, nunca escritos`,
  });

/** Afirmaciones que no se sostienen en una comparación objetiva (Ley 20.169). */
const noSuperlatives = (field: string) =>
  z.string().refine((s) => !/\b(el|la) (mejor|únic[oa])\b|certificad|aprobado por|médic|\bcura\b|corrige/i.test(s), {
    message: `${field}: sin superlativos, certificaciones ni claims de salud`,
  });

const cell = z
  .union([
    z.enum(["yes", "no", "partial"]),
    z.object({ text: noDigits("text").pipe(z.string().min(1).max(18)) }),
  ])
  .describe('"yes" | "no" | "partial" | { text } (≤ 18 con tokens, solo valores cortos; plazos con {min}–{max}).');

export const comparisonTable = defineComponent({
  id: "comparison-table",
  name: "DropFlex · Comparativa",
  kind: "section",
  file: "sections/df-comparison-table.liquid",
  metafield: { namespace: "dropflex", key: "comparison_table", type: "json" },
  media: [],
  placement:
    "Segunda mitad de la landing, después de beneficios y antes de reseñas o FAQ: el comprador ya entendió el producto y piensa «¿no lo encuentro igual o más barato en otro lado?». La tabla responde antes de que salga a comparar.",
  objection: "¿Por qué comprarte a ti y no a otro, o algo genérico más barato?",
  levers: [
    "Contraste y anclaje: al lado de una alternativa con cruces, los checks propios valen más.",
    "Opción dominada (señuelo): nadie elige la columna llena de cruces.",
    "Heurística de conteo: checks contra cruces se leen sin leer; el veredicto es visual e inmediato.",
    "Saliencia (Von Restorff): la columna nuestra es un pilar del color de acento, el ojo va ahí primero.",
    "Enemigo común sin atacar a nadie: «Genéricos» es una categoría, no una marca.",
    "Reducción de riesgo: filas de pago al recibir, envío local y cambios convierten la tabla en un argumento de seguridad.",
    "Credibilidad: un parcial o un «sí» honesto en la competencia hace creíble el resto.",
  ],
  content: z
    .object({
      heading: noSuperlatives("heading").pipe(z.string().min(8).max(40))
        .describe("«[Producto o marca propia] vs. [categoría genérica]» o «¿Por qué elegir [producto]?». Nunca una marca o tienda de terceros."),
      us_label: z.string().min(2).max(18)
        .describe("Nombre corto de nuestra columna: el producto o la tienda («PosturaFit», «Nuestra tienda»)."),
      other_labels: z
        .array(noSuperlatives("other_labels").pipe(z.string().min(3).max(24)))
        .min(1)
        .max(2)
        .describe("1 o 2 categorías genéricas: «Genéricos», «Tiendas internacionales», «Tienda física». NUNCA una marca."),
      rows: z
        .array(
          z.object({
            feature: noDigits("feature").pipe(noSuperlatives("feature")).pipe(z.string().min(3).max(30))
              .describe("Atributo en positivo, 2 a 5 palabras, sin negaciones dobles. Ej.: «Pago al recibir»."),
            us: cell,
            others: z.array(cell).min(1).max(2).describe("Un valor por cada other_labels, en el mismo orden."),
            basis: z.enum(["spec", "policy", "service"])
              .describe("Dato real que sostiene nuestro valor: spec (ficha), policy (políticas), service (atención)."),
          }),
        )
        .min(4)
        .max(7)
        .describe("4 a 7 filas: 2-3 de producto, 2-3 de compra COD (pago al recibir, envío, cambios, soporte), 0-1 de experiencia."),
      footnote: noDigits("footnote").pipe(z.string().min(20).max(140)).optional()
        .describe("A qué se compara, en una frase: «Comparación referencial con correctores genéricos sin tallas»."),
    })
    .superRefine((c, ctx) => {
      c.rows.forEach((row, i) => {
        if (row.others.length !== c.other_labels.length) {
          ctx.addIssue({ code: "custom", path: ["rows", i, "others"], message: "others debe tener un valor por cada other_labels" });
        }
      });
      const othersPositive = c.rows.some((row) => row.others.some((v) => v === "yes" || v === "partial"));
      if (!othersPositive) {
        ctx.addIssue({ code: "custom", path: ["rows"], message: "al menos una fila con «yes» o «partial» en la competencia: una tabla perfecta no es creíble" });
      }
    }),
  realData: [
    "Aprobación humana: la app publica el metafield solo cuando el comerciante aprobó la tabla (approved_by_merchant); la sección no la revalida.",
    "Columna nuestra: cada «yes» corresponde a un hecho de la ficha (basis: spec) o de las políticas reales (basis: policy, shop.metafields.dropflex.policies).",
    "Columna de la competencia: afirmación comparativa sobre una categoría; requiere aprobación explícita del comerciante.",
    "{min} y {max}: días de preparación + tránsito de shop.metafields.dropflex.logistics. {return_days} y {warranty_months}: políticas. Una fila con un token sin dato no se muestra.",
    "Logo de nuestra columna: ajuste del editor (imagen), nunca de la IA.",
  ],
  rules: [
    "Tuteo, directo y sin agresividad. Español neutro.",
    "Competidores solo como categorías genéricas («Genéricos», «Otros correctores», «Tiendas internacionales», «Marketplaces»).",
    "Filas cortas (≤ 30 caracteres) en positivo; mezcla producto y compra COD; la más fuerte primero.",
    "Al menos una fila donde la competencia tenga «yes» o «partial» si es cierto: 5-1 es más creíble que 6-0.",
    "Si una diferencia no se puede sostener a nivel de categoría, «partial» o se elimina la fila.",
    "Valores de texto solo para datos cortos (≤ 18 con los tokens); plazos siempre como {min}–{max}.",
  ],
  forbidden: [
    "Nombrar marcas, tiendas o marketplaces de terceros (Ley 19.496 art. 28; Ley 20.169, comparación no objetiva o denigrante).",
    "«El mejor», «el único», «certificado», «aprobado por médicos».",
    "Claims de salud («corrige tu columna», «alivia el dolor»).",
    "Cifras escritas («+10.000 clientes», «15–30 días»): los plazos son tokens y el resto no se afirma.",
    "Afirmar que la competencia vende falsificaciones o productos inseguros.",
  ],
  examples: [
    {
      heading: "PosturaFit vs. genéricos",
      us_label: "PosturaFit",
      other_labels: ["Genéricos"],
      rows: [
        { feature: "Correas ajustables", us: "yes", others: ["partial"], basis: "spec" },
        { feature: "Tela respirable", us: "yes", others: ["partial"], basis: "spec" },
        { feature: "Tallas de S a XL", us: "yes", others: ["no"], basis: "spec" },
        { feature: "Pago al recibir", us: "yes", others: ["no"], basis: "policy" },
        { feature: "Atención en español", us: "yes", others: ["no"], basis: "service" },
      ],
      footnote: "Comparación referencial con correctores genéricos sin tallas de marketplaces internacionales.",
    },
    {
      heading: "¿Dónde te conviene comprarlo?",
      us_label: "Nuestra tienda",
      other_labels: ["Tiendas internacionales", "Tienda física"],
      rows: [
        { feature: "Tiempo de entrega", us: { text: "{min}–{max} días" }, others: ["partial", "yes"], basis: "policy" },
        { feature: "Pagas al recibir", us: "yes", others: ["no", "yes"], basis: "policy" },
        { feature: "Envío a domicilio", us: "yes", others: ["yes", "no"], basis: "policy" },
        { feature: "Cambio si no te queda", us: "yes", others: ["partial", "yes"], basis: "policy" },
      ],
    },
  ],
});
