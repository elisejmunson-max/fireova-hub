import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreEventMedia } from '@/lib/local-fireova-media-scoring'
import type { MockMedia } from '@/lib/mock-fireova-content'

test('scores every uploaded asset and ranks evidence-backed video action above a duplicate', () => {
  const media: MockMedia[] = [
    { id: 'action-video', type: 'video', src: 'blob:action', alt: 'Couple smiling while cutting pizza beside the fire oven' },
    { id: 'detail-photo', type: 'photo', src: 'blob:detail', alt: 'Table styling and floral decor' },
    { id: 'duplicate-detail', type: 'photo', src: 'blob:detail', alt: 'Table styling and floral decor' },
  ]

  const scores = scoreEventMedia(media, [])

  assert.equal(scores.length, 3)
  assert.equal(scores[0].mediaId, 'action-video')
  assert.ok(scores[0].factors.some((factor) => factor.signal === 'video'))
  assert.ok(scores[0].factors.some((factor) => factor.signal === 'motion'))
  assert.equal(scores.find((score) => score.mediaId === 'duplicate-detail')?.duplicateOf, 'detail-photo')
})

test('does not claim sharpness or strong lighting without explicit metadata evidence', () => {
  const scores = scoreEventMedia([
    { id: 'food', type: 'photo', src: 'blob:food', alt: 'Pizza close-up on a table' },
  ], [])

  const signals = scores[0].factors.map((factor) => factor.signal)
  assert.ok(signals.includes('pizza'))
  assert.ok(!signals.includes('sharpness'))
  assert.ok(!signals.includes('lighting'))
})
