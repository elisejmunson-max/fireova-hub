import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import {
  createDefaultBusinessProfile,
  type BusinessProfile,
} from '@/lib/local-fireova-business-profile'
import {
  generateMarketingIntelligence,
} from '@/lib/local-fireova-marketing-intelligence'
import {
  MockMediaAnalysisProvider,
  addUserMediaAnalysisTag,
  analyzeEventMedia,
  analyzeMediaItem,
  approveAllMediaAnalysisSuggestions,
  createMediaAnalysisSourceFingerprint,
  editMediaAnalysisFields,
  rejectMediaAnalysisSuggestion,
  readMediaAnalysis,
  writeMediaAnalysis,
  type MediaAnalysis,
  type MediaAnalysisProvider,
  type MediaAnalysisProviderImageInput,
  type MediaAnalysisProviderResult,
  type MediaAnalysisProviderVideoInput,
} from '@/lib/local-fireova-media-analysis'
import type { LocalFireovaEvent } from '@/lib/local-fireova-events'
import { buildMarketingOpportunitiesForEvent } from '@/lib/local-fireova-opportunities'
import type { MockMedia } from '@/lib/mock-fireova-content'

class MemoryStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

const storage = new MemoryStorage()

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage },
    configurable: true,
  })
})

test('image analysis persists a deterministic ready-for-review report', async () => {
  const event = eventFactory({ media: [mediaFactory('pizza', 'Fresh pizza by the Fireova oven')] })
  const first = await analyzeMediaItem({ media: event.media[0], event, now: '2026-07-15T01:00:00.000Z' })
  const second = await analyzeMediaItem({ media: event.media[0], event, now: '2026-07-15T02:00:00.000Z' })

  assert.equal(first.status, 'Ready for Review')
  assert.equal(first.mediaId, 'pizza')
  assert.equal(first.generatedAt, second.generatedAt)
  assert.deepEqual(first.suggestedTags, second.suggestedTags)
  assert.equal(readMediaAnalysis('pizza')?.sourceFingerprint, first.sourceFingerprint)
})

test('video analysis creates representative-frame records without full semantic frame analysis', async () => {
  const event = eventFactory({ media: [mediaFactory('video', 'Pizza being served from the oven', 'video')] })
  const baseProvider = new MockMediaAnalysisProvider()
  const provider: MediaAnalysisProvider = {
    id: baseProvider.id,
    version: baseProvider.version,
    source: baseProvider.source,
    analyzeImage: (input) => baseProvider.analyzeImage(input),
    async analyzeVideoFrames(input: MediaAnalysisProviderVideoInput) {
      const result = await baseProvider.analyzeVideoFrames({
        ...input,
        representativeFrames: [{
          id: 'frame-1',
          mediaId: input.media.id,
          timestampSeconds: 0.5,
          localAssetReference: 'blob:frame-1',
          perceptualKey: '111',
          analysisStatus: 'Ready for Review',
        }],
      })
      return result
    },
  }

  const report = await analyzeMediaItem({ media: event.media[0], event, provider })

  assert.equal(report.mediaType, 'video')
  assert.equal(report.representativeFrames?.length, 1)
  assert.equal(report.representativeFrames?.[0].analysisStatus, 'Ready for Review')
})

test('provider result validation stores a failed analysis on invalid output', async () => {
  const event = eventFactory()
  const provider = providerFactory({
    async analyzeImage() {
      return { visualObservations: 'bad' } as unknown as MediaAnalysisProviderResult
    },
  })

  const report = await analyzeMediaItem({ media: event.media[0], event, provider })

  assert.equal(report.status, 'Failed')
  assert.equal(report.error?.code, 'Analysis Response Validation Failure')
})

test('approval, rejection, and user edits are preserved across reanalysis', async () => {
  const event = eventFactory({ media: [mediaFactory('pizza', 'Pizza close-up')] })
  const first = await analyzeMediaItem({ media: event.media[0], event })
  const rejectedId = first.suggestedTags[0]?.id
  assert.ok(rejectedId)

  approveAllMediaAnalysisSuggestions(event.media[0].id)
  rejectMediaAnalysisSuggestion(event.media[0].id, rejectedId)
  addUserMediaAnalysisTag(event.media[0].id, 'User Added Tag')
  editMediaAnalysisFields(event.media[0].id, { suggestedCategory: 'User Category' })
  const reanalyzed = await analyzeMediaItem({ media: event.media[0], event, force: true })

  assert.ok(reanalyzed.userReview.rejectedSuggestionIds.includes(rejectedId))
  assert.ok(reanalyzed.userReview.userAddedTags.includes('User Added Tag'))
  assert.equal(reanalyzed.userReview.userEditedFields.suggestedCategory, 'User Category')
})

test('approved analysis influences Marketing Intelligence while rejected suggestions do not', async () => {
  const event = eventFactory({ id: 'approved-analysis', type: 'Other', media: [mediaFactory('media', 'IMG 1001')] })
  const analysis = await analyzeMediaItem({ media: event.media[0], event })
  const edited = editMediaAnalysisFields(analysis.mediaId, { content: ['Wedding', 'Making Pizza', 'Pizza'] })
  assert.ok(edited)

  const approved = approveAllMediaAnalysisSuggestions(analysis.mediaId)
  assert.ok(approved)
  const report = generateMarketingIntelligence(event, inputFor(event, { mediaAnalyses: [approved] }))

  assert.ok(report.contentStrengths.includes('Wedding Experience'))
  assert.ok(report.contentStrengths.includes('Beautiful Food'))

  const rejected = rejectAllSuggestions(approved)
  writeMediaAnalysis(rejected)
  const rejectedReport = generateMarketingIntelligence(event, inputFor(event, { mediaAnalyses: [rejected] }))

  assert.ok(!rejectedReport.contentStrengths.includes('Wedding Experience'))
  assert.ok(!rejectedReport.contentStrengths.includes('Beautiful Food'))
})

test('low-confidence unreviewed signals do not create specific unsupported intelligence', () => {
  const event = eventFactory({ id: 'low-confidence', type: 'Other', media: [mediaFactory('media', 'IMG 1001')] })
  const analysis = analysisFactory(event.media[0], {
    detectedSubjects: [{
      id: 'guest-low',
      label: 'Individual Guest',
      confidence: 'Low',
      evidenceNote: 'Unclear metadata.',
      source: 'Rule Based',
    }],
  })

  const report = generateMarketingIntelligence(event, inputFor(event, { mediaAnalyses: [analysis] }))

  assert.ok(!report.contentStrengths.includes('Guest Experience'))
})

test('partial event processing keeps one failed media item from failing the batch', async () => {
  const event = eventFactory({
    media: [
      mediaFactory('good', 'Pizza close-up'),
      mediaFactory('bad', 'Corrupted upload'),
    ],
  })
  const provider = providerFactory({
    async analyzeImage(input: MediaAnalysisProviderImageInput) {
      if (input.media.id === 'bad') throw new Error('Provider unavailable')
      return new MockMediaAnalysisProvider().analyzeImage(input)
    },
  })

  const result = await analyzeEventMedia(event, { provider })

  assert.equal(result.total, 2)
  assert.equal(result.analyzed, 1)
  assert.equal(result.failed, 1)
  assert.equal(readMediaAnalysis('bad')?.status, 'Failed')
})

test('fingerprint changes with provider version and event metadata, not review state', async () => {
  const media = mediaFactory('pizza', 'Pizza close-up')
  const event = eventFactory({ media: [media] })
  const first = createMediaAnalysisSourceFingerprint(media, {
    event,
    providerId: 'mock',
    providerVersion: '1',
    source: 'Rule Based',
  })
  const providerChanged = createMediaAnalysisSourceFingerprint(media, {
    event,
    providerId: 'mock',
    providerVersion: '2',
    source: 'Rule Based',
  })
  const eventChanged = createMediaAnalysisSourceFingerprint(media, {
    event: { ...event, notes: 'Updated note' },
    providerId: 'mock',
    providerVersion: '1',
    source: 'Rule Based',
  })

  assert.notEqual(first, providerChanged)
  assert.notEqual(first, eventChanged)
})

test('retry behavior regenerates failed media when requested', async () => {
  const event = eventFactory({ media: [mediaFactory('retry', 'Pizza close-up')] })
  const failingProvider = providerFactory({ async analyzeImage() { throw new Error('Timeout') } })
  const failed = await analyzeMediaItem({ media: event.media[0], event, provider: failingProvider })
  assert.equal(failed.status, 'Failed')

  const success = await analyzeEventMedia(event, { retryFailed: true })
  assert.equal(success.failed, 0)
  assert.equal(readMediaAnalysis('retry')?.status, 'Ready for Review')
})

function inputFor(
  event: LocalFireovaEvent,
  overrides: {
    profile?: BusinessProfile
    mediaAnalyses?: MediaAnalysis[]
  } = {}
) {
  const profile = overrides.profile ?? profileWithActiveGoals(['Book More Weddings'])
  return {
    profile,
    contentItems: [],
    generatedPosts: [],
    postStatuses: {},
    opportunities: buildMarketingOpportunitiesForEvent(event, profile),
    mediaAnalyses: overrides.mediaAnalyses ?? [],
  }
}

function profileWithActiveGoals(labels: string[]) {
  const profile = createDefaultBusinessProfile()
  return {
    ...profile,
    goals: profile.goals.map((goal) => ({
      ...goal,
      isActive: labels.includes(goal.label),
      priority: labels.indexOf(goal.label),
    })),
    services: profile.services.map((service) => ({ ...service, isActive: true })),
    idealClients: profile.idealClients.map((client) => ({ ...client, isActive: true })),
  }
}

function eventFactory(overrides: Partial<LocalFireovaEvent> = {}): LocalFireovaEvent {
  const media = overrides.media ?? [mediaFactory('media', 'Pizza close-up')]
  return {
    id: overrides.id ?? 'event',
    name: overrides.name ?? 'Event',
    type: overrides.type ?? 'Wedding',
    date: overrides.date ?? '2026-07-15',
    venueName: overrides.venueName,
    venueLocation: overrides.venueLocation,
    vendors: overrides.vendors,
    notes: overrides.notes,
    status: overrides.status ?? 'Needs Content',
    draftCount: overrides.draftCount ?? 0,
    cover: overrides.cover ?? media[0],
    media,
    createdAt: overrides.createdAt ?? '2026-07-15T00:00:00.000Z',
  }
}

function mediaFactory(id: string, alt: string, type: MockMedia['type'] = 'photo'): MockMedia {
  return {
    id,
    type,
    src: `/media/${id}.${type === 'video' ? 'mp4' : 'jpg'}`,
    posterSrc: type === 'video' ? `/media/${id}.jpg` : undefined,
    alt,
  }
}

function providerFactory(overrides: Partial<MediaAnalysisProvider>): MediaAnalysisProvider {
  const base = new MockMediaAnalysisProvider()
  return {
    id: overrides.id ?? base.id,
    version: overrides.version ?? base.version,
    source: overrides.source ?? base.source,
    analyzeImage: overrides.analyzeImage ?? ((input) => base.analyzeImage(input)),
    analyzeVideoFrames: overrides.analyzeVideoFrames ?? ((input) => base.analyzeVideoFrames(input)),
  }
}

function analysisFactory(media: MockMedia, overrides: Partial<MediaAnalysis> = {}): MediaAnalysis {
  return {
    id: `media-analysis-${media.id}`,
    mediaId: media.id,
    analysisVersion: '1.0.0',
    status: 'Ready for Review',
    source: 'Rule Based',
    generatedAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    sourceFingerprint: 'fingerprint',
    mediaType: media.type,
    visualObservations: [],
    detectedSubjects: [],
    detectedActions: [],
    detectedFoodItems: [],
    detectedBusinessElements: [],
    detectedEventSignals: [],
    composition: {
      framing: 'Unknown',
      subjectClarity: 'Unknown',
      variety: 'Unknown',
      notes: [],
    },
    quality: {
      overall: 'Usable',
      sharpness: 'Unknown',
      lighting: 'Unknown',
      framing: 'Unknown',
      notes: [],
    },
    marketingUses: [],
    suggestedTags: [],
    suggestedContentThemes: [],
    userReview: {
      reviewStatus: 'Not Reviewed',
      approvedSuggestionIds: [],
      rejectedSuggestionIds: [],
      userAddedTags: [],
      userEditedFields: {},
    },
    ...overrides,
  }
}

function rejectAllSuggestions(analysis: MediaAnalysis): MediaAnalysis {
  const ids = [
    ...analysis.visualObservations,
    ...analysis.detectedSubjects,
    ...analysis.detectedActions,
    ...analysis.detectedFoodItems,
    ...analysis.detectedBusinessElements,
    ...analysis.detectedEventSignals,
    ...analysis.suggestedTags,
    ...analysis.suggestedContentThemes,
  ].map((item) => item.id)

  return {
    ...analysis,
    status: 'Rejected',
    userReview: {
      ...analysis.userReview,
      reviewStatus: 'Reviewed',
      approvedSuggestionIds: [],
      rejectedSuggestionIds: ids,
    },
  }
}
