import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's direct TypeScript tests require the suffix.
import { mediaSelectionError, updatedPostMedia, movePostMedia, mediaMode } from './post-media-editor.ts';
import type { ManualAsset, ManualPost } from './manual-content-drafts';
const photo = (id: string): ManualAsset => ({ id, filename: `${id}.jpg`, storage_path: `fixture/${id}`, file_type: 'image/jpeg', tags: [] });
const video: ManualAsset = { ...photo('video'), file_type: 'video/mp4' };
const missing: ManualAsset = { ...photo('missing'), missing: true };
const post: ManualPost = { id: 'draft-test', draftId: 'draft-test', planSlotId: 'slot-test', planningDate: '2026-10-09', planPosition: 2, media: [photo('old')], kind: 'Photo', purpose: 'Menu detail', revision: { note: 'Keep this saved note', requestedAt: '2026-10-05T01:00:00Z', baseCaption: 'Caption stays unchanged', status: 'waiting' } };

test('one photo, up to ten photos, or a single Reel derive the format', () => {
  assert.equal(updatedPostMedia(post, [photo('one')]).kind, 'Photo');
  assert.equal(updatedPostMedia(post, [photo('one'), photo('two')]).kind, 'Carousel');
  assert.equal(updatedPostMedia(post, Array.from({ length: 10 }, (_, i) => photo(String(i)))).kind, 'Carousel');
  assert.equal(updatedPostMedia(post, [video]).kind, 'Reel');
  assert.equal(mediaMode([video]), 'video');
});
test('invalid combinations never become a saved draft', () => {
  for (const assets of [[], [missing], [video, photo('one')], [video, { ...video, id: 'second' }], [photo('one'), photo('one')], Array.from({ length: 11 }, (_, i) => photo(String(i))), [{ ...photo('pdf'), file_type: 'application/pdf' }]]) {
    assert.notEqual(mediaSelectionError(assets), '');
    assert.throws(() => updatedPostMedia(post, assets));
  }
});
test('media edits preserve stable identity, planning fields, revision and purpose without mutation', () => {
  const input = [photo('new'), photo('last')];
  const result = updatedPostMedia(post, input);
  const { media: oldMedia, kind: _oldKind, ...oldFields } = post;
  const { media: newMedia, kind: _newKind, ...newFields } = result;
  assert.deepEqual(newFields, oldFields);
  assert.deepEqual(oldMedia.map(asset => asset.id), ['old']);
  assert.notEqual(newMedia, input);
  assert.equal(result.revision?.status, 'waiting');
  assert.deepEqual(newMedia.map(asset => asset.tags), [[], []], 'unknown photographer is not fabricated');
});
test('reorder changes only order, is bounded, and leaves original arrays intact', () => {
  const assets = [photo('a'), photo('b'), photo('c')];
  assert.deepEqual(movePostMedia(assets, 2, -1).map(asset => asset.id), ['a', 'c', 'b']);
  assert.deepEqual(movePostMedia(assets, 0, 1).map(asset => asset.id), ['b', 'a', 'c']);
  assert.deepEqual(assets.map(asset => asset.id), ['a', 'b', 'c']);
  assert.equal(movePostMedia(assets, 0, -1), assets);
  assert.equal(movePostMedia(assets, 2, 1), assets);
  assert.equal(movePostMedia(assets, -1, 1), assets);
});
