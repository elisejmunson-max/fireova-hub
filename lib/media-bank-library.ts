// prettier-ignore
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { mediaPage, MEDIA_PAGE_SIZE, type MediaBankAsset, type MediaFilter, } from "./media-bank-pagination.ts";

export const MEDIA_ASSET_FIELDS =
  "id,filename,storage_path,file_type,created_at,tags,ai_categories";

/** Search examines metadata for the whole owned library; originals are never read. */
export async function readMediaLibraryPage(
  sb: any,
  userId: string,
  params: URLSearchParams,
) {
  const filter = (
    ["photo", "video"].includes(params.get("filter") || "")
      ? params.get("filter")
      : "all"
  ) as MediaFilter;
  const query = (params.get("q") || "").slice(0, 120);
  const integer = (value: string | null, fallback: number) =>
    value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : fallback;
  const offset = Math.max(0, integer(params.get("offset"), 0));
  const limit = Math.min(
    60,
    Math.max(1, integer(params.get("limit"), MEDIA_PAGE_SIZE)),
  );
  const assets: MediaBankAsset[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("media_assets")
      .select(MEDIA_ASSET_FIELDS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error("Could not load media. Please retry.");
    assets.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return mediaPage(assets, query, filter, offset, limit);
}

export async function mediaLibraryResponse(
  request: Request,
  createClient: () => any,
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const sb = createClient();
    const {
      data: { user },
      error,
    } = await sb.auth.getUser();
    if (error || !user || user.id === "dev")
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    const result = await readMediaLibraryPage(
      sb,
      user.id,
      new URL(request.url).searchParams,
    );
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: "Could not load media. Please retry." },
      { status: 500, headers },
    );
  }
}
