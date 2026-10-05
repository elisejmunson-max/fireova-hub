import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhotoCredits } from "@/lib/manual-content-drafts";

export async function POST(req: NextRequest) {
  const sb = createClient() as any;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const photoCredits = normalizePhotoCredits(body.photoCredits ?? []);
  if (!photoCredits)
    return Response.json({ error: "Invalid photo credits" }, { status: 400 });
  const { data, error } = await sb.rpc("approve_review_draft", {
    p_asset_ids: Array.isArray(body.assetIds) ? body.assetIds.map(String) : [],
    p_caption: typeof body.caption === "string" ? body.caption : "",
    p_original_caption: typeof body.originalCaption === "string" ? body.originalCaption : "",
    p_photo_credits: photoCredits,
    p_format: typeof body.format === "string" ? body.format : "",
    p_source_draft_id: typeof body.sourceDraftId === "string" ? body.sourceDraftId : "",
    p_plan_slot_id: typeof body.planSlotId === "string" ? body.planSlotId : "",
    p_planning_date: typeof body.planningDate === "string" && body.planningDate ? body.planningDate : null,
    p_plan_position: Number.isInteger(body.planPosition) ? body.planPosition : -1,
    p_expected_updated_at: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
  });

  if (error) {
    const stale = error.code === "40001" || /changed in another window|stale/i.test(String(error.message || ""));
    return Response.json({ error: stale ? "This draft changed in another window. Refresh before approving." : error.message || "Could not approve" }, { status: stale ? 409 : 500 });
  }
  if (!data?.ok) return Response.json({ error: data?.error || "Could not approve" }, { status: 500 });
  return Response.json(data);
}
