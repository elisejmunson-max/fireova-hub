import {
  createVideoRepresentativeFrames,
  resolveIndexedDbMediaObjectUrl,
} from '@/lib/local-fireova-media'
import type { LocalFireovaEvent } from '@/lib/local-fireova-events'
import type { MockMedia } from '@/lib/mock-fireova-content'

export const LOCAL_MEDIA_ANALYSIS_KEY = 'fireova-marketing-hub-media-analysis-v1'
export const MEDIA_ANALYSIS_VERSION = '1.0.0'
export const VIDEO_FRAME_EXTRACTION_VERSION = '1.0.0'

export type MediaAnalysisStatus =
  | 'Not Analyzed'
  | 'Queued'
  | 'Processing'
  | 'Ready for Review'
  | 'Approved'
  | 'Partially Approved'
  | 'Rejected'
  | 'Failed'

export type MediaAnalysisSource =
  | 'Rule Based'
  | 'Vision Provider'
  | 'Video Frame Analysis'
  | 'User Edited'

export type MediaAnalysisConfidence = 'High' | 'Medium' | 'Low'
export type MediaTypeForAnalysis = 'photo' | 'video'

export type DetectedSubjectLabel =
  | 'Couple'
  | 'Individual Guest'
  | 'Group of Guests'
  | 'Child'
  | 'Team Member'
  | 'Vendor'
  | 'No Person'

export type DetectedActionLabel =
  | 'Making Pizza'
  | 'Stretching Dough'
  | 'Adding Toppings'
  | 'Launching Pizza'
  | 'Removing Pizza'
  | 'Cutting Pizza'
  | 'Serving Food'
  | 'Eating'
  | 'Gathering'
  | 'Setting Up'
  | 'Cooking'
  | 'Carrying Equipment'
  | 'Posing'
  | 'Other'

export type DetectedFoodItemLabel =
  | 'Pizza'
  | 'Charcuterie'
  | 'Grazing Table'
  | 'Appetizer'
  | 'Salad'
  | 'Crostini'
  | 'Dessert'
  | 'Beverage'
  | 'Unclear Food Item'

export type DetectedBusinessElementLabel =
  | 'Fireova Oven'
  | 'Fireova Trailer'
  | 'Fireova Tent'
  | 'Fireova Branding'
  | 'Buffet Setup'
  | 'Grazing Setup'
  | 'Catering Equipment'
  | 'Menu Sign'
  | 'Venue Detail'
  | 'Vendor Signage'

export type DetectedEventSignalLabel =
  | 'Wedding'
  | 'Corporate Event'
  | 'Private Party'
  | 'Holiday Party'
  | 'Graduation'
  | 'Shower'
  | 'Rehearsal Dinner'
  | 'Outdoor Event'
  | 'Indoor Event'
  | 'Unclear Event Type'

export type ReviewableSuggestion<TLabel extends string = string> = {
  id: string
  label: TLabel
  confidence: MediaAnalysisConfidence
  evidenceNote: string
  source: MediaAnalysisSource
}

export type VisualObservation = {
  id: string
  statement: string
  confidence: MediaAnalysisConfidence
  evidenceNote: string
  source: MediaAnalysisSource
}

export type DetectedSubject = ReviewableSuggestion<DetectedSubjectLabel>
export type DetectedAction = ReviewableSuggestion<DetectedActionLabel>
export type DetectedFoodItem = ReviewableSuggestion<DetectedFoodItemLabel>
export type DetectedBusinessElement = ReviewableSuggestion<DetectedBusinessElementLabel>
export type DetectedEventSignal = ReviewableSuggestion<DetectedEventSignalLabel>

export type QualityValue = 'Strong' | 'Usable' | 'Limited' | 'Poor' | 'Unknown'

export type CompositionAssessment = {
  framing: QualityValue
  subjectClarity: QualityValue
  variety: QualityValue
  notes: string[]
}

export type QualityAssessment = {
  overall: Exclude<QualityValue, 'Unknown'>
  sharpness: QualityValue
  lighting: QualityValue
  stability?: QualityValue
  framing: QualityValue
  notes: string[]
}

export type SuggestedMarketingUseLabel =
  | 'Reel Hook'
  | 'Reel Supporting Clip'
  | 'Carousel Cover'
  | 'Carousel Supporting Image'
  | 'Single Photo Post'
  | 'Story'
  | 'Behind the Scenes'
  | 'Product Feature'
  | 'Event Recap'
  | 'Vendor Collaboration'
  | 'Social Proof Support'
  | 'Not Recommended'

export type SuggestedMarketingUse = {
  id: string
  use: SuggestedMarketingUseLabel
  rationale: string
  confidence: MediaAnalysisConfidence
  relevantActiveGoals: string[]
  relevantServices: string[]
}

export type RepresentativeFrame = {
  id: string
  mediaId: string
  timestampSeconds: number
  localAssetReference: string
  perceptualKey?: string
  analysisStatus: MediaAnalysisStatus
  observations?: VisualObservation[]
}

export type SuggestedTag = ReviewableSuggestion
export type SuggestedContentTheme = ReviewableSuggestion

export type MediaAnalysisReview = {
  reviewStatus: 'Not Reviewed' | 'Partially Reviewed' | 'Reviewed'
  approvedSuggestionIds: string[]
  rejectedSuggestionIds: string[]
  userAddedTags: string[]
  userEditedFields: Record<string, unknown>
  reviewedAt?: string
}

export type MediaAnalysisErrorCode =
  | 'Unsupported Video Codec'
  | 'Frame Extraction Failure'
  | 'Corrupted Media'
  | 'Provider Timeout'
  | 'Provider Unavailable'
  | 'Missing Local Asset'
  | 'Analysis Response Validation Failure'
  | 'Unknown'

export type MediaAnalysisError = {
  code: MediaAnalysisErrorCode
  message: string
  retryable: boolean
}

export type MediaAnalysis = {
  id: string
  mediaId: string
  eventId?: string
  analysisVersion: string
  status: MediaAnalysisStatus
  source: MediaAnalysisSource
  generatedAt?: string
  updatedAt: string
  sourceFingerprint: string
  mediaType: MediaTypeForAnalysis
  visualObservations: VisualObservation[]
  detectedSubjects: DetectedSubject[]
  detectedActions: DetectedAction[]
  detectedFoodItems: DetectedFoodItem[]
  detectedBusinessElements: DetectedBusinessElement[]
  detectedEventSignals: DetectedEventSignal[]
  composition: CompositionAssessment
  quality: QualityAssessment
  marketingUses: SuggestedMarketingUse[]
  representativeFrames?: RepresentativeFrame[]
  suggestedTags: SuggestedTag[]
  suggestedContentThemes: SuggestedContentTheme[]
  suggestedCategory?: string
  userReview: MediaAnalysisReview
  providerMetadata?: Record<string, unknown>
  error?: MediaAnalysisError
}

export type MediaAnalysisProviderImageInput = {
  media: MockMedia
  event?: LocalFireovaEvent
  sourceFingerprint: string
}

export type MediaAnalysisProviderVideoInput = MediaAnalysisProviderImageInput & {
  representativeFrames: RepresentativeFrame[]
}

export type MediaAnalysisProviderResult = Omit<
  MediaAnalysis,
  'id' | 'mediaId' | 'eventId' | 'analysisVersion' | 'status' | 'generatedAt' | 'updatedAt' | 'sourceFingerprint' | 'mediaType' | 'userReview'
> & {
  status?: MediaAnalysisStatus
}

export type MediaAnalysisProvider = {
  id: string
  version: string
  source: MediaAnalysisSource
  analyzeImage(input: MediaAnalysisProviderImageInput): Promise<MediaAnalysisProviderResult>
  analyzeVideoFrames(input: MediaAnalysisProviderVideoInput): Promise<MediaAnalysisProviderResult>
}

export type MediaAnalysisConfig = {
  providerEnabled: boolean
  analyzeOnlyOnExplicitAction: boolean
  maxImageDimension: number
  maxVideoFrames: number
  maxFileSizeBytes: number
  costTrackingEnabled: boolean
}

export type AnalyzeMediaItemInput = {
  media: MockMedia
  event?: LocalFireovaEvent
  provider?: MediaAnalysisProvider
  force?: boolean
  now?: string
  config?: Partial<MediaAnalysisConfig>
}

export type AnalyzeEventMediaResult = {
  eventId: string
  total: number
  analyzed: number
  failed: number
  skipped: number
  reports: MediaAnalysis[]
}

export const DEFAULT_MEDIA_ANALYSIS_CONFIG: MediaAnalysisConfig = {
  providerEnabled: true,
  analyzeOnlyOnExplicitAction: true,
  maxImageDimension: 1600,
  maxVideoFrames: 8,
  maxFileSizeBytes: 50 * 1024 * 1024,
  costTrackingEnabled: false,
}

export const FUTURE_VISION_PROVIDER_SETUP_NOTES = [
  'Real provider calls should run behind a server route, not directly in the browser.',
  'Provider API keys must stay on the server and should never be embedded in client bundles.',
  'Server responses should be validated before being persisted as MediaAnalysis records.',
]

export class MockMediaAnalysisProvider implements MediaAnalysisProvider {
  id = 'mock-media-analysis-provider'
  version = '1.0.0'
  source: MediaAnalysisSource = 'Rule Based'

  async analyzeImage(input: MediaAnalysisProviderImageInput): Promise<MediaAnalysisProviderResult> {
    return buildRuleBasedProviderResult(input.media, input.event, this.source)
  }

  async analyzeVideoFrames(input: MediaAnalysisProviderVideoInput): Promise<MediaAnalysisProviderResult> {
    const result = buildRuleBasedProviderResult(input.media, input.event, 'Video Frame Analysis')
    return {
      ...result,
      representativeFrames: input.representativeFrames.map((frame) => ({
        ...frame,
        analysisStatus: 'Ready for Review',
        observations: result.visualObservations.slice(0, 2),
      })),
    }
  }
}

export class FutureVisionProviderAdapter implements MediaAnalysisProvider {
  id = 'future-vision-provider'
  version = '0.0.0'
  source: MediaAnalysisSource = 'Vision Provider'

  async analyzeImage(): Promise<MediaAnalysisProviderResult> {
    throw new Error('Future vision provider requires a server-side adapter before use.')
  }

  async analyzeVideoFrames(): Promise<MediaAnalysisProviderResult> {
    throw new Error('Future vision provider requires a server-side adapter before use.')
  }
}

export async function analyzeMediaItem(input: AnalyzeMediaItemInput): Promise<MediaAnalysis> {
  const provider = input.provider ?? new MockMediaAnalysisProvider()
  const config = { ...DEFAULT_MEDIA_ANALYSIS_CONFIG, ...input.config }
  const now = input.now ?? new Date().toISOString()
  const sourceFingerprint = createMediaAnalysisSourceFingerprint(input.media, {
    event: input.event,
    providerId: provider.id,
    providerVersion: provider.version,
    source: provider.source,
  })
  const existing = readMediaAnalysis(input.media.id)

  if (
    existing &&
    !input.force &&
    existing.sourceFingerprint === sourceFingerprint &&
    existing.analysisVersion === MEDIA_ANALYSIS_VERSION &&
    existing.status !== 'Failed'
  ) {
    return existing
  }

  const processing = normalizeMediaAnalysis({
    ...(existing ?? createEmptyMediaAnalysis(input.media, input.event, sourceFingerprint, now)),
    status: 'Processing',
    source: provider.source,
    updatedAt: now,
    sourceFingerprint,
    error: undefined,
  })
  writeMediaAnalysis(processing)

  try {
    if (!config.providerEnabled) {
      throw createAnalysisFailure('Provider Unavailable', 'Media analysis provider is disabled.', true)
    }

    const providerResult = input.media.type === 'video'
      ? await provider.analyzeVideoFrames({
        media: input.media,
        event: input.event,
        sourceFingerprint,
        representativeFrames: await safelyCreateRepresentativeFrames(input.media, config),
      })
      : await provider.analyzeImage({
        media: input.media,
        event: input.event,
        sourceFingerprint,
      })
    const providerError = validateProviderResult(providerResult)

    if (providerError) {
      throw createAnalysisFailure('Analysis Response Validation Failure', providerError, true)
    }

    const report = normalizeMediaAnalysis({
      ...providerResult,
      id: createMediaAnalysisId(input.media.id),
      mediaId: input.media.id,
      eventId: input.event?.id,
      analysisVersion: MEDIA_ANALYSIS_VERSION,
      status: providerResult.status ?? 'Ready for Review',
      source: provider.source,
      generatedAt: now,
      updatedAt: now,
      sourceFingerprint,
      mediaType: input.media.type,
      userReview: preserveReviewForReanalysis(existing, providerResult, now),
      providerMetadata: {
        ...providerResult.providerMetadata,
        providerId: provider.id,
        providerVersion: provider.version,
        config: {
          maxImageDimension: config.maxImageDimension,
          maxVideoFrames: config.maxVideoFrames,
          maxFileSizeBytes: config.maxFileSizeBytes,
          costTrackingEnabled: config.costTrackingEnabled,
        },
      },
    })
    writeMediaAnalysis(report)
    return report
  } catch (error) {
    const failure = normalizeMediaAnalysis({
      ...processing,
      status: 'Failed',
      updatedAt: now,
      error: isMediaAnalysisError(error)
        ? error
        : createAnalysisFailure('Unknown', error instanceof Error ? error.message : 'Media analysis failed.', true),
    })
    writeMediaAnalysis(failure)
    return failure
  }
}

export async function analyzeEventMedia(
  event: LocalFireovaEvent,
  options: Omit<AnalyzeMediaItemInput, 'media' | 'event'> & { retryFailed?: boolean } = {}
): Promise<AnalyzeEventMediaResult> {
  const reports: MediaAnalysis[] = []
  let failed = 0
  let skipped = 0
  const media = event.media.length > 0 ? event.media : [event.cover]

  for (const item of media) {
    const existing = readMediaAnalysis(item.id)
    if (existing?.status === 'Failed' && !options.retryFailed && !options.force) {
      skipped += 1
      reports.push(existing)
      continue
    }

    const report = await analyzeMediaItem({ ...options, media: item, event })
    reports.push(report)
    if (report.status === 'Failed') failed += 1
  }

  return {
    eventId: event.id,
    total: media.length,
    analyzed: reports.filter((report) => report.status !== 'Failed').length,
    failed,
    skipped,
    reports,
  }
}

export function getEventMediaAnalysisSummary(event: Pick<LocalFireovaEvent, 'media' | 'cover'>) {
  const media = event.media.length > 0 ? event.media : [event.cover]
  const analyses = media.map((item) => readMediaAnalysis(item.id)).filter((item): item is MediaAnalysis => Boolean(item))
  const analyzed = analyses.filter((item) => item.status !== 'Failed').length
  const failed = analyses.filter((item) => item.status === 'Failed').length
  const readyForReview = analyses.filter((item) => item.status === 'Ready for Review' || item.status === 'Partially Approved').length
  const approved = analyses.filter((item) => item.status === 'Approved').length

  return {
    total: media.length,
    analyzed,
    failed,
    readyForReview,
    approved,
    notAnalyzed: Math.max(media.length - analyses.length, 0),
    label: `${analyzed} of ${media.length} analyzed`,
  }
}

export function approveAllMediaAnalysisSuggestions(mediaId: string) {
  const analysis = readMediaAnalysis(mediaId)
  if (!analysis) return null

  const suggestionIds = getAllSuggestionIds(analysis)
  const next = normalizeMediaAnalysis({
    ...analysis,
    status: 'Approved',
    updatedAt: new Date().toISOString(),
    userReview: {
      ...analysis.userReview,
      reviewStatus: 'Reviewed',
      approvedSuggestionIds: uniqueValues([...analysis.userReview.approvedSuggestionIds, ...suggestionIds]),
      rejectedSuggestionIds: analysis.userReview.rejectedSuggestionIds.filter((id) => !suggestionIds.includes(id)),
      reviewedAt: new Date().toISOString(),
    },
  })
  writeMediaAnalysis(next)
  return next
}

export function rejectMediaAnalysisSuggestion(mediaId: string, suggestionId: string) {
  const analysis = readMediaAnalysis(mediaId)
  if (!analysis) return null

  const next = normalizeMediaAnalysis({
    ...analysis,
    status: 'Partially Approved',
    updatedAt: new Date().toISOString(),
    userReview: {
      ...analysis.userReview,
      reviewStatus: 'Partially Reviewed',
      approvedSuggestionIds: analysis.userReview.approvedSuggestionIds.filter((id) => id !== suggestionId),
      rejectedSuggestionIds: uniqueValues([...analysis.userReview.rejectedSuggestionIds, suggestionId]),
    },
  })
  writeMediaAnalysis(next)
  return next
}

export function editMediaAnalysisFields(mediaId: string, fields: Record<string, unknown>) {
  const analysis = readMediaAnalysis(mediaId)
  if (!analysis) return null

  const next = normalizeMediaAnalysis({
    ...analysis,
    status: 'Partially Approved',
    source: 'User Edited',
    updatedAt: new Date().toISOString(),
    userReview: {
      ...analysis.userReview,
      reviewStatus: 'Partially Reviewed',
      userEditedFields: {
        ...analysis.userReview.userEditedFields,
        ...fields,
      },
    },
  })
  writeMediaAnalysis(next)
  return next
}

export function addUserMediaAnalysisTag(mediaId: string, tag: string) {
  const normalizedTag = tag.trim()
  if (!normalizedTag) return readMediaAnalysis(mediaId)

  const analysis = readMediaAnalysis(mediaId)
  if (!analysis) return null

  const next = normalizeMediaAnalysis({
    ...analysis,
    status: 'Partially Approved',
    source: 'User Edited',
    updatedAt: new Date().toISOString(),
    userReview: {
      ...analysis.userReview,
      reviewStatus: 'Partially Reviewed',
      userAddedTags: uniqueValues([...analysis.userReview.userAddedTags, normalizedTag]),
    },
  })
  writeMediaAnalysis(next)
  return next
}

export function getApprovedMediaAnalysisEvidence(analyses: MediaAnalysis[]) {
  return analyses.flatMap((analysis) => {
    if (analysis.status === 'Failed' || analysis.status === 'Rejected') return []

    const approvedIds = new Set(analysis.userReview.approvedSuggestionIds)
    const rejectedIds = new Set(analysis.userReview.rejectedSuggestionIds)
    const reviewBoost = analysis.userReview.reviewStatus === 'Reviewed' || analysis.status === 'Approved'
    const include = (suggestion: { id: string; label: string; confidence: MediaAnalysisConfidence }) => {
      if (rejectedIds.has(suggestion.id)) return false
      if (approvedIds.has(suggestion.id)) return true
      return !reviewBoost && suggestion.confidence === 'High'
    }

    return [
      ...analysis.visualObservations
        .filter((observation) => !rejectedIds.has(observation.id) && (approvedIds.has(observation.id) || observation.confidence === 'High'))
        .map((observation) => observation.statement),
      ...analysis.detectedSubjects.filter(include).map((item) => item.label),
      ...analysis.detectedActions.filter(include).map((item) => item.label),
      ...analysis.detectedFoodItems.filter(include).map((item) => item.label),
      ...analysis.detectedBusinessElements.filter(include).map((item) => item.label),
      ...analysis.detectedEventSignals.filter(include).map((item) => item.label),
      ...analysis.suggestedTags.filter(include).map((item) => item.label),
      ...analysis.suggestedContentThemes.filter(include).map((item) => item.label),
      ...analysis.userReview.userAddedTags,
      ...Object.values(analysis.userReview.userEditedFields).flatMap((value) =>
        typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      ),
    ]
  })
}

export function readAllMediaAnalyses(): Record<string, MediaAnalysis> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(LOCAL_MEDIA_ANALYSIS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, MediaAnalysis>>((acc, [mediaId, value]) => {
      if (isMediaAnalysis(value)) acc[mediaId] = normalizeMediaAnalysis(value)
      return acc
    }, {})
  } catch {
    return {}
  }
}

export function readMediaAnalysis(mediaId: string) {
  return readAllMediaAnalyses()[mediaId] ?? null
}

export function readMediaAnalysesForEvent(event: Pick<LocalFireovaEvent, 'id' | 'media' | 'cover'>) {
  const ids = new Set((event.media.length > 0 ? event.media : [event.cover]).map((media) => media.id))
  return Object.values(readAllMediaAnalyses()).filter((analysis) => analysis.eventId === event.id || ids.has(analysis.mediaId))
}

export function writeMediaAnalysis(analysis: MediaAnalysis) {
  if (typeof window === 'undefined') return

  try {
    const all = readAllMediaAnalyses()
    all[analysis.mediaId] = normalizeMediaAnalysis(analysis)
    window.localStorage.setItem(LOCAL_MEDIA_ANALYSIS_KEY, JSON.stringify(all))
  } catch {
    return
  }
}

export function deleteMediaAnalysis(mediaId: string) {
  if (typeof window === 'undefined') return

  try {
    const all = readAllMediaAnalyses()
    delete all[mediaId]
    window.localStorage.setItem(LOCAL_MEDIA_ANALYSIS_KEY, JSON.stringify(all))
  } catch {
    return
  }
}

export function createMediaAnalysisSourceFingerprint(
  media: MockMedia,
  input: {
    event?: LocalFireovaEvent
    providerId: string
    providerVersion: string
    source: MediaAnalysisSource
  }
) {
  return hashStableValue({
    analysisVersion: MEDIA_ANALYSIS_VERSION,
    frameExtractionVersion: media.type === 'video' ? VIDEO_FRAME_EXTRACTION_VERSION : undefined,
    providerId: input.providerId,
    providerVersion: input.providerVersion,
    source: input.source,
    media: {
      id: media.id,
      type: media.type,
      src: media.src,
      posterSrc: media.posterSrc,
      alt: media.alt,
    },
    event: input.event ? {
      id: input.event.id,
      name: input.event.name,
      type: input.event.type,
      date: input.event.date,
      venueName: input.event.venueName,
      venueLocation: input.event.venueLocation,
      notes: input.event.notes,
    } : undefined,
  })
}

function buildRuleBasedProviderResult(
  media: MockMedia,
  event: LocalFireovaEvent | undefined,
  source: MediaAnalysisSource
): MediaAnalysisProviderResult {
  const text = [media.alt, event?.name, event?.type, event?.venueName, event?.venueLocation, event?.notes].filter(Boolean).join(' ').toLowerCase()
  const visualObservations: VisualObservation[] = []
  const detectedSubjects: DetectedSubject[] = []
  const detectedActions: DetectedAction[] = []
  const detectedFoodItems: DetectedFoodItem[] = []
  const detectedBusinessElements: DetectedBusinessElement[] = []
  const detectedEventSignals: DetectedEventSignal[] = []
  const marketingUses: SuggestedMarketingUse[] = []
  const suggestedTags: SuggestedTag[] = []
  const suggestedContentThemes: SuggestedContentTheme[] = []
  const addObservation = (statement: string, evidenceNote: string, confidence: MediaAnalysisConfidence = 'Medium') => {
    visualObservations.push(createObservation(media.id, statement, confidence, evidenceNote, source))
  }
  const addSuggestion = <TLabel extends string>(
    collection: ReviewableSuggestion<TLabel>[],
    label: TLabel,
    evidenceNote: string,
    confidence: MediaAnalysisConfidence = 'Medium'
  ) => {
    if (!collection.some((item) => item.label === label)) {
      collection.push(createSuggestion(media.id, label, confidence, evidenceNote, source))
    }
  }

  if (matchesText(text, ['couple', 'bride', 'groom', 'wedding'])) {
    addSuggestion(detectedSubjects, 'Couple', 'Event or media metadata references a couple or wedding.', event?.type === 'Wedding' ? 'High' : 'Medium')
    addObservation('Two people or a couple-related event moment may be present.', 'Supported by local event or media metadata.')
  } else if (matchesText(text, ['guest', 'guests', 'party', 'crowd', 'table'])) {
    addSuggestion(detectedSubjects, text.includes('group') || text.includes('guests') ? 'Group of Guests' : 'Individual Guest', 'Metadata references guests or an event gathering.')
    addObservation('Guests or an event gathering may be visible.', 'Supported by local media metadata.')
  } else if (matchesText(text, ['team', 'staff', 'employee'])) {
    addSuggestion(detectedSubjects, 'Team Member', 'Metadata references team or staff.')
    addObservation('A team or staff moment may be visible.', 'Supported by local media metadata.')
  } else {
    addSuggestion(detectedSubjects, 'No Person', 'No person-specific metadata is available.', 'Low')
  }

  if (matchesText(text, ['making pizza', 'preparing pizza', 'prepared'])) addSuggestion(detectedActions, 'Making Pizza', 'Metadata references pizza preparation.', 'High')
  if (matchesText(text, ['stretch', 'dough'])) addSuggestion(detectedActions, 'Stretching Dough', 'Metadata references dough or stretching.')
  if (matchesText(text, ['topping'])) addSuggestion(detectedActions, 'Adding Toppings', 'Metadata references toppings.')
  if (matchesText(text, ['serving', 'served', 'buffet'])) addSuggestion(detectedActions, 'Serving Food', 'Metadata references serving or buffet service.', 'High')
  if (matchesText(text, ['setup', 'setting up'])) addSuggestion(detectedActions, 'Setting Up', 'Metadata references setup.')
  if (matchesText(text, ['cooking', 'oven', 'fire'])) addSuggestion(detectedActions, 'Cooking', 'Metadata references cooking, oven, or fire.')
  if (detectedActions.length === 0) addSuggestion(detectedActions, 'Other', 'No specific visible action is supported by local metadata.', 'Low')

  if (matchesText(text, ['pizza', 'slice'])) {
    addSuggestion(detectedFoodItems, 'Pizza', 'Metadata references pizza.', 'High')
    addObservation('The media may contain pizza or a pizza service moment.', 'Supported by local media metadata.', 'High')
    addSuggestion(suggestedTags, 'Pizza', 'Metadata references pizza.', 'High')
    addSuggestion(suggestedContentThemes, 'Fresh from the Oven', 'Pizza content can support a fresh food theme.')
  }
  if (matchesText(text, ['charcuterie'])) addSuggestion(detectedFoodItems, 'Charcuterie', 'Metadata references charcuterie.', 'High')
  if (matchesText(text, ['grazing'])) addSuggestion(detectedFoodItems, 'Grazing Table', 'Metadata references grazing.')
  if (matchesText(text, ['salad'])) addSuggestion(detectedFoodItems, 'Salad', 'Metadata references salad.')
  if (matchesText(text, ['dessert'])) addSuggestion(detectedFoodItems, 'Dessert', 'Metadata references dessert.')
  if (matchesText(text, ['appetizer', 'small bite', 'crostini'])) addSuggestion(detectedFoodItems, text.includes('crostini') ? 'Crostini' : 'Appetizer', 'Metadata references appetizers or small bites.')
  if (detectedFoodItems.length === 0 && matchesText(text, ['food', 'catering', 'menu'])) {
    addSuggestion(detectedFoodItems, 'Unclear Food Item', 'Metadata references food without a specific item.', 'Low')
  }

  if (matchesText(text, ['fireova', 'brand'])) addSuggestion(detectedBusinessElements, 'Fireova Branding', 'Metadata references Fireova or brand elements.', 'High')
  if (matchesText(text, ['oven', 'wood-fired', 'wood fired', 'fire'])) addSuggestion(detectedBusinessElements, 'Fireova Oven', 'Metadata references oven, fire, or wood-fired cooking.', 'High')
  if (matchesText(text, ['trailer'])) addSuggestion(detectedBusinessElements, 'Fireova Trailer', 'Metadata references trailer.')
  if (matchesText(text, ['tent'])) addSuggestion(detectedBusinessElements, 'Fireova Tent', 'Metadata references tent.')
  if (matchesText(text, ['buffet'])) addSuggestion(detectedBusinessElements, 'Buffet Setup', 'Metadata references buffet setup.')
  if (matchesText(text, ['venue', 'reception', 'rooftop'])) addSuggestion(detectedBusinessElements, 'Venue Detail', 'Metadata references a venue or event setting.')

  if (event?.type === 'Wedding' || matchesText(text, ['wedding', 'bride', 'groom', 'rehearsal'])) addSuggestion(detectedEventSignals, event?.type === 'Rehearsal Dinner' ? 'Rehearsal Dinner' : 'Wedding', 'Event metadata indicates a wedding-related event.', 'High')
  if (event?.type === 'Corporate' || matchesText(text, ['corporate', 'office', 'lunch'])) addSuggestion(detectedEventSignals, 'Corporate Event', 'Event metadata indicates corporate content.', 'High')
  if (event?.type === 'Graduation' || matchesText(text, ['graduation'])) addSuggestion(detectedEventSignals, 'Graduation', 'Event metadata indicates graduation.')
  if (matchesText(text, ['shower'])) addSuggestion(detectedEventSignals, 'Shower', 'Event metadata indicates shower.')
  if (matchesText(text, ['outdoor', 'rooftop', 'patio'])) addSuggestion(detectedEventSignals, 'Outdoor Event', 'Metadata references an outdoor setting.')
  if (detectedEventSignals.length === 0) addSuggestion(detectedEventSignals, 'Unclear Event Type', 'No specific event type is supported by local metadata.', 'Low')

  if (detectedActions.some((item) => ['Making Pizza', 'Cooking', 'Serving Food'].includes(item.label))) {
    addSuggestion(suggestedContentThemes, 'Behind the Scenes', 'Preparation or service action can support a behind-the-scenes theme.')
    marketingUses.push(createMarketingUse(media.id, media.type === 'video' ? 'Reel Supporting Clip' : 'Carousel Supporting Image', 'Action-oriented media can support an event recap or process post.', 'Medium', [], []))
  }
  if (detectedFoodItems.some((item) => item.label === 'Pizza')) {
    marketingUses.push(createMarketingUse(media.id, media.type === 'video' ? 'Reel Hook' : 'Product Feature', 'Pizza content can anchor a food-focused post.', 'High', [], ['Interactive Wood-Fired Pizza Experience']))
  }
  if (detectedBusinessElements.length > 0) {
    addSuggestion(suggestedTags, 'Fireova', 'Business elements are referenced in local metadata.')
    marketingUses.push(createMarketingUse(media.id, 'Event Recap', 'Brand or setup cues can help explain the event service.', 'Medium', [], []))
  }
  if (marketingUses.length === 0) {
    marketingUses.push(createMarketingUse(media.id, media.type === 'video' ? 'Story' : 'Single Photo Post', 'The media may still be usable after user review.', 'Low', [], []))
  }

  const suggestedCategory = inferSuggestedCategory(detectedFoodItems, detectedBusinessElements, detectedActions)
  if (suggestedCategory) addSuggestion(suggestedTags, suggestedCategory, 'Suggested category is supported by local metadata.')

  return {
    source,
    visualObservations,
    detectedSubjects,
    detectedActions,
    detectedFoodItems,
    detectedBusinessElements,
    detectedEventSignals,
    composition: {
      framing: 'Unknown',
      subjectClarity: 'Unknown',
      variety: media.type === 'video' ? 'Usable' : 'Unknown',
      notes: ['Composition is not evaluated by the local development provider.'],
    },
    quality: {
      overall: 'Usable',
      sharpness: 'Unknown',
      lighting: 'Unknown',
      stability: media.type === 'video' ? 'Unknown' : undefined,
      framing: 'Unknown',
      notes: ['Quality is reviewable and intentionally conservative until a real vision provider is connected.'],
    },
    marketingUses: uniqueBy(marketingUses, (item) => item.use),
    suggestedTags: uniqueBy(suggestedTags, (item) => item.label),
    suggestedContentThemes: uniqueBy(suggestedContentThemes, (item) => item.label),
    suggestedCategory,
    providerMetadata: {
      deterministic: true,
      evidenceSource: 'local metadata',
    },
  }
}

async function safelyCreateRepresentativeFrames(media: MockMedia, config: MediaAnalysisConfig): Promise<RepresentativeFrame[]> {
  try {
    const src = await resolveIndexedDbMediaObjectUrl(media.src)
    if (!src) throw createAnalysisFailure('Missing Local Asset', 'The local video file could not be found.', true)
    return await createVideoRepresentativeFrames({
      mediaId: media.id,
      src,
      maxFrames: config.maxVideoFrames,
    })
  } catch (error) {
    if (isMediaAnalysisError(error)) throw error

    return [{
      id: createStableId(`${media.id}:frame-failure`),
      mediaId: media.id,
      timestampSeconds: 0,
      localAssetReference: media.posterSrc ?? media.src,
      analysisStatus: 'Failed',
      error: undefined,
    } as RepresentativeFrame]
  }
}

function preserveReviewForReanalysis(
  existing: MediaAnalysis | null,
  result: MediaAnalysisProviderResult,
  now: string
): MediaAnalysisReview {
  if (!existing) return createEmptyReview()

  const nextIds = new Set([
    ...result.visualObservations.map((item) => item.id),
    ...result.detectedSubjects.map((item) => item.id),
    ...result.detectedActions.map((item) => item.id),
    ...result.detectedFoodItems.map((item) => item.id),
    ...result.detectedBusinessElements.map((item) => item.id),
    ...result.detectedEventSignals.map((item) => item.id),
    ...result.marketingUses.map((item) => item.id),
    ...(result.representativeFrames ?? []).map((item) => item.id),
    ...result.suggestedTags.map((item) => item.id),
    ...result.suggestedContentThemes.map((item) => item.id),
  ])

  return {
    ...existing.userReview,
    approvedSuggestionIds: existing.userReview.approvedSuggestionIds.filter((id) => nextIds.has(id)),
    rejectedSuggestionIds: existing.userReview.rejectedSuggestionIds.filter((id) => nextIds.has(id)),
    reviewedAt: existing.userReview.reviewedAt ?? (existing.userReview.reviewStatus === 'Reviewed' ? now : undefined),
  }
}

function validateProviderResult(result: MediaAnalysisProviderResult) {
  if (!Array.isArray(result.visualObservations)) return 'Visual observations must be an array.'
  if (!Array.isArray(result.detectedSubjects)) return 'Detected subjects must be an array.'
  if (!Array.isArray(result.detectedActions)) return 'Detected actions must be an array.'
  if (!Array.isArray(result.detectedFoodItems)) return 'Detected food items must be an array.'
  if (!Array.isArray(result.detectedBusinessElements)) return 'Detected business elements must be an array.'
  if (!Array.isArray(result.detectedEventSignals)) return 'Detected event signals must be an array.'
  if (!Array.isArray(result.marketingUses)) return 'Marketing uses must be an array.'
  if (!Array.isArray(result.suggestedTags)) return 'Suggested tags must be an array.'
  if (!Array.isArray(result.suggestedContentThemes)) return 'Suggested content themes must be an array.'
  return ''
}

function createEmptyMediaAnalysis(media: MockMedia, event: LocalFireovaEvent | undefined, sourceFingerprint: string, now: string): MediaAnalysis {
  return {
    id: createMediaAnalysisId(media.id),
    mediaId: media.id,
    eventId: event?.id,
    analysisVersion: MEDIA_ANALYSIS_VERSION,
    status: 'Not Analyzed',
    source: 'Rule Based',
    updatedAt: now,
    sourceFingerprint,
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
      overall: 'Limited',
      sharpness: 'Unknown',
      lighting: 'Unknown',
      framing: 'Unknown',
      notes: [],
    },
    marketingUses: [],
    suggestedTags: [],
    suggestedContentThemes: [],
    userReview: createEmptyReview(),
  }
}

function normalizeMediaAnalysis(value: MediaAnalysis): MediaAnalysis {
  return {
    ...value,
    visualObservations: Array.isArray(value.visualObservations) ? value.visualObservations : [],
    detectedSubjects: Array.isArray(value.detectedSubjects) ? value.detectedSubjects : [],
    detectedActions: Array.isArray(value.detectedActions) ? value.detectedActions : [],
    detectedFoodItems: Array.isArray(value.detectedFoodItems) ? value.detectedFoodItems : [],
    detectedBusinessElements: Array.isArray(value.detectedBusinessElements) ? value.detectedBusinessElements : [],
    detectedEventSignals: Array.isArray(value.detectedEventSignals) ? value.detectedEventSignals : [],
    marketingUses: Array.isArray(value.marketingUses) ? value.marketingUses : [],
    representativeFrames: Array.isArray(value.representativeFrames) ? value.representativeFrames : undefined,
    suggestedTags: Array.isArray(value.suggestedTags) ? value.suggestedTags : [],
    suggestedContentThemes: Array.isArray(value.suggestedContentThemes) ? value.suggestedContentThemes : [],
    userReview: {
      reviewStatus: value.userReview?.reviewStatus ?? 'Not Reviewed',
      approvedSuggestionIds: Array.isArray(value.userReview?.approvedSuggestionIds) ? uniqueValues(value.userReview.approvedSuggestionIds) : [],
      rejectedSuggestionIds: Array.isArray(value.userReview?.rejectedSuggestionIds) ? uniqueValues(value.userReview.rejectedSuggestionIds) : [],
      userAddedTags: Array.isArray(value.userReview?.userAddedTags) ? uniqueValues(value.userReview.userAddedTags) : [],
      userEditedFields: value.userReview?.userEditedFields && typeof value.userReview.userEditedFields === 'object' ? value.userReview.userEditedFields : {},
      reviewedAt: value.userReview?.reviewedAt,
    },
  }
}

function isMediaAnalysis(value: unknown): value is MediaAnalysis {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MediaAnalysis>
  return typeof candidate.id === 'string' &&
    typeof candidate.mediaId === 'string' &&
    typeof candidate.analysisVersion === 'string' &&
    typeof candidate.sourceFingerprint === 'string'
}

function isMediaAnalysisError(value: unknown): value is MediaAnalysisError {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value && 'retryable' in value)
}

function createAnalysisFailure(code: MediaAnalysisErrorCode, message: string, retryable: boolean): MediaAnalysisError {
  return { code, message, retryable }
}

function createEmptyReview(): MediaAnalysisReview {
  return {
    reviewStatus: 'Not Reviewed',
    approvedSuggestionIds: [],
    rejectedSuggestionIds: [],
    userAddedTags: [],
    userEditedFields: {},
  }
}

function getAllSuggestionIds(analysis: MediaAnalysis) {
  return [
    ...analysis.visualObservations,
    ...analysis.detectedSubjects,
    ...analysis.detectedActions,
    ...analysis.detectedFoodItems,
    ...analysis.detectedBusinessElements,
    ...analysis.detectedEventSignals,
    ...analysis.marketingUses,
    ...(analysis.representativeFrames ?? []),
    ...analysis.suggestedTags,
    ...analysis.suggestedContentThemes,
  ].map((item) => item.id)
}

function inferSuggestedCategory(
  foodItems: DetectedFoodItem[],
  businessElements: DetectedBusinessElement[],
  actions: DetectedAction[]
) {
  if (foodItems.some((item) => item.label === 'Pizza')) return 'Pizza'
  if (foodItems.some((item) => item.label === 'Charcuterie' || item.label === 'Grazing Table')) return 'Charcuterie'
  if (actions.some((item) => item.label === 'Setting Up')) return 'Behind the Scenes'
  if (businessElements.some((item) => item.label === 'Fireova Oven')) return 'Oven & Fire'
  return undefined
}

function createObservation(mediaId: string, statement: string, confidence: MediaAnalysisConfidence, evidenceNote: string, source: MediaAnalysisSource): VisualObservation {
  return {
    id: createStableId(`${mediaId}:observation:${statement}`),
    statement,
    confidence,
    evidenceNote,
    source,
  }
}

function createSuggestion<TLabel extends string>(
  mediaId: string,
  label: TLabel,
  confidence: MediaAnalysisConfidence,
  evidenceNote: string,
  source: MediaAnalysisSource
): ReviewableSuggestion<TLabel> {
  return {
    id: createStableId(`${mediaId}:suggestion:${label}`),
    label,
    confidence,
    evidenceNote,
    source,
  }
}

function createMarketingUse(
  mediaId: string,
  use: SuggestedMarketingUseLabel,
  rationale: string,
  confidence: MediaAnalysisConfidence,
  relevantActiveGoals: string[],
  relevantServices: string[]
): SuggestedMarketingUse {
  return {
    id: createStableId(`${mediaId}:marketing-use:${use}`),
    use,
    rationale,
    confidence,
    relevantActiveGoals,
    relevantServices,
  }
}

function createMediaAnalysisId(mediaId: string) {
  return `media-analysis-${mediaId}`
}

function createStableId(value: string) {
  return `ma-${hashStableValue(value)}`
}

function matchesText(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = getKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueValues<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function hashStableValue(value: unknown) {
  const json = JSON.stringify(value, (_key, nestedValue) => {
    if (!nestedValue || typeof nestedValue !== 'object' || Array.isArray(nestedValue)) return nestedValue
    return Object.keys(nestedValue)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (nestedValue as Record<string, unknown>)[key]
        return acc
      }, {})
  })
  let hash = 0

  for (let index = 0; index < json.length; index += 1) {
    hash = (hash << 5) - hash + json.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}
