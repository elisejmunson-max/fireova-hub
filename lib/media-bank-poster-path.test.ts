import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { mediaBankPosterPath } from './media-bank-poster-path.ts';

test('saved Media Bank poster paths are deterministic, versioned, owner-scoped JPEG keys', () => {
  assert.equal(mediaBankPosterPath('owner-a', 'asset-a'), 'owner-a/media-bank-posters/v1/asset-a.jpg');
  assert.equal(mediaBankPosterPath('owner-b', 'asset-a'), 'owner-b/media-bank-posters/v1/asset-a.jpg');
  assert.equal(mediaBankPosterPath('ab12-34', 'ASSET_56'), 'ab12-34/media-bank-posters/v1/ASSET_56.jpg');
});

test('saved poster path identifiers cannot inject paths, URLs, encodings, or traversal', () => {
  for (const value of ['', '.', '..', '../asset', '/asset', 'asset/other', 'https://evil.example',
    'asset?url=evil', 'asset#hash', 'asset%2fother', 'asset\\other', 'asset\u0000other', 'a'.repeat(101)]) {
    assert.equal(mediaBankPosterPath('owner-a', value), null);
    assert.equal(mediaBankPosterPath(value, 'asset-a'), null);
  }
});

// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { mediaBankDeletionPaths } from './media-bank-poster-path.ts';

test('owned video deletion includes only the original and its deterministic poster', () => {
  assert.deepEqual(mediaBankDeletionPaths('owner', { id: 'asset', storage_path: 'owner/library/original.mov', file_type: 'video/quicktime' }), ['owner/library/original.mov', 'owner/media-bank-posters/v1/asset.jpg']);
  assert.deepEqual(mediaBankDeletionPaths('owner', { id: 'asset', storage_path: 'owner/library/photo.jpg', file_type: 'image/jpeg' }), ['owner/library/photo.jpg']);
});

test('deletion paths reject foreign ownership and unsafe source keys', () => {
  for (const path of ['other/private.mov', 'owner/../private.mov', 'owner/a%2fb.mov', 'https://external.test/a', 'owner/a?x=1']) {
    assert.equal(mediaBankDeletionPaths('owner', { id: 'asset', storage_path: path, file_type: 'video/mp4' }), null);
  }
});
