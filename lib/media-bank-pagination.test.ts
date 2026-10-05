import test from "node:test";
import assert from "node:assert/strict";
// prettier-ignore
// @ts-expect-error Node direct TypeScript execution requires the suffix.
import { mediaPage, mergeMediaPages, stableMediaAssets, type MediaBankAsset, } from "./media-bank-pagination.ts";
const asset = (
  id: string,
  date: string,
  type = "image/jpeg",
  tags: string[] = [],
): MediaBankAsset => ({
  id,
  filename: `${id}.jpg`,
  storage_path: id,
  file_type: type,
  created_at: date,
  tags,
});
test("pages deterministically by created time then id", () => {
  const page = mediaPage(
    [
      asset("b", "2026-01-01"),
      asset("a", "2026-01-02"),
      asset("c", "2026-01-01"),
    ],
    "",
    "all",
    0,
    2,
  );
  assert.deepEqual(
    page.items.map((x) => x.id),
    ["a", "c"],
  );
  assert.equal(page.hasMore, true);
});
test("deduplicates assets across overlapping pages", () => {
  assert.deepEqual(
    mergeMediaPages(
      [asset("a", "2026-01-02"), asset("b", "2026-01-01")],
      [asset("b", "2026-01-01"), asset("c", "2025-12-01")],
    ).map((x) => x.id),
    ["a", "b", "c"],
  );
});
test("global counts cover all search matches rather than one page", () => {
  const page = mediaPage(
    [asset("a", "3"), asset("b", "2", "video/mp4"), asset("c", "1")],
    "",
    "photo",
    0,
    1,
  );
  assert.deepEqual(page.counts, { all: 3, photo: 2, video: 1 });
  assert.equal(page.total, 2);
});
test("search covers unloaded metadata and filename", () => {
  const page = mediaPage(
    [
      asset("a", "2"),
      asset("charcuterie", "1", "image/jpeg", ["subject:board"]),
    ],
    "charcuterie",
    "all",
    0,
    1,
  );
  assert.deepEqual(
    page.items.map((x) => x.id),
    ["charcuterie"],
  );
});
test("pizza search rejects logo and oven false positives", () => {
  const page = mediaPage(
    [
      asset("oven", "2", "image/jpeg", ["subject:pizza oven"]),
      asset("food", "1", "image/jpeg", ["subject:pizza slice"]),
    ],
    "pizza",
    "all",
    0,
    24,
  );
  assert.deepEqual(
    page.items.map((x) => x.id),
    ["food"],
  );
});
test("reset replaces interrupted search results", () => {
  assert.deepEqual(
    mergeMediaPages([asset("old", "1")], [asset("new", "2")], true).map(
      (x) => x.id,
    ),
    ["new"],
  );
});
