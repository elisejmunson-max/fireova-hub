export type MediaBankAsset = {
  id: string;
  filename: string;
  storage_path: string;
  file_type: string;
  created_at: string;
  tags?: string[] | null;
  ai_categories?: string[] | null;
};
export type MediaFilter = "all" | "photo" | "video";
export const MEDIA_PAGE_SIZE = 24;

const vals = (asset: MediaBankAsset, prefix: string) =>
  (asset.tags || [])
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length));
export function matchesMediaSearch(asset: MediaBankAsset, raw: string) {
  const query = raw.trim().toLowerCase();
  if (!query) return true;
  const subjects = vals(asset, "subject:").map((value) => value.toLowerCase()),
    people = vals(asset, "person:").map((value) => value.toLowerCase()),
    credits = vals(asset, "photographer:").map((value) => value.toLowerCase()),
    categories = (asset.ai_categories || []).map((value) =>
      value.toLowerCase(),
    );
  if (query === "pizza") {
    const falsePositive =
      /oven|shirt|logo|sign|signage|tent|truck|box|menu|text|brand/;
    return subjects.some(
      (subject) =>
        !falsePositive.test(subject) &&
        (subject === "pizza" ||
          subject === "pizzas" ||
          subject.endsWith(" pizza") ||
          /pizza (slice|slices|food|crust|topping)/.test(subject)),
    );
  }
  return (
    asset.filename.toLowerCase().includes(query) ||
    [...subjects, ...people, ...credits, ...categories].some((value) =>
      value.includes(query),
    )
  );
}
export function matchesMediaType(asset: MediaBankAsset, filter: MediaFilter) {
  return (
    filter === "all" ||
    (filter === "photo" && asset.file_type.startsWith("image/")) ||
    (filter === "video" && asset.file_type.startsWith("video/"))
  );
}
export function stableMediaAssets(assets: MediaBankAsset[]) {
  const unique = new Map<string, MediaBankAsset>();
  for (const asset of assets)
    if (!unique.has(asset.id)) unique.set(asset.id, asset);
  return [...unique.values()].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
}
export function mediaPage(
  assets: MediaBankAsset[],
  query: string,
  filter: MediaFilter,
  offset: number,
  limit = MEDIA_PAGE_SIZE,
) {
  const searched = stableMediaAssets(assets).filter((asset) =>
    matchesMediaSearch(asset, query),
  );
  const counts = {
    all: searched.length,
    photo: searched.filter((asset) => matchesMediaType(asset, "photo")).length,
    video: searched.filter((asset) => matchesMediaType(asset, "video")).length,
  };
  const filtered = searched.filter((asset) => matchesMediaType(asset, filter));
  const items = filtered.slice(offset, offset + limit);
  return {
    items,
    total: filtered.length,
    counts,
    hasMore: offset + items.length < filtered.length,
    nextOffset: offset + items.length,
  };
}
export function mergeMediaPages(
  current: MediaBankAsset[],
  incoming: MediaBankAsset[],
  reset = false,
) {
  return stableMediaAssets(reset ? incoming : [...current, ...incoming]);
}
