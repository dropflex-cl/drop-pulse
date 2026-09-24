import "server-only";
import { requireUser } from "@/lib/integrations/session";
import { ProductApiError } from "@/lib/products/http";
import { getCampaignRow, type CampaignRow } from "./store";

/** Usuario de la sesión y su campaña ya creada en Meta; 401 sin sesión, 404 si no es suya. */
export async function ownedCampaign(id: string): Promise<{ userId: string; campaign: CampaignRow }> {
  const user = await requireUser();
  const campaign = await getCampaignRow(user.id, id);
  if (!campaign || !campaign.meta_campaign_id) throw new ProductApiError("No encontramos esa campaña.", 404);
  return { userId: user.id, campaign };
}
