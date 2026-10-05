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

test('fractional precision preserves database chronology at the server seed boundary', () => {
  const data = Array.from({length: 49}, (_, i) => asset(String(i).padStart(3,'0'), `2026-10-05T00:00:00.${String(i).padStart(6,'0')}+00:00`));
  data[0].created_at = '2026-10-05T00:00:00+00:00';
  data[10].created_at = '2026-10-05T00:00:00.00001+00:00';
  const databaseSeed = [...data].reverse().slice(0,24);
  const page = mediaPage(data,'','all',24,24);
  const merged = mergeMediaPages(databaseSeed,page.items);
  assert.equal(merged.length,48);
  assert.deepEqual(merged.map(x=>x.id),[...data].reverse().slice(0,48).map(x=>x.id));
});
test('timezone offsets and equivalent fractional formatting fall back to ID ties', () => {
  const items = [asset('b','2026-10-05T02:00:00.1+02:00'), asset('c','2026-10-05T00:00:00.100000Z'), asset('a','2026-10-05T00:00:00.100001+00:00'), asset('z','2026-10-05T00:00:00+00:00')];
  assert.deepEqual(stableMediaAssets(items).map(x=>x.id),['a','c','b','z']);
});
test('reset after edited search membership prevents a shifted offset from skipping rows', () => {
  const data=Array.from({length:49},(_,i)=>asset(String(49-i).padStart(3,'0'),`2026-10-05T00:00:${String(49-i).padStart(2,'0')}Z`,'image/jpeg',['person:Alice']));
  const before=mediaPage(data,'Alice','all',0,24);
  data[0]={...data[0],tags:['person:Bob']};
  const reset=mediaPage(data,'Alice','all',0,24);
  const refreshed=mergeMediaPages(before.items,reset.items,true);
  const next=mediaPage(data,'Alice','all',reset.nextOffset,24);
  const all=mergeMediaPages(refreshed,next.items);
  assert.equal(all.length,48);
  assert.equal(all.some(x=>x.id===data[0].id),false);
  assert.equal(all.some(x=>x.id===data[24].id),true);
  assert.equal(next.hasMore,false);
});
