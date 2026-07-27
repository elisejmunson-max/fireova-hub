import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findEventDraftForMedia,
  getEventContentStudioEntryHref,
  getPostCreateEventHref,
} from '@/lib/local-fireova-content-studio'
import type { LocalFireovaEvent, LocalGeneratedPostDraft } from '@/lib/local-fireova-events'
import type { MockMedia } from '@/lib/mock-fireova-content'

const video: MockMedia = {
  id: 'event-video-1',
  type: 'video',
  src: 'blob:event-video-1',
  posterSrc: 'blob:event-video-1-poster',
  alt: 'Event video',
}

const photo: MockMedia = {
  id: 'event-photo-1',
  type: 'photo',
  src: 'blob:event-photo-1',
  alt: 'Event photo',
}

function eventWith(media: MockMedia[]): LocalFireovaEvent {
  return {
    id: 'event-1',
    name: 'Summer Wedding',
    type: 'Wedding',
    date: '2026-07-11',
    status: 'Needs Content',
    draftCount: 0,
    cover: media[0],
    media,
    createdAt: '2026-07-11T12:00:00.000Z',
  }
}

function draftFor(media: MockMedia, id = 'draft-1'): LocalGeneratedPostDraft {
  return {
    id,
    tone: 'Wedding Moment',
    caption: 'A day worth celebrating.',
    hashtags: ['#wedding'],
    media,
    mediaItems: [media],
    sourceType: 'Event',
    sourceId: 'event-1',
    sourceLabel: 'Summer Wedding',
  }
}

test('one video skips strategy selection and opens the Reel editor', () => {
  const href = getPostCreateEventHref(eventWith([video]))
  const params = new URL(href, 'https://fireova.test').searchParams

  assert.equal(params.get('builder'), '1')
  assert.equal(params.get('mediaIds'), video.id)
  assert.equal(video.type, 'video')
  assert.equal(params.has('opportunityId'), false)
})

test('one photo skips strategy selection and opens the Feed editor', () => {
  const href = getPostCreateEventHref(eventWith([photo]))
  const params = new URL(href, 'https://fireova.test').searchParams

  assert.equal(params.get('builder'), '1')
  assert.equal(params.get('mediaIds'), photo.id)
  assert.equal(photo.type, 'photo')
  assert.equal(params.has('opportunityId'), false)
})

test('an existing draft for the only media item is reopened instead of duplicated', () => {
  const existingDraft = draftFor(video)
  const href = getEventContentStudioEntryHref(eventWith([video]), [existingDraft])
  const params = new URL(href, 'https://fireova.test').searchParams

  assert.equal(findEventDraftForMedia([existingDraft], video)?.id, existingDraft.id)
  assert.equal(params.get('draftId'), existingDraft.id)
})

test('multiple media items still enter the recommendation selection flow', () => {
  assert.equal(
    getPostCreateEventHref(eventWith([video, photo])),
    '/content-studio?source=event&eventId=event-1'
  )
})

test('a media-less created event falls back to Event Detail', () => {
  assert.equal(getPostCreateEventHref(eventWith([])), '/events/event-1')
})

test('multiple saved drafts open the normal review workflow', () => {
  assert.equal(
    getEventContentStudioEntryHref(eventWith([video]), [draftFor(video), draftFor(photo, 'draft-2')]),
    '/events/event-1/review'
  )
})
