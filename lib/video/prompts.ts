// Revisión visual opcional de keyframes UGC. Los guiones y planes se reciben desde el chat.

import { type VideoFormat } from "./catalog";

export const KEYFRAME_QA_SYSTEM = [
  "Eres el control de calidad de imágenes generadas con IA para un video UGC. Recibes, en orden: la foto real del producto (si la escena lo muestra), la imagen del personaje (si la escena tiene a la persona y no es el personaje mismo) y la imagen generada.",
  "- hands_ok: cuenta las manos y los dedos. Una mano de más, una mano sin brazo, dedos fusionados o de más: false.",
  "- product_ok: solo si se pidió el producto. Igual a la foto real: forma, colores, tapa, etiqueta legible y sin textos inventados. null si no se pidió.",
  "- same_person: solo si hay imagen del personaje. La misma cara y pelo (la ropa o el peinado pueden cambiar si la escena lo pide). null si no aplica.",
  "- no_text: false si hay subtítulos, textos, marcas de agua o logos que no son la etiqueta real del producto.",
  "- brand_safe: false si el personaje, un objeto o una pose puede leerse como genitales o algo sexual o sugerente (por ejemplo, un cuerpo alargado o liso color piel con la punta redondeada, o un bulto sobre un cuello más angosto): Meta rechaza esos anuncios por contenido adulto. Míralo como un revisor de Meta que ve la imagen un segundo. Ante la duda, false.",
  "- matches_hook: solo si se indica que es la imagen de la apertura. true si muestra lo que pide la primera toma del gancho, con la acción ya en marcha; false si muestra otra cosa o está quieta y vacía. null si no es la apertura.",
  "- phone_look: solo en el video con una persona. true si parece una foto tomada con un teléfono en una casa (luz de la casa, todo en foco, fondo con cosas); false si parece de estudio, de campaña o de banco de imágenes (luz de estudio, fondo desenfocado, piel perfecta, todo ordenado). null en la animación.",
  "- issues: cada problema en una frase corta en español para el comerciante. Sé estricto con las manos.",
].join("\n");

export function keyframeQaUser(
  k: { key: string; prompt: string; uses_product: boolean },
  hasCharacterRef: boolean,
  format: VideoFormat = "ugc",
  opening?: { first_motion: string; hook?: string } | null,
): string {
  return [
    `IMAGEN CLAVE ${k.key}`,
    `Se pidió: ${k.prompt}`,
    ...(opening
      ? [`Es la imagen de la APERTURA (el cuadro 0 del video). La primera toma del gancho: ${opening.first_motion}${opening.hook ? ` Lo que se dice encima: «${opening.hook}».` : ""} Revisa matches_hook.`]
      : ["No es la apertura: matches_hook = null."]),
    format === "mascot" ? "Es una animación: phone_look = null." : "Es el video con persona: revisa phone_look.",
    ...(format === "mascot"
      ? [
          "Es una animación 3D con un personaje de caricatura: sus manos pueden tener cuatro o cinco dedos (hands_ok false solo si hay brazos o manos de más o deformes). same_person compara el MISMO personaje (cara, ojos, cejas, forma); su estado puede cambiar (enfermo, sano). El producto no lleva cara ni brazos.",
        ]
      : []),
    k.uses_product ? "La escena muestra el producto." : "La escena NO muestra el producto: product_ok = null.",
    hasCharacterRef ? "Hay imagen del personaje: compara la cara." : "No hay imagen del personaje: same_person = null.",
    "",
    "Revisa la imagen generada (la última).",
  ].join("\n");
}
