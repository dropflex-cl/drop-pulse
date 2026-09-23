import "server-only";
import type { MetaAssets, MetaOption } from "@/lib/onboarding/types";
import { graphList } from "./client";

// Cuentas publicitarias, páginas y píxeles para O7 (spec §6.4). Se consulta todo con el token del
// usuario, paginado, y la selección se valida contra esta misma consulta al guardar (falla 18).

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  /** El número sin `act_`, como lo muestra el Administrador de anuncios. */
  account_id?: string;
  timezone_name?: string;
  /** Gasto histórico en la unidad mínima de la moneda (ver CURRENCY_OFFSET). */
  amount_spent?: string;
  business?: { id: string; name: string };
}
interface Page {
  id: string;
  name: string;
  category?: string;
  username?: string;
}
interface Pixel {
  id: string;
  name: string;
  last_fired_time?: string;
  creation_time?: string;
  owner_business?: { id: string; name: string };
}

const ACCOUNT_FIELDS = "id,name,account_status,currency,account_id,timezone_name,amount_spent,business{id,name}";
const PAGE_FIELDS = "id,name,category,username";
const PIXEL_FIELDS = "id,name,last_fired_time,creation_time,owner_business{id,name}";

// Meta expresa los montos en la unidad mínima; estas monedas no tienen decimales (offset 1).
const NO_DECIMALS = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export function formatSpent(amount: string | undefined, currency: string): string | null {
  const minor = Number(amount);
  if (!Number.isFinite(minor)) return null;
  if (minor === 0) return "Sin gasto aún";
  const value = NO_DECIMALS.has(currency) ? minor : minor / 100;
  try {
    const money = new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
    return `Gastado ${money}`;
  } catch {
    return `Gastado ${Math.round(value)} ${currency}`;
  }
}

/** “hace 3 h”, “hace 5 días”. */
export function ago(iso: string | undefined, now: number): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return min <= 1 ? "hace un momento" : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 60) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const m = Math.round(d / 30);
  return m < 24 ? `hace ${m} meses` : `hace ${Math.round(m / 12)} años`;
}

const compact = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x));

const MAX_ACCOUNTS_WITH_PIXELS = 25;
const PIXEL_STALE_MS = 7 * 86_400_000;

/** account_status de la Marketing API → motivo en texto (null = activa). */
function disabledReason(status: number): string | null {
  switch (status) {
    case 1:
      return null;
    case 3:
    case 8:
    case 9:
      return "Pago pendiente";
    case 7:
      return "En revisión";
    case 100:
    case 101:
      return "Cerrada";
    default:
      return "Deshabilitada por Meta";
  }
}

function accountDetails(a: AdAccount): Pick<MetaOption, "id" | "details"> {
  return {
    id: a.account_id ?? a.id.replace(/^act_/, ""),
    details: compact([a.business?.name ?? "Cuenta personal", a.timezone_name, formatSpent(a.amount_spent, a.currency)]),
  };
}

function pixelOption(p: Pixel, now: number): MetaOption {
  const base = {
    value: p.id,
    title: p.name,
    id: p.id,
    details: compact([
      p.last_fired_time ? `Último evento ${ago(p.last_fired_time, now)}` : null,
      p.owner_business?.name,
      p.creation_time ? `Creado ${ago(p.creation_time, now)}` : null,
    ]),
  };
  const last = p.last_fired_time ? Date.parse(p.last_fired_time) : NaN;
  if (Number.isNaN(last)) return { ...base, meta: "Sin eventos aún: revisa que esté en tu tienda", tone: "warning" };
  if (now - last > PIXEL_STALE_MS) return { ...base, meta: "Sin eventos en 7 días: revisa que esté en tu tienda", tone: "warning" };
  return { ...base, meta: "Recibiendo eventos" };
}

export interface RawAssets {
  accounts: AdAccount[];
  pages: Page[];
  pixelsByAccount: Record<string, Pixel[]>;
}

export async function fetchAccounts(token: string): Promise<AdAccount[]> {
  return graphList<AdAccount>(token, "/me/adaccounts", { fields: ACCOUNT_FIELDS });
}

export async function fetchPages(token: string): Promise<Page[]> {
  return graphList<Page>(token, "/me/accounts", { fields: PAGE_FIELDS });
}

export async function fetchPixels(token: string, accountId: string): Promise<Pixel[]> {
  return graphList<Pixel>(token, `/${accountId}/adspixels`, { fields: PIXEL_FIELDS });
}

export async function fetchRawAssets(token: string): Promise<RawAssets> {
  const [accounts, pages] = await Promise.all([fetchAccounts(token), fetchPages(token)]);
  const active = accounts.filter((a) => a.account_status === 1).slice(0, MAX_ACCOUNTS_WITH_PIXELS);
  const pixelLists = await Promise.all(active.map((a) => fetchPixels(token, a.id).catch(() => [] as Pixel[])));
  return { accounts, pages, pixelsByAccount: Object.fromEntries(active.map((a, i) => [a.id, pixelLists[i]])) };
}

/** A O7: opciones con motivo en las deshabilitadas, avisos en los píxeles y la sugerencia marcada. */
export function toMetaAssets(raw: RawAssets, shopCurrency: string | null, now = Date.now()): MetaAssets {
  const active = raw.accounts.filter((a) => a.account_status === 1);
  const suggestedAccount = active.find((a) => a.currency === shopCurrency) ?? active[0];

  const adAccounts: MetaOption[] = [
    ...active.map((a) => ({
      value: a.id,
      title: a.name,
      meta: `${a.currency} · activa`,
      tag: a.id === suggestedAccount?.id ? "Sugerida" : undefined,
      ...accountDetails(a),
    })),
    ...raw.accounts.filter((a) => a.account_status !== 1).map((a) => ({
      value: a.id,
      title: a.name,
      meta: disabledReason(a.account_status) ?? undefined,
      tone: "danger" as const,
      disabled: true,
      ...accountDetails(a),
    })),
  ];

  const pixelsByAccount: Record<string, MetaOption[]> = {};
  for (const [account, pixels] of Object.entries(raw.pixelsByAccount)) {
    // El que disparó más recientemente primero: es la sugerencia.
    const sorted = [...pixels].sort((a, b) => (Date.parse(b.last_fired_time ?? "") || 0) - (Date.parse(a.last_fired_time ?? "") || 0));
    pixelsByAccount[account] = sorted.map((p) => pixelOption(p, now));
  }

  const pages: MetaOption[] = raw.pages.map((p) => ({
    value: p.id,
    title: p.name,
    id: p.id,
    details: compact([p.username ? `@${p.username}` : null, p.category]),
  }));
  const account = suggestedAccount?.id ?? "";
  return {
    adAccounts,
    pages,
    pixels: pixelsByAccount[account] ?? [],
    pixelsByAccount,
    suggested: { account, page: pages[0]?.value ?? "", pixel: pixelsByAccount[account]?.[0]?.value ?? "" },
  };
}
