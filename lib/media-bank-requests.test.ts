import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node TypeScript execution needs the extension.
import { MediaPageRequests } from "./media-bank-requests.ts";

test("overlapping scroll callbacks issue only one request", () => {
  const state = new MediaPageRequests();
  const first = state.begin("all:", false)!;
  assert.equal(state.begin("all:", false), null);
  assert.equal(state.complete(first.token, 24), true);
  assert.equal(state.begin("all:", false)!.offset, 24);
});
test("new query aborts old request and rejects its late response", () => {
  const state = new MediaPageRequests();
  const old = state.begin("all:", true)!;
  const next = state.begin("photo:pizza", true)!;
  assert.equal(old.signal.aborted, true);
  assert.equal(state.complete(old.token, 24), false);
  assert.equal(state.current(next.token), true);
  assert.equal(next.offset, 0);
});
test("failed resets retry at zero, not the number of old rendered items", () => {
  const state = new MediaPageRequests();
  const initial = state.begin("all:", true)!;
  state.complete(initial.token, 48);
  const search = state.begin("all:unloaded", true)!;
  state.fail(search.token, search.reset);
  const retry = state.begin("all:unloaded", false)!;
  assert.equal(retry.offset, 0);
  assert.equal(retry.reset, true);
});
test("overlapping page deduplication does not move the server cursor backwards", () => {
  const state = new MediaPageRequests();
  const initial = state.begin("all:", true)!;
  state.complete(initial.token, 24);
  const next = state.begin("all:", false)!;
  state.complete(next.token, 48);
  assert.equal(state.begin("all:", false)!.offset, 48);
});
test("cancellation rejects late responses and allows a fresh request", () => {
  const state = new MediaPageRequests();
  const old = state.begin("all:", true)!;
  state.cancel();
  assert.equal(old.signal.aborted, true);
  assert.equal(state.current(old.token), false);
  assert.ok(state.begin("all:", true));
});

test("server-rendered first page seeds the next request at offset 24", () => {
  const state = new MediaPageRequests("all:", 24);
  const next = state.begin("all:", false)!;
  assert.equal(next.offset, 24);
  assert.equal(next.reset, false);
});
