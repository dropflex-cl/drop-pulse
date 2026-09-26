// Datos de ejemplo del detalle de campaña (/dev/screens/campaign).
import { productImage } from "@/lib/mock/images";
import type { CampaignDetail } from "@/lib/types";

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export function fixture(state: string): CampaignDetail {
  const live = state === "live";
  const published = state === "waiting" || live;
  const startsAt = state === "now" ? null : live ? inHours(-30) : inHours(5);
  return {
    id: "00000000-0000-0000-0000-000000000001",
    productId: "00000000-0000-0000-0000-000000000002",
    productName: "Deep Collagen",
    productImage: productImage(0),
    name: "Deep Collagen · Testeo",
    structure: "abo",
    status: published ? "active" : "paused",
    currency: "CLP",
    timezone: "America/Santiago",
    engine: { mode: "suggest", cpa_limit: 12000, rules: [] },
    dailyBudget: null,
    dailyTotal: 10000,
    launchedAt: inHours(-1),
    publishedAt: published ? inHours(-1) : null,
    startsAt,
    canRedo: !live,
    lastSyncedAt: null,
    syncError: null,
    totals: { spend: live ? 8200 : 0, purchases: live ? 1 : 0, cpa: live ? 8200 : null, roas: null, ctr: null },
    units: ["UGC Collagen A", "UGC Collagen B"].map((name, i) => ({ id: `u${i}`, level: "adset", name, active: published, budget: 5000, image: productImage(i), video: false, spend: live ? 4100 : 0, purchases: 0, cpa: null, decision: null })),
    campaignDecision: null,
    changes: [],
    daily: { campaign: [] },
    hourly: { today: [], yesterday: [] },
  };
}
