import test from 'node:test'
import assert from 'node:assert/strict'
import { detectCloudUploadMimeType } from '@/lib/cloud-upload-media'

function uploadFile(bytes: number[], name: string, type = 'application/octet-stream') {
  return new File([new Uint8Array(bytes)], name, { type })
}

test('detects iPhone HEIC from its ISO file signature despite octet-stream', async () => {
  const bytes = [0, 0, 0, 24, ...Array.from('ftypheic').map((character) => character.charCodeAt(0)), 0, 0, 0, 0]
  assert.equal(await detectCloudUploadMimeType(uploadFile(bytes, 'IMG_6366.HEIC')), 'image/heic')
})

test('detects HEIF from its extension when the browser reports octet-stream', async () => {
  assert.equal(await detectCloudUploadMimeType(uploadFile([], 'IMG_6366.HEIF')), 'image/heif')
})

test('detects supported web images by magic bytes', async () => {
  assert.equal(await detectCloudUploadMimeType(uploadFile([0xff, 0xd8, 0xff, 0xe0], 'photo.bin')), 'image/jpeg')
  assert.equal(
    await detectCloudUploadMimeType(uploadFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'photo.bin')),
    'image/png'
  )
  assert.equal(
    await detectCloudUploadMimeType(uploadFile([
      ...Array.from('RIFF').map((character) => character.charCodeAt(0)),
      0, 0, 0, 0,
      ...Array.from('WEBP').map((character) => character.charCodeAt(0)),
    ], 'photo.bin')),
    'image/webp'
  )
})
