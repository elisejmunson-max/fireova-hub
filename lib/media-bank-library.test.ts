import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Direct Node TypeScript execution requires the suffix.
import { mediaLibraryResponse } from "./media-bank-library.ts";

const owner = "owner-a";
const rows = Array.from({ length: 1241 }, (_, i) => ({
  id: `asset-${String(1241 - i).padStart(4, "0")}`,
  user_id: owner,
  filename: i === 1240 ? "unloaded-charcuterie.jpg" : `photo-${i}.jpg`,
  storage_path: `${owner}/${i}.jpg`,
  created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, -i)).toISOString(),
  file_type: i % 5 === 0 ? "video/mp4" : "image/jpeg",
  tags: [],
}));
function mock(
  user: any = { id: owner },
  data = rows,
  authError: any = null,
  queryError: any = null,
) {
  const calls: any[] = [];
  let readCount = 0;
  const sb = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from: (table: string) => {
      readCount++;
      const call: any = { table };
      calls.push(call);
      const q: any = {
        select: (fields: string) => {
          call.fields = fields;
          return q;
        },
        eq: (key: string, value: string) => {
          call[key] = value;
          return q;
        },
        order: () => q,
        range: async (start: number, end: number) => {
          call.range = [start, end];
          return {
            data: data
              .filter((x) => x.user_id === call.user_id)
              .slice(start, end + 1),
            error: queryError,
          };
        },
      };
      return q;
    },
  };
  return { sb, calls, readCount: () => readCount };
}
const request = (query = "") =>
  new Request(`https://fixture.invalid/api/media-bank/library?${query}`);
test("metadata search scans all pages and scopes every query to owner", async () => {
  const m = mock();
  const response = await mediaLibraryResponse(
    request("q=unloaded-charcuterie"),
    () => m.sb,
  );
  const body = await response.json();
  assert.equal(body.items[0].filename, "unloaded-charcuterie.jpg");
  assert.equal(body.total, 1);
  assert.equal(body.nextOffset, 1);
  assert.equal(m.calls.length, 2);
  assert.ok(m.calls.every((x) => x.user_id === owner));
  assert.ok(m.calls.every((x) => !x.fields.includes("*")));
});
test("small initial payload still returns exact global counts", async () => {
  const response = await mediaLibraryResponse(request(), () => mock().sb);
  const body = await response.json();
  assert.equal(body.items.length, 24);
  assert.equal(body.counts.all, 1241);
  assert.equal(body.counts.video, 249);
  assert.equal(body.counts.photo, 992);
  assert.equal(body.nextOffset, 24);
  assert.equal(body.hasMore, true);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("limit and offset are bounded and mode=all cannot return unbounded payloads", async () => {
  const response = await mediaLibraryResponse(
    request("limit=100000&offset=-7&mode=all"),
    () => mock().sb,
  );
  const body = await response.json();
  assert.equal(body.items.length, 60);
  assert.equal(body.nextOffset, 60);
});
test("anonymous, auth-error and dev-mock users are rejected before metadata reads", async () => {
  for (const [user, error] of [
    [null, null],
    [{ id: owner }, new Error("expired")],
    [{ id: "dev" }, null],
  ]) {
    const m = mock(user, rows, error);
    const response = await mediaLibraryResponse(request(), () => m.sb);
    assert.equal(response.status, 401);
    assert.equal(m.readCount(), 0);
  }
});
test("another owner never appears in results", async () => {
  const m = mock({ id: "owner-b" }, [
    ...rows,
    { ...rows[0], id: "foreign", user_id: "owner-b" },
  ]);
  const body = await (await mediaLibraryResponse(request(), () => m.sb)).json();
  assert.equal(body.total, 1);
  assert.equal(body.items[0].id, "foreign");
  assert.ok(m.calls.every((x) => x.user_id === "owner-b"));
});
test("database errors are retryable and do not leak database details", async () => {
  const response = await mediaLibraryResponse(
    request(),
    () =>
      mock({ id: owner }, rows, null, { message: "secret database host" }).sb,
  );
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /secret/);
});
