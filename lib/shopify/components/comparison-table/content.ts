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

/**
 * ¿La columna es un canal o una tienda («Tiendas internacionales», «Tienda física», «Marketplaces»)
 * y no una categoría de producto («Crema más espesa»)? Las filas de compra (pago al recibir, envío,
 * cambios) solo tienen sentido contra canales. Puro.
 */
export function isChannelLabel(label: string): boolean {
  return /\b(tiendas?|multitiendas?|marketplaces?|internacional(es)?|f[ií]sicas?|online|en l[ií]nea|retail|supermercados?|farmacias?|malls?|ferias?|comercios?|sitios? web|p[aá]ginas? web|importad[oa]s?)\b/i.test(label);
}

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
    "Diferencia frente a lo que ya probó: la columna rival es lo que el cliente ya usa («Crema más espesa», «Colágeno para tomar»), así la tabla explica por qué esto es distinto y vale lo que cuesta.",
    "Enemigo común sin atacar a nadie: la alternativa es una categoría, no una marca.",
    "Valor antes que servicio: las filas de producto van primero; el pago al recibir y el envío ya los dicen los componentes de compra.",
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
        .describe("1 o 2 columnas: lo que el cliente ya probó (alternatives_already_tried: «Crema más espesa», «Colágeno para tomar»); «Genéricos» solo si no hay una alternativa previa clara; canales («Tiendas internacionales», «Tienda física») solo en una tabla de dónde comprar. NUNCA una marca."),
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
        .max(6)
        .describe("4 a 6 filas: al menos 3 de producto (basis spec: qué hace, dónde actúa, cómo entra en la rutina) y primero. Filas de compra (policy o service: pago al recibir, envío, cambios) solo si las otras columnas son canales o tiendas."),
      footnote: noDigits("footnote").pipe(z.string().min(20).max(140)).optional()
        .describe("A qué se compara, en una frase: «Comparación referencial con correctores genéricos sin tallas»."),
    })
    .superRefine((c, ctx) => {
      c.rows.forEach((row, i) => {
        if (row.others.length !== c.other_labels.length) {
          ctx.addIssue({ code: "custom", path: ["rows", i, "others"], message: "others debe tener un valor por cada other_labels" });
        }
      });
      const specs = c.rows.filter((row) => row.basis === "spec").length;
      if (specs < 3) {
        ctx.addIssue({ code: "custom", path: ["rows"], message: "al menos 3 filas de producto (basis spec): la tabla muestra el valor del producto, no el servicio" });
      }
      const firstOther = c.rows.findIndex((row) => row.basis !== "spec");
      if (firstOther >= 0 && c.rows.slice(firstOther).some((row) => row.basis === "spec")) {
        ctx.addIssue({ code: "custom", path: ["rows"], message: "las filas de producto (basis spec) van primero, antes de las de compra" });
      }
      const purchase = c.rows.some((row) => row.basis !== "spec");
      const notChannels = c.other_labels.filter((l) => !isChannelLabel(l));
      if (purchase && notChannels.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rows"],
          message: `filas de compra (policy o service) solo contra canales o tiendas; «${notChannels.join("», «")}» es una categoría de producto: deja solo filas de producto`,
        });
      }
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
    "Contra qué: other_labels son lo que el cliente ya probó (alternatives_already_tried del producto o el enemigo del ángulo «Enemigo común»), como categorías: «Crema más espesa», «Colágeno para tomar». «Genéricos» solo si no hay una alternativa previa clara.",
    "Filas: de 4 a 6, cortas (≤ 30 caracteres) y en positivo. Al menos 3 de producto (basis spec: qué hace, dónde actúa, cómo entra en la rutina) y van primero; la más fuerte arriba.",
    "Filas de compra (basis policy o service: pago al recibir, envío, cambios, soporte) solo cuando las otras columnas son canales o tiendas («Tiendas internacionales», «Tienda física», «Marketplaces»). Contra una categoría de producto no se escriben: el pago al recibir no es una diferencia con «Crema más espesa».",
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
    "Filas de pago al recibir, envío o cambios contra una categoría de producto («Pago al recibir: parcial» para «Crema más espesa»).",
  ],
  examples: [
    {
      heading: "Deep Collagen vs. lo que ya probaste",
      us_label: "Deep Collagen",
      other_labels: ["Crema más espesa", "Colágeno para tomar"],
      rows: [
        { feature: "Colágeno y péptidos en gotas", us: "yes", others: ["partial", "partial"], basis: "spec" },
        { feature: "Actúa sobre la piel", us: "yes", others: ["yes", "no"], basis: "spec" },
        { feature: "Textura ligera, sin pesar", us: "yes", others: ["no", { text: "No aplica" }], basis: "spec" },
        { feature: "Se suma a tu crema de siempre", us: "yes", others: ["no", "yes"], basis: "spec" },
        { feature: "Se absorbe en segundos", us: "yes", others: ["partial", { text: "No aplica" }], basis: "spec" },
      ],
      footnote: "Comparación referencial con cremas hidratantes espesas y colágeno bebible en general.",
    },
    {
      heading: "¿Dónde te conviene comprarlo?",
      us_label: "Nuestra tienda",
      other_labels: ["Tiendas internacionales", "Tienda física"],
      rows: [
        { feature: "Tallas de S a XL", us: "yes", others: ["partial", "partial"], basis: "spec" },
        { feature: "Correas ajustables", us: "yes", others: ["yes", "yes"], basis: "spec" },
        { feature: "Tela respirable", us: "yes", others: ["partial", "partial"], basis: "spec" },
        { feature: "Pagas al recibir", us: "yes", others: ["no", "yes"], basis: "policy" },
        { feature: "Tiempo de entrega", us: { text: "{min}–{max} días" }, others: ["partial", "yes"], basis: "policy" },
        { feature: "Cambio si no te queda", us: "yes", others: ["partial", "yes"], basis: "policy" },
      ],
    },
  ],
});
