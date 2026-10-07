import * as z from "zod/v4";

// Contrato persistido de etiquetas; las propuestas llegan desde el chat.
const text = z.string();
const maybe = z.string().nullable();

export const PACK_LABEL_BASES = ["duration", "sharing", "spare", "gift", "savings", "other"] as const;

export const packLabelSchema = z.object({
  units: z.number().int().describe("Unidades del pack (1, 2 o 3), igual que en PRECIO Y OFERTA."),
  label: text.describe("El nombre del pack que lee el cliente, idealmente hasta 40 caracteres (cuéntalos; si pasa, acórtalo tú en vez de dejarlo a medias): «2 meses de uso», «Uno para ti y otro para tu pareja». Sin promesas de salud ni resultados."),
  support: maybe.describe("Línea de apoyo corta con una cifra real de PRECIO Y OFERTA («$17.495 al mes», «Ahorras $24.980»), o null."),
  badge: maybe.describe("Distintivo de 1 a 2 palabras solo para 1 pack («Más elegido», «Mejor precio»), o null."),
  basis: z.enum(PACK_LABEL_BASES).describe("En qué se apoya: duración real, compartir, repuesto, regalo, ahorro u otro."),
  reason: text.describe("Para el comerciante, en una frase: por qué esta etiqueta y de qué dato sale."),
});

export const packLabelsSchema = z.array(packLabelSchema).describe("Una etiqueta por pack de PRECIO Y OFERTA, en el mismo orden.");

export type PackLabel = z.infer<typeof packLabelSchema>;

