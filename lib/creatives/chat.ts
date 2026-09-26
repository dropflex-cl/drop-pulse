// Creativo «Chat de WhatsApp» (portado de dropflex v1, lib/ai/formats/whatsapp-chat.ts): la captura
// de pantalla de una conversación en la que un amigo le cuenta al lector lo que el producto hizo por
// él, le manda una foto y el lector termina pidiendo el link. Claude escribe la conversación
// (lib/creatives/prompts.ts › chatSystem); el render la hornea entera, con la interfaz de WhatsApp y
// el producto de la foto base dentro de la burbuja de foto. Puro y sin zod: lo usa también el editor
// de la pantalla. El esquema para el modelo está en lib/creatives/schemas.ts › chatOutputSchema.
//
// El prompt de render es AUTOCONTENIDO: sin dirección de arte, porque una captura tiene un solo
// aspecto correcto (la interfaz real) y cualquier estilo es un desvío.

import { promptLimit } from "@/lib/ai/limits";

/** Quién manda la burbuja: el amigo que compró (entrante, a la izquierda) o el lector (saliente, a la derecha). */
export type ChatSender = "friend" | "me";

export interface ChatMessage {
  from: ChatSender;
  /** El texto de la burbuja; en la burbuja de foto, el pie bajo la foto (puede ir vacío). */
  text: string;
  /** La hora impresa en la burbuja, «HH:MM» (24 h). */
  time: string;
  /** true en la ÚNICA burbuja que lleva la foto del producto. */
  photo: boolean;
}

export interface WhatsappChat {
  /** El nombre del amigo en el encabezado; puede terminar en un emoji («Fran 💗»). */
  contact_name: string;
  /** Para la foto de perfil (y el trato: amiga o amigo). */
  contact_gender: "woman" | "man";
  /** La hora de la barra de estado, «HH:MM»: uno o dos minutos después del último mensaje. */
  clock: string;
  messages: ChatMessage[];
}

/** Lo mínimo que cuenta gancho → foto → duda → respuesta → pedido. */
export const CHAT_MIN_MESSAGES = 5;
/**
 * Más que esto no cabe legible en la zona 4:5 del centro de un 9:16 (v1 admitía 8 en un 4:5 completo).
 */
export const CHAT_MAX_MESSAGES = 7;
/** Una burbuja es un mensaje, no un párrafo: ~3 líneas en el teléfono. v1 admitía 160; el QA lee letra por letra. */
export const CHAT_MESSAGE_MAX = 120;
export const CONTACT_NAME_MAX = 24;
/** Lo que pide el prompt (un 10 % menos, lib/ai/limits.ts); el editor y la validación usan los topes de arriba. */
export const CHAT_MESSAGE_PROMPT_MAX = promptLimit(CHAT_MESSAGE_MAX);
export const CONTACT_NAME_PROMPT_MAX = promptLimit(CONTACT_NAME_MAX);

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const isChatTime = (value: string) => TIME_RE.test(value.trim());

/** «9:05» → «09:05»: WhatsApp en 24 h siempre muestra la hora con dos dígitos. */
export const padTime = (value: string) => value.trim().padStart(5, "0");

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Por qué la conversación no se puede generar, o null si se puede. Son las reglas que hacen que la
 * captura se lea como un chat real sobre ESTE producto:
 * - entre CHAT_MIN_MESSAGES y CHAT_MAX_MESSAGES burbujas;
 * - exactamente UNA foto, y la manda el amigo (el producto es lo que él muestra);
 * - hablan los dos y la última palabra es del lector: el pedido del link es el llamado a la acción;
 * - cada burbuja con texto y hora, y las horas no retroceden.
 */
export function chatShapeProblem(chat: WhatsappChat): string | null {
  const { messages } = chat;
  const name = chat.contact_name.trim();
  if (!name) return "Falta el nombre del contacto.";
  if (name.length > CONTACT_NAME_MAX) return `El nombre del contacto admite hasta ${CONTACT_NAME_MAX} caracteres.`;
  if (!isChatTime(chat.clock)) return "La hora del teléfono debe ser HH:MM.";
  if (messages.length < CHAT_MIN_MESSAGES) return `El chat necesita al menos ${CHAT_MIN_MESSAGES} mensajes.`;
  if (messages.length > CHAT_MAX_MESSAGES) return `El chat admite hasta ${CHAT_MAX_MESSAGES} mensajes.`;

  const photos = messages.filter((m) => m.photo);
  if (photos.length !== 1) return "Exactamente un mensaje debe llevar la foto del producto.";
  if (photos[0].from !== "friend") return "La foto del producto la manda tu contacto, no tú.";
  if (!messages.some((m) => m.from === "friend" && !m.photo)) return "Falta al menos un mensaje de tu contacto.";
  if (messages[messages.length - 1].from !== "me") return "El último mensaje debe ser tuyo (el que pide el link).";

  for (const m of messages) {
    if (!m.photo && !m.text.trim()) return "Hay un mensaje vacío.";
    if (m.text.length > CHAT_MESSAGE_MAX) return `Un mensaje pasa de ${CHAT_MESSAGE_MAX} caracteres.`;
    if (!isChatTime(m.time)) return "Cada mensaje necesita una hora HH:MM.";
  }
  for (let i = 1; i < messages.length; i++) {
    if (minutes(messages[i].time) < minutes(messages[i - 1].time)) return "Las horas de los mensajes van de menor a mayor.";
  }
  return null;
}

/** Normaliza lo que llega (del modelo o del editor): espacios, horas con dos dígitos. */
export function normalizeChat(chat: WhatsappChat): WhatsappChat {
  const line = (s: string) => s.replace(/\s+/g, " ").trim();
  return {
    contact_name: line(chat.contact_name),
    contact_gender: chat.contact_gender === "man" ? "man" : "woman",
    clock: isChatTime(chat.clock) ? padTime(chat.clock) : chat.clock.trim(),
    messages: chat.messages.map((m) => ({ from: m.from, text: line(m.text), time: isChatTime(m.time) ? padTime(m.time) : m.time.trim(), photo: Boolean(m.photo) })),
  };
}

/** Los textos que el QA busca en la captura, en orden: el nombre del contacto y cada burbuja con texto. */
export function chatBakedTexts(chat: WhatsappChat): { role: string; text: string }[] {
  return [
    { role: "contact", text: chat.contact_name },
    ...chat.messages.filter((m) => m.text.trim()).map((m) => ({ role: m.photo ? "photo_caption" : m.from === "me" ? "outgoing" : "incoming", text: m.text })),
  ];
}

// ---------------------------------------------------------------- Render

/** Las etiquetas de la interfaz de WhatsApp en el idioma del teléfono. */
function uiLabels(languageCode: string): { online: string; placeholder: string } {
  const base = languageCode.toLowerCase().split(/[-_]/)[0];
  if (base === "pt") return { online: "online", placeholder: "Mensagem" };
  if (base === "en") return { online: "online", placeholder: "Message" };
  return { online: "en línea", placeholder: "Escribe un mensaje" };
}

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

/** Una burbuja como línea de [EXACT TEXT]. */
function bubbleLine(m: ChatMessage, i: number): string {
  const side = m.from === "friend" ? "INCOMING (left, white bubble)" : "OUTGOING (right, light-green bubble, two blue check marks after the time)";
  const body = m.photo ? `PHOTO BUBBLE — the product photo${m.text.trim() ? `, caption below it: ${q(m.text)}` : ", no caption"}` : `text: ${q(m.text)}`;
  return `${i + 1}. ${side} · time ${q(m.time)} · ${body}`;
}

/**
 * El prompt completo de la captura (Higgsfield sin preset o Gemini, con la foto base como referencia).
 * `productLook`: cómo se ve el producto en la foto base (lo describe el generador de conceptos).
 */
export function chatRenderPrompt(chat: WhatsappChat, languageCode: string, productLook?: string): string {
  const ui = uiLabels(languageCode);
  const person = chat.contact_gender === "man" ? "a young man" : "a young woman";
  return [
    "[TASK]",
    "Render a PIXEL-PERFECT, photorealistic smartphone SCREENSHOT of an open WhatsApp conversation (Android phone, WhatsApp LIGHT theme), vertical 9:16.",
    "It must be indistinguishable from a real screenshot a person took on their phone: flat, sharp UI rendering filling the whole canvas edge to edge. No device frame, no hand, no desk, no screen glare, no perspective, no border.",
    "",
    "[UI — reproduce WhatsApp's real interface exactly]",
    `- Status bar (top): the time ${q(chat.clock)} on the left; signal bars, Wi-Fi and a battery icon with a percentage on the right.`,
    `- Chat header (white): back arrow, a small CIRCULAR profile photo, the contact name ${q(chat.contact_name)} in bold, and under it ${q(ui.online)} in small gray text; on the right the video-call, phone and three-dot menu icons.`,
    `- The profile photo is a casual, candid photo of ${person} matching the name (for example at the beach or outdoors), small and slightly soft — an ordinary person, never a celebrity or a recognisable real person.`,
    "- Background: WhatsApp's beige chat wallpaper with its faint doodle pattern.",
    "- Incoming bubbles: WHITE, aligned LEFT, with the small tail on the first bubble of a run. Outgoing bubbles: WhatsApp's LIGHT GREEN, aligned RIGHT, followed by the time and two BLUE check marks (read).",
    "- Every bubble shows its time in small gray text at its bottom-right corner.",
    `- Bottom bar: the emoji icon, a rounded field with the placeholder ${q(ui.placeholder)}, the paperclip and camera icons, and the round GREEN microphone button.`,
    "- Typography: Roboto-like system sans at real phone sizes; bubble text dark gray, left-aligned, wrapping naturally like a real message.",
    "",
    "[THE PHOTO BUBBLE — the product]",
    `- The reference image is the REAL product${productLook?.trim() ? ` (${productLook.trim()})` : ""}. Inside the photo bubble, show it as a casual but well-lit photo taken at home (on a bathroom or bedroom counter, near a window, soft natural light), filling the bubble's rounded image area.`,
    "- The product is LOCKED: reproduce it EXACTLY as in the reference image — same object, shape, colors, label, logo and printed text. Do not redesign, restyle, rename or re-label it. If the reference has promotional clutter (badges, marketplace logos, frames, watermarks), leave it out: only the real product.",
    "",
    "[EXACT TEXT — the conversation, top to bottom]",
    ...chat.messages.map(bubbleLine),
    "",
    "[UNBREAKABLE RULES]",
    "- Render EVERY bubble above, in this order, with its text reproduced EXACTLY character by character (accents and emojis included). Do not add, drop, merge, split, reorder or re-word any message. Do not translate anything.",
    "- No text anywhere other than the WhatsApp UI labels listed above and the messages. No headline, no price, no CTA, no logo, no watermark, no WhatsApp or Meta logo, no brand name that is not printed on the product itself.",
    "- This is ONE screen of the chat, not a scrolled capture. ALL bubbles sit in the central area of the screen, between 15% and 85% of its height, so a 4:5 crop through the center keeps the whole conversation. If space is tight, reduce the photo bubble's height, never the text size.",
  ].join("\n");
}
