import { deleteIndexedDbMediaByIds, saveIndexedDbMediaFile } from '@/lib/local-fireova-media'
import { readAllLocalGeneratedPosts, readLocalEvents, type LocalGeneratedPostDraft, type LocalPostDraftEdit, type LocalPostDraftStatus } from '@/lib/local-fireova-events'
import type { MockMedia } from '@/lib/mock-fireova-content'
import { createClient, supabaseConfigured } from '@/lib/supabase/client'
import type { Json } from '@/lib/types'

export const LOCAL_CONTENT_BANK_KEY = 'fireova-marketing-hub-content-bank-v1'
export const LOCAL_CONTENT_BANK_DRAFTS_KEY = 'fireova-marketing-hub-content-bank-drafts-v1'
export const LOCAL_CONTENT_BANK_DRAFT_STATUSES_KEY = 'fireova-marketing-hub-content-bank-draft-statuses-v1'
export const LOCAL_CONTENT_BANK_DRAFT_EDITS_KEY = 'fireova-marketing-hub-content-bank-draft-edits-v1'

export const CONTENT_BANK_CATEGORIES = [
  'Pizza',
  'Salads',
  'Charcuterie',
  'Small Bites',
  'Sides',
  'Desserts',
  'Cooking Process',
  'Oven & Fire',
  'Team',
  'Behind the Scenes',
  'Fireova Setup',
  'Brand',
  'Other',
] as const

export const CONTENT_BANK_THEMES = [
  'Pizza Cutting',
  'Fresh from the Oven',
  'Serving Guests',
  'Couple Moment',
  'Guest Experience',
  'Setup',
  'Behind the Scenes',
  'Team Action',
  'Buffet Line',
  'Pizza Stretch',
  'Slice Pull',
  'Table Detail',
] as const

const LEGACY_CATEGORY_TAGS: Record<string, string> = {
  Weddings: 'Wedding',
  Wedding: 'Wedding',
  'Private Events': 'Private Event',
  'Private Event': 'Private Event',
  'Corporate Events': 'Corporate Event',
  'Corporate Event': 'Corporate Event',
  Guests: 'Guests',
  Holiday: 'Holiday',
  Summer: 'Summer',
  Fall: 'Fall',
  Winter: 'Winter',
  Spring: 'Spring',
  Seasonal: 'Seasonal',
}

export const CONTENT_BANK_ANGLES = [
  'Food Feature',
  'Behind the Scenes',
  'Cooking Action',
  'Educational',
  'Team Spotlight',
  'Catering Promotion',
  'Seasonal',
  'Brand Awareness',
] as const

export type ContentBankCategory = typeof CONTENT_BANK_CATEGORIES[number]
export type ContentBankAngle = typeof CONTENT_BANK_ANGLES[number]
export type ContentBankTheme = typeof CONTENT_BANK_THEMES[number]
export type ContentBankMediaType = 'photo' | 'video'
export type ContentBankUsedStatus = 'Unused' | 'Used'
export type ContentBankOrientation = 'Portrait' | 'Landscape' | 'Square' | 'Unknown'
export type ContentBankSort = 'Newest' | 'Oldest' | 'Favorites' | 'Most Used' | 'Least Used' | 'Recently Used'
export type ContentBankMetadataReviewStatus = 'Needs Review' | 'Auto-suggested' | 'AI Suggested' | 'Approved' | 'Manually Edited'
export type ContentBankSuggestionSource = 'local' | 'ai' | 'manual' | 'imported'
export type ContentBankMetadataAnalysisProvider = 'local' | 'openai' | 'disabled'
export type ContentBankItemSourceType = 'event' | 'direct_upload' | 'media_library'

export type ContentBankMediaCreditSnapshot = {
  mediaId: string
  photographerCreditRequired: boolean
  photographerName: string
  photographerInstagram: string
  photographerWebsite: string
  creditText: string
  mediaType: ContentBankMediaType
}

export type LocalContentBankItem = {
  id: string
  mediaId: string
  mediaType: ContentBankMediaType
  originalFileName: string
  fileSize: number
  mimeType: string
  lastModified: number
  createdAt: string
  updatedAt: string
  capturedAt?: string
  title: string
  description: string
  category: ContentBankCategory
  contentTheme: string
  foodItems: string[]
  tags: string[]
  seasonTags: string[]
  platformTags: string[]
  orientation: ContentBankOrientation
  favorite: boolean
  archived: boolean
  usedStatus: ContentBankUsedStatus
  useCount: number
  lastUsedAt?: string
  notes: string
  photographerCreditRequired: boolean
  photographerName: string
  photographerInstagram: string
  photographerWebsite: string
  photographerNotes: string
  metadataReviewStatus: ContentBankMetadataReviewStatus
  suggestionSource?: ContentBankSuggestionSource
  metadataReasoning?: string
  aiAnalysisUnavailable?: boolean
  sourceType?: ContentBankItemSourceType
  sourceEventId?: string
  sourceEventName?: string
  sourceMediaLibraryId?: string
  storagePath?: string
  remoteUrl?: string
}

export type ContentBankFilters = {
  mediaType?: 'All' | ContentBankMediaType
  category?: 'All' | ContentBankCategory
  contentTheme?: 'All' | string
  favorite?: boolean
  used?: boolean
  unused?: boolean
  archived?: boolean
  season?: string
  platform?: string
  creditRequired?: boolean
}

export type ContentBankDuplicateMatch = {
  queued?: boolean
  existing?: LocalContentBankItem
  reason: string
}

export type ContentBankUploadMetadataSuggestion = {
  title?: string
  category?: ContentBankCategory
  contentTheme?: string
  menuItems?: string[]
  tags?: string[]
  description?: string
  reasoning?: string
  photographerCreditRequired?: boolean
  photographerName?: string
  photographerInstagram?: string
  photographerWebsite?: string
  photographerNotes?: string
}

export type ContentBankThemeSuggestionInput = {
  title?: string
  category?: ContentBankCategory
  contentTheme?: string
  menuItems?: string[]
  tags?: string[]
  description?: string
}

export type ContentBankInitialUploadMetadata = {
  title: string
  category: ContentBankCategory
  contentTheme: string
  foodItems: string[]
  tags: string[]
  description: string
  reasoning: string
  photographerCreditRequired: boolean
  photographerName: string
  photographerInstagram: string
  photographerWebsite: string
  photographerNotes: string
  suggestionSource: ContentBankSuggestionSource
  aiAnalysisUnavailable?: boolean
}

export type ContentBankMetadataAnalysisInput = {
  file: File
  provider?: ContentBankMetadataAnalysisProvider
  aiSuggestion?: ContentBankUploadMetadataSuggestion
}

export type ContentBankDraft = LocalGeneratedPostDraft & {
  source: 'Content Bank'
  contentBankItemIds: string[]
  sourceType?: 'Media Library'
  sourceId?: string
  sourceLabel?: string
  mediaItems?: MockMedia[]
  angle: ContentBankAngle
  mediaCredit?: ContentBankMediaCreditSnapshot
  mediaCreditText?: string
  context: {
    category: ContentBankCategory
    contentTheme: string
    foodItems: string[]
    tags: string[]
    seasonTags: string[]
    platformTags: string[]
    notes: string
    mediaType: ContentBankMediaType
  }
}

export function readAllContentBankItems(): LocalContentBankItem[] {
  if (typeof window === 'undefined') return []

  try {
    const rawItems = window.localStorage.getItem(LOCAL_CONTENT_BANK_KEY)
    if (!rawItems) return []

    const parsed = JSON.parse(rawItems)
    if (!Array.isArray(parsed)) return []

    const sourceItems = parsed.filter(isContentBankItem)
    const items = sourceItems.map(normalizeContentBankItem)

    if (items.some((item, index) => hasContentBankItemMigration(item, sourceItems[index]))) {
      writeContentBankItems(items)
    }

    return items
  } catch {
    return []
  }
}

export function readContentBankItem(id: string) {
  return readAllContentBankItems().find((item) => item.id === id) ?? null
}

export async function createContentBankItems(files: File[]) {
  const createdItems: LocalContentBankItem[] = []

  for (const file of files) {
    createdItems.push(await createContentBankItem(file))
  }

  return createdItems
}

export async function createContentBankItem(file: File) {
  const savedItem = await createContentBankItemRecord(file)
  return analyzeContentBankItemMetadata(savedItem.id, file)
}

export async function createContentBankItemRecord(file: File) {
  const mediaType = getContentBankFileMediaType(file)

  if (supabaseConfigured) {
    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Please sign in again before uploading media.')

    const itemId = `content-${Date.now()}-${crypto.randomUUID()}`
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
    const storagePath = `${user.id}/content-bank/${itemId}${extension}`
    const { error: uploadError } = await supabase.storage.from('media').upload(storagePath, file)
    if (uploadError) throw new Error(`Media upload failed: ${uploadError.message}`)

    const remoteUrl = supabase.storage.from('media').getPublicUrl(storagePath).data.publicUrl
    const now = new Date().toISOString()
    const item = normalizeContentBankItem({
      id: itemId,
      mediaId: itemId,
      mediaType,
      originalFileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
      createdAt: now,
      updatedAt: now,
      ...createInitialContentBankUploadMetadata(file),
      seasonTags: [],
      platformTags: [],
      orientation: 'Unknown',
      favorite: false,
      archived: false,
      usedStatus: 'Unused',
      useCount: 0,
      notes: '',
      metadataReviewStatus: 'Needs Review',
      sourceType: 'direct_upload',
      storagePath,
      remoteUrl,
    })

    const { error: recordError } = await supabase.from('content_bank_items').insert({
      id: item.id,
      user_id: user.id,
      storage_path: storagePath,
      data: item as unknown as Json,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    })
    if (recordError) {
      await supabase.storage.from('media').remove([storagePath])
      throw new Error(`Media metadata could not be saved: ${recordError.message}`)
    }

    writeContentBankItems([item, ...readAllContentBankItems()])
    return item
  }

  const media = await saveIndexedDbMediaFile(file, mediaType)
  const item = createItemFromMedia(file, media, createInitialContentBankUploadMetadata(file), { sourceType: 'direct_upload' })

  try {
    writeContentBankItems([item, ...readAllContentBankItems()])
  } catch (error) {
    await deleteIndexedDbMediaByIds([media.id]).catch(() => undefined)
    throw error
  }

  const savedItem = readContentBankItem(item.id)
  if (!savedItem) {
    await deleteIndexedDbMediaByIds([media.id]).catch(() => undefined)
    throw new Error('Media metadata could not be saved.')
  }

  return savedItem
}

export type AddEventMediaToContentBankInput = {
  eventId: string
  eventName: string
  media: MockMedia
  category?: ContentBankCategory
}

export type AddEventMediaToContentBankResult = {
  item: LocalContentBankItem
  created: boolean
}

export function addEventMediaToContentBank({
  eventId,
  eventName,
  media,
  category = 'Other',
}: AddEventMediaToContentBankInput): AddEventMediaToContentBankResult | null {
  if (typeof window === 'undefined') return null

  const mediaId = media.id || getMediaIdFromSrc(media.src)
  if (!mediaId) return null

  const existingItem = readAllContentBankItems().find((item) => item.mediaId === mediaId)
  if (existingItem) {
    const updatedItem = updateContentBankItem(existingItem.id, {
      sourceType: existingItem.sourceType ?? 'event',
      sourceEventId: existingItem.sourceEventId ?? eventId,
      sourceEventName: existingItem.sourceEventName ?? eventName,
    }) ?? existingItem

    return { item: updatedItem, created: false }
  }

  const now = new Date().toISOString()
  const item = normalizeContentBankItem({
    id: `content-${Date.now()}-${crypto.randomUUID()}`,
    mediaId,
    mediaType: media.type,
    originalFileName: media.alt || eventName,
    fileSize: 0,
    mimeType: media.type === 'video' ? 'video/*' : 'image/*',
    lastModified: Date.now(),
    createdAt: now,
    updatedAt: now,
    title: media.alt || eventName,
    description: '',
    category,
    contentTheme: '',
    foodItems: [],
    tags: [],
    seasonTags: [],
    platformTags: [],
    orientation: 'Unknown',
    favorite: false,
    archived: false,
    usedStatus: 'Unused',
    useCount: 0,
    notes: '',
    photographerCreditRequired: false,
    photographerName: '',
    photographerInstagram: '',
    photographerWebsite: '',
    photographerNotes: '',
    metadataReviewStatus: 'Needs Review',
    suggestionSource: 'imported',
    metadataReasoning: '',
    aiAnalysisUnavailable: false,
    sourceType: 'event',
    sourceEventId: eventId,
    sourceEventName: eventName,
  })

  writeContentBankItems([item, ...readAllContentBankItems()])
  return { item, created: true }
}

export async function analyzeContentBankItemMetadata(itemId: string, file: File) {
  const metadata = await analyzeMediaMetadata({ file, provider: isImageFileForAnalysis(file) ? 'openai' : 'local' })
  const updatedItem = updateContentBankItem(itemId, {
    title: metadata.title,
    description: metadata.description,
    category: metadata.category,
    contentTheme: metadata.contentTheme,
    foodItems: metadata.foodItems,
    tags: metadata.tags,
    photographerCreditRequired: metadata.photographerCreditRequired,
    photographerName: metadata.photographerName,
    photographerInstagram: metadata.photographerInstagram,
    photographerWebsite: metadata.photographerWebsite,
    photographerNotes: metadata.photographerNotes,
    metadataReviewStatus: getInitialMetadataReviewStatus(metadata),
    suggestionSource: metadata.suggestionSource,
    metadataReasoning: metadata.reasoning,
    aiAnalysisUnavailable: metadata.aiAnalysisUnavailable,
  })

  const savedItem = updatedItem ?? readContentBankItem(itemId)
  if (!savedItem) throw new Error('Saved media metadata could not be found.')

  return savedItem
}

function getContentBankFileMediaType(file: File): ContentBankMediaType {
  if (file.type.startsWith('video/')) return 'video'
  if (/\.(mp4|mov|m4v|avi|webm)$/i.test(file.name)) return 'video'
  return 'photo'
}

export function updateContentBankItem(id: string, updates: Partial<Omit<LocalContentBankItem, 'id' | 'mediaId' | 'createdAt'>>) {
  let updated: LocalContentBankItem | null = null
  const nextItems = readAllContentBankItems().map((item) => {
    if (item.id !== id) return item

    updated = normalizeContentBankItem({
      ...item,
      ...updates,
      id: item.id,
      mediaId: item.mediaId,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString(),
    })
    return updated
  })

  writeContentBankItems(nextItems)
  if (updated) void syncContentBankItemToSupabase(updated)
  return updated
}

export function updateContentBankItems(ids: string[], updates: Partial<Omit<LocalContentBankItem, 'id' | 'mediaId' | 'createdAt'>>) {
  const selectedIds = new Set(ids)
  const now = new Date().toISOString()
  const nextItems = readAllContentBankItems().map((item) =>
    selectedIds.has(item.id)
      ? normalizeContentBankItem({ ...item, ...updates, id: item.id, mediaId: item.mediaId, createdAt: item.createdAt, updatedAt: now })
      : item
  )
  writeContentBankItems(nextItems)
  nextItems.filter((item) => selectedIds.has(item.id)).forEach((item) => {
    void syncContentBankItemToSupabase(item)
  })
}

export function archiveContentBankItem(id: string) {
  return updateContentBankItem(id, { archived: true })
}

export function unarchiveContentBankItem(id: string) {
  return updateContentBankItem(id, { archived: false })
}

export async function deleteContentBankItemSafely(id: string) {
  const item = readContentBankItem(id)
  if (!item) return

  writeContentBankItems(readAllContentBankItems().filter((record) => record.id !== id))

  if (supabaseConfigured && item.storagePath) {
    const supabase = createClient()
    const { error: recordError } = await supabase.from('content_bank_items').delete().eq('id', id)
    if (recordError) throw new Error(`Could not delete media metadata: ${recordError.message}`)
    const { error: storageError } = await supabase.storage.from('media').remove([item.storagePath])
    if (storageError) throw new Error(`Could not delete stored media: ${storageError.message}`)
    return
  }

  if (!isMediaIdReferencedElsewhere(item.mediaId, id)) {
    await deleteIndexedDbMediaByIds([item.mediaId])
  }
}

export async function deleteContentBankItemsSafely(ids: string[]) {
  for (const id of ids) {
    await deleteContentBankItemSafely(id)
  }
}

export function detectLikelyDuplicate(file: File, existingItems = readAllContentBankItems(), queuedFiles: File[] = []): ContentBankDuplicateMatch | null {
  const signature = createFileSignature(file)
  const queuedDuplicate = queuedFiles.some((queuedFile) => createFileSignature(queuedFile) === signature)

  if (queuedDuplicate) {
    return { queued: true, reason: 'This exact file is already in the upload queue.' }
  }

  const existing = existingItems.find((item) => createItemSignature(item) === signature)
  return existing ? { existing, reason: 'Same file name, size, type, and last modified timestamp.' } : null
}

export function searchContentBankItems(items: LocalContentBankItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return items

  return items.filter((item) => {
    const haystack = [
      item.title,
      item.description,
      item.originalFileName,
      item.category,
      item.contentTheme,
      item.notes,
      item.photographerName,
      item.photographerInstagram,
      item.photographerWebsite,
      item.photographerNotes,
      item.sourceEventName,
      ...item.foodItems,
      ...item.tags,
      ...item.seasonTags,
      ...item.platformTags,
    ].join(' ').toLowerCase()

    return haystack.includes(normalizedQuery)
  })
}

export function filterContentBankItems(items: LocalContentBankItem[], filters: ContentBankFilters) {
  return items.filter((item) => {
    if (filters.mediaType && filters.mediaType !== 'All' && item.mediaType !== filters.mediaType) return false
    if (filters.category && filters.category !== 'All' && item.category !== filters.category) return false
    if (filters.contentTheme && filters.contentTheme !== 'All' && item.contentTheme.toLowerCase() !== filters.contentTheme.trim().toLowerCase()) return false
    if (filters.favorite && !item.favorite) return false
    if (filters.used && item.usedStatus !== 'Used') return false
    if (filters.unused && item.usedStatus !== 'Unused') return false
    if (!filters.archived && item.archived) return false
    if (filters.archived && !item.archived) return false
    if (filters.season && !item.seasonTags.includes(filters.season)) return false
    if (filters.platform && !item.platformTags.includes(filters.platform)) return false
    if (filters.creditRequired && !item.photographerCreditRequired) return false
    return true
  })
}

export function sortContentBankItems(items: LocalContentBankItem[], sort: ContentBankSort) {
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'Oldest':
        return Date.parse(a.createdAt) - Date.parse(b.createdAt)
      case 'Favorites':
        return Number(b.favorite) - Number(a.favorite) || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      case 'Most Used':
        return b.useCount - a.useCount || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      case 'Least Used':
        return a.useCount - b.useCount || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      case 'Recently Used':
        return Date.parse(b.lastUsedAt ?? '0') - Date.parse(a.lastUsedAt ?? '0')
      case 'Newest':
      default:
        return Date.parse(b.createdAt) - Date.parse(a.createdAt)
    }
  })
}

export function markContentBankItemUsed(id: string) {
  const item = readContentBankItem(id)
  if (!item) return null

  return updateContentBankItem(id, {
    usedStatus: 'Used',
    lastUsedAt: new Date().toISOString(),
  })
}

export function markContentBankItemUnused(id: string) {
  return updateContentBankItem(id, {
    usedStatus: 'Unused',
    lastUsedAt: undefined,
  })
}

export function incrementContentBankUseCount(ids: string[]) {
  const selectedIds = new Set(ids)
  const now = new Date().toISOString()
  const nextItems = readAllContentBankItems().map((item) =>
    selectedIds.has(item.id)
      ? { ...item, usedStatus: 'Used' as const, useCount: item.useCount + 1, lastUsedAt: now, updatedAt: now }
      : item
  )
  writeContentBankItems(nextItems)
}

export function getSelectedContentBankItems(ids: string[]) {
  const selectedIds = new Set(ids)
  return readAllContentBankItems().filter((item) => selectedIds.has(item.id))
}

export function isMediaIdReferencedElsewhere(mediaId: string, excludingContentBankItemId?: string) {
  const contentBankReference = readAllContentBankItems().some((item) => item.id !== excludingContentBankItemId && item.mediaId === mediaId)
  if (contentBankReference) return true

  const eventReference = readLocalEvents().some((event) => event.media.some((media) => media.id === mediaId || media.src.endsWith(mediaId)))
  if (eventReference) return true

  const eventDraftReference = Object.values(readAllLocalGeneratedPosts() as Record<string, LocalGeneratedPostDraft[]>).some((drafts) =>
    drafts.some((draft) => draft.media.id === mediaId || draft.media.src.endsWith(mediaId))
  )
  if (eventDraftReference) return true

  return readContentBankDrafts().some((draft) => draft.media.id === mediaId || draft.media.src.endsWith(mediaId))
}

export function createMockMediaForContentBankItem(item: LocalContentBankItem): MockMedia {
  return {
    id: item.mediaId,
    type: item.mediaType,
    src: item.remoteUrl || `fireova-idb-media://${item.mediaId}`,
    posterSrc: item.remoteUrl ? undefined : item.mediaType === 'video' ? `fireova-idb-poster://${item.mediaId}` : undefined,
    alt: getContentBankDisplayTitle(item),
  }
}

export async function hydrateContentBankFromSupabase() {
  if (!supabaseConfigured || typeof window === 'undefined') return readAllContentBankItems()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return readAllContentBankItems()

  const { data, error } = await supabase
    .from('content_bank_items')
    .select('data, storage_path')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`Could not load cloud media: ${error.message}`)

  const cloudItems = (data ?? [])
    .map((row) => ({ ...(row.data as unknown as LocalContentBankItem), storagePath: row.storage_path }))
    .filter(isContentBankItem)
    .map(normalizeContentBankItem)
  const cloudIds = new Set(cloudItems.map((item) => item.id))
  const localOnlyItems = readAllContentBankItems().filter((item) => !cloudIds.has(item.id) && !item.storagePath)
  const items = [...cloudItems, ...localOnlyItems]
  writeContentBankItems(items)
  return items
}

async function syncContentBankItemToSupabase(item: LocalContentBankItem) {
  if (!supabaseConfigured || !item.storagePath) return
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('content_bank_items').upsert({
    id: item.id,
    user_id: user.id,
    storage_path: item.storagePath,
    data: item as unknown as Json,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  })
  if (error && process.env.NODE_ENV !== 'production') {
    console.error('[content-bank] Cloud sync failed:', error.message)
  }
}

export function createDraftsFromContentBankItems(items: LocalContentBankItem[], angle: ContentBankAngle = 'Food Feature') {
  const drafts = items.map((item, index) => createContentBankDraft(item, angle, index))
  writeContentBankDrafts([...drafts, ...readContentBankDrafts()])
  incrementContentBankUseCount(items.map((item) => item.id))
  return drafts
}

export function createContentBankDraftFromStudio({
  items,
  angle,
  caption,
  hashtags,
  mediaCreditText,
}: {
  items: LocalContentBankItem[]
  angle: ContentBankAngle
  caption: string
  hashtags: string[]
  mediaCreditText?: string
}) {
  const primaryItem = items[0]
  if (!primaryItem) return null

  const draft = createContentBankDraft(primaryItem, angle, 0)
  const selectedIds = items.map((item) => item.id)
  const selectedMedia = items.map(createMockMediaForContentBankItem)
  const nextDraft: ContentBankDraft = {
    ...draft,
    id: `content-draft-${Date.now()}-${crypto.randomUUID()}`,
    caption: caption.trim(),
    hashtags,
    media: selectedMedia[0] ?? draft.media,
    mediaItems: selectedMedia,
    contentBankItemIds: selectedIds,
    sourceType: 'Media Library',
    sourceId: primaryItem.id,
    sourceLabel: getContentBankDisplayTitle(primaryItem),
    mediaCreditText,
  }

  writeContentBankDrafts([nextDraft, ...readContentBankDrafts()])
  incrementContentBankUseCount(selectedIds)
  return nextDraft
}

export function buildContentBankDraftPreview(item: LocalContentBankItem, angle: ContentBankAngle = 'Food Feature') {
  return createContentBankDraft(item, angle, 0)
}

export function readContentBankDrafts(): ContentBankDraft[] {
  if (typeof window === 'undefined') return []

  try {
    const rawDrafts = window.localStorage.getItem(LOCAL_CONTENT_BANK_DRAFTS_KEY)
    if (!rawDrafts) return []

    const parsed = JSON.parse(rawDrafts)
    if (!Array.isArray(parsed)) return []

    const sourceDrafts = parsed.filter(isContentBankDraft)
    const drafts = sourceDrafts.map(normalizeContentBankDraft)

    if (drafts.some((draft, index) => (
      draft.context.category !== sourceDrafts[index].context.category ||
      draft.context.contentTheme !== normalizeContentTheme(sourceDrafts[index].context.contentTheme) ||
      draft.context.tags.join('\u0000') !== normalizeStringArray(sourceDrafts[index].context.tags).join('\u0000')
    ))) {
      writeContentBankDrafts(drafts)
    }

    return drafts
  } catch {
    return []
  }
}

export function writeContentBankDrafts(drafts: ContentBankDraft[]) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_CONTENT_BANK_DRAFTS_KEY, JSON.stringify(drafts.map(normalizeContentBankDraft)))
}

export function updateContentBankDraft(draftId: string, updates: Partial<Pick<ContentBankDraft, 'caption' | 'hashtags' | 'mediaCreditText'>>) {
  const nextDrafts = readContentBankDrafts().map((draft) => draft.id === draftId ? { ...draft, ...updates } : draft)
  writeContentBankDrafts(nextDrafts)

  const currentEdits = readContentBankDraftEdits()
  const draft = nextDrafts.find((item) => item.id === draftId)
  if (draft) {
    writeContentBankDraftEdits({
      ...currentEdits,
      [draftId]: { caption: draft.caption, hashtags: draft.hashtags },
    })
  }
}

export function readContentBankDraftStatuses(): Record<string, LocalPostDraftStatus> {
  return readJsonRecord(LOCAL_CONTENT_BANK_DRAFT_STATUSES_KEY, isLocalPostDraftStatus)
}

export function writeContentBankDraftStatuses(statuses: Record<string, LocalPostDraftStatus>) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_CONTENT_BANK_DRAFT_STATUSES_KEY, JSON.stringify(statuses))
}

export function readContentBankDraftEdits(): Record<string, LocalPostDraftEdit> {
  if (typeof window === 'undefined') return {}

  try {
    const rawEdits = window.localStorage.getItem(LOCAL_CONTENT_BANK_DRAFT_EDITS_KEY)
    if (!rawEdits) return {}

    const parsed = JSON.parse(rawEdits)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, LocalPostDraftEdit>>((acc, [id, edit]) => {
      if (
        edit &&
        typeof edit === 'object' &&
        typeof (edit as LocalPostDraftEdit).caption === 'string' &&
        Array.isArray((edit as LocalPostDraftEdit).hashtags)
      ) {
        acc[id] = {
          caption: (edit as LocalPostDraftEdit).caption,
          hashtags: (edit as LocalPostDraftEdit).hashtags.filter((tag) => typeof tag === 'string'),
        }
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export function writeContentBankDraftEdits(edits: Record<string, LocalPostDraftEdit>) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_CONTENT_BANK_DRAFT_EDITS_KEY, JSON.stringify(edits))
}

function writeContentBankItems(items: LocalContentBankItem[]) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_CONTENT_BANK_KEY, JSON.stringify(items.map(normalizeContentBankItem)))
}

function createItemFromMedia(
  file: File,
  media: MockMedia,
  metadata: ContentBankInitialUploadMetadata,
  source?: Pick<LocalContentBankItem, 'sourceType' | 'sourceEventId' | 'sourceEventName'>
): LocalContentBankItem {
  const now = new Date().toISOString()

  return {
    id: `content-${Date.now()}-${crypto.randomUUID()}`,
    mediaId: media.id,
    mediaType: media.type,
    originalFileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    lastModified: file.lastModified,
    createdAt: now,
    updatedAt: now,
    title: metadata.title,
    description: metadata.description,
    category: metadata.category,
    contentTheme: metadata.contentTheme,
    foodItems: metadata.foodItems,
    tags: metadata.tags,
    seasonTags: [],
    platformTags: [],
    orientation: 'Unknown',
    favorite: false,
    archived: false,
    usedStatus: 'Unused',
    useCount: 0,
    notes: '',
    photographerCreditRequired: metadata.photographerCreditRequired,
    photographerName: metadata.photographerName,
    photographerInstagram: metadata.photographerInstagram,
    photographerWebsite: metadata.photographerWebsite,
    photographerNotes: metadata.photographerNotes,
    metadataReviewStatus: getInitialMetadataReviewStatus(metadata),
    suggestionSource: metadata.suggestionSource,
    metadataReasoning: metadata.reasoning,
    aiAnalysisUnavailable: metadata.aiAnalysisUnavailable,
    sourceType: source?.sourceType,
    sourceEventId: source?.sourceEventId,
    sourceEventName: source?.sourceEventName,
  }
}

export async function analyzeMediaMetadata({
  file,
  provider = 'local',
  aiSuggestion,
}: ContentBankMetadataAnalysisInput): Promise<ContentBankInitialUploadMetadata> {
  if (provider === 'disabled') return createInitialContentBankUploadMetadata(file)

  if (provider === 'openai') {
    try {
      const openAiSuggestion = await analyzeMediaWithServerProvider(file)
      return createInitialContentBankUploadMetadata(file, openAiSuggestion, 'ai')
    } catch {
      return createInitialContentBankUploadMetadata(file, undefined, 'local', true)
    }
  }

  return createInitialContentBankUploadMetadata(file, aiSuggestion)
}

async function analyzeMediaWithServerProvider(file: File): Promise<ContentBankUploadMetadataSuggestion> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/media/analyze', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(error?.error ?? 'Media analysis failed.')
  }

  return response.json() as Promise<ContentBankUploadMetadataSuggestion>
}

export function createInitialContentBankUploadMetadata(
  file: File,
  aiSuggestion?: ContentBankUploadMetadataSuggestion,
  suggestionSource: ContentBankSuggestionSource = 'local',
  aiAnalysisUnavailable = false
): ContentBankInitialUploadMetadata {
  const title = aiSuggestion?.title?.trim() || stripFileExtension(file.name)
  const category = normalizeContentBankCategory(aiSuggestion?.category)
  const foodItems = normalizeStringArray(aiSuggestion?.menuItems)
  const tags = normalizeStringArray(aiSuggestion?.tags)
  const contentTheme = getRecommendedContentTheme({
    title,
    category,
    contentTheme: aiSuggestion?.contentTheme,
    menuItems: foodItems,
    tags,
  })

  return {
    title,
    category,
    contentTheme,
    foodItems,
    tags,
    description: aiSuggestion?.description?.trim() ?? '',
    reasoning: aiSuggestion?.reasoning?.trim() ?? '',
    photographerCreditRequired: Boolean(aiSuggestion?.photographerCreditRequired),
    photographerName: aiSuggestion?.photographerName?.trim() ?? '',
    photographerInstagram: normalizeInstagramHandle(aiSuggestion?.photographerInstagram),
    photographerWebsite: aiSuggestion?.photographerWebsite?.trim() ?? '',
    photographerNotes: aiSuggestion?.photographerNotes ?? '',
    suggestionSource,
    aiAnalysisUnavailable,
  }
}

function isImageFileForAnalysis(file: File) {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)
}

export function getRecommendedContentTheme(input: ContentBankThemeSuggestionInput) {
  const savedTheme = normalizeContentTheme(input.contentTheme)
  if (savedTheme) return savedTheme

  return getContentThemeSuggestions(input)[0] ?? ''
}

export function getContentThemeSuggestions(input: ContentBankThemeSuggestionInput) {
  const category = input.category ?? 'Other'
  const title = input.title ?? ''
  const menuItems = input.menuItems ?? []
  const tags = input.tags ?? []
  const description = input.description ?? ''
  const haystack = [title, category, ...menuItems, ...tags, description].join(' ').toLowerCase()
  const suggestions: string[] = []
  const add = (value: string) => {
    if (!suggestions.some((item) => item.toLowerCase() === value.toLowerCase())) suggestions.push(value)
  }

  if (haystack.includes('grazing')) add('Grazing Table Detail')
  if (haystack.includes('salami rose') || haystack.includes('salami')) add('Salami Rose')
  if (haystack.includes('pizza cutting')) add('Pizza Cutting')
  if (haystack.includes('fresh from the oven') || haystack.includes('oven')) add('Fresh from the Oven')
  if (haystack.includes('serving guest') || haystack.includes('service')) add('Serving Guests')
  if (haystack.includes('team portrait') || haystack.includes('portrait')) add('Team Portrait')
  if (haystack.includes('team action') || haystack.includes('staff')) add('Team in Action')
  if (haystack.includes('appetizer') || haystack.includes('small bite')) add('Appetizer Close-Up')
  if (haystack.includes('passed')) add('Passed Bites')
  if (haystack.includes('buffet')) add('Buffet Detail')

  switch (category) {
    case 'Charcuterie':
      add('Charcuterie Detail')
      add('Salami Rose')
      add('Charcuterie Close-Up')
      add('Food Styling')
      add('Event Spread')
      break
    case 'Pizza':
      add('Pizza Cutting')
      add('Fresh from the Oven')
      add('Pizza Close-Up')
      add('Serving Guests')
      add('Wood-Fired Cooking')
      break
    case 'Team':
      add('Team Portrait')
      add('Team in Action')
      add('Behind the Scenes')
      add('Serving Guests')
      add('Event Setup')
      break
    case 'Small Bites':
      add('Appetizer Close-Up')
      add('Passed Bites')
      add('Food Styling')
      add('Plated Detail')
      break
    case 'Sides':
      add('Side Dish Feature')
      add('Buffet Detail')
      add('Food Close-Up')
      break
    case 'Salads':
      add('Salad Detail')
      add('Food Close-Up')
      add('Buffet Detail')
      break
    case 'Desserts':
      add('Dessert Detail')
      add('Food Styling')
      add('Plated Detail')
      break
    case 'Cooking Process':
      add('Wood-Fired Cooking')
      add('Behind the Scenes')
      add('Fresh Prep')
      break
    case 'Oven & Fire':
      add('Wood-Fired Cooking')
      add('Fresh from the Oven')
      add('Oven Detail')
      break
    case 'Fireova Setup':
      add('Event Setup')
      add('Behind the Scenes')
      add('Brand Detail')
      break
    case 'Behind the Scenes':
      add('Behind the Scenes')
      add('Team in Action')
      add('Event Setup')
      break
    case 'Brand':
      add('Brand Detail')
      add('Brand Awareness')
      add('Event Setup')
      break
    case 'Other':
      break
  }

  return suggestions
}

function createContentBankDraft(item: LocalContentBankItem, angle: ContentBankAngle, index: number): ContentBankDraft {
  const tags = uniqueStrings([...item.foodItems, ...item.tags])
  const caption = createCaption(item, angle)
  const mediaCredit = createMediaCreditSnapshot(item)

  return {
    id: `content-draft-${Date.now()}-${index}-${crypto.randomUUID()}`,
    source: 'Content Bank',
    contentBankItemIds: [item.id],
    sourceType: 'Media Library',
    sourceId: item.id,
    sourceLabel: getContentBankDisplayTitle(item),
    angle,
    tone: angle,
    caption,
    hashtags: createHashtags(item),
    media: createMockMediaForContentBankItem(item),
    mediaItems: [createMockMediaForContentBankItem(item)],
    mediaCredit,
    mediaCreditText: mediaCredit?.creditText,
    context: {
      category: item.category,
      contentTheme: item.contentTheme,
      foodItems: item.foodItems,
      tags,
      seasonTags: item.seasonTags,
      platformTags: item.platformTags,
      notes: item.notes,
      mediaType: item.mediaType,
    },
  }
}

function createCaption(item: LocalContentBankItem, angle: ContentBankAngle) {
  const food = item.foodItems[0] ?? (item.category !== 'Other' ? item.category.toLowerCase() : 'wood-fired favorites')
  const contentTheme = item.contentTheme.trim()
  const contentThemeLead = contentTheme ? `${contentTheme} in motion, ` : ''
  const notes = item.notes ? ` ${item.notes}` : ''

  switch (angle) {
    case 'Behind the Scenes':
      return `A little look behind the Fireova setup: ${contentThemeLead}fresh prep, live fire, and the details that make service feel easy.${notes}`.trim()
    case 'Cooking Action':
      return `Live-fire cooking is where the energy starts. ${contentThemeLead}${food} moving from prep to plate, with that Fireova finish.`.trim()
    case 'Educational':
      return `Good catering starts before the first slice is served. ${contentThemeLead}Here is one detail we care about: timing, heat, and ingredients working together.`.trim()
    case 'Team Spotlight':
      return `The Fireova crew makes the hard parts look calm: ${contentThemeLead}setup, service, and keeping the oven moving.`.trim()
    case 'Catering Promotion':
      return `Planning a gathering? Fireova brings the oven, the food, and the warm service that keeps guests coming back for another bite. ${contentThemeLead}`.trim()
    case 'Seasonal':
      return `Seasonal gatherings deserve food that feels fresh, warm, and easy to share. ${contentThemeLead}${food} is always a strong place to start.`.trim()
    case 'Brand Awareness':
      return `This is the Fireova rhythm: ${contentThemeLead}real ingredients, live fire, and catering that feels relaxed from the first plate to the last.`.trim()
    case 'Food Feature':
    default:
      return `Fresh, hot, and ready for the table. ${contentThemeLead}${capitalize(food)} is one of those details guests remember.`.trim()
  }
}

function createHashtags(item: LocalContentBankItem) {
  const rawTags = ['FireovaPizza', 'WoodFiredPizza', 'DFWCatering', item.category, item.contentTheme, ...item.foodItems, ...item.tags]
  return uniqueStrings(rawTags)
    .slice(0, 8)
    .map((tag) => `#${tag.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '')}`)
    .filter((tag) => tag.length > 1)
}

function normalizeContentBankItem(item: LocalContentBankItem): LocalContentBankItem {
  const photographerInstagram = normalizeInstagramHandle(item.photographerInstagram)
  const category = normalizeContentBankCategory(item.category)
  const legacyTag = getLegacyCategoryTag(item.category)
  const suggestionSource = normalizeSuggestionSource(item.suggestionSource)

  return {
    ...item,
    mediaType: item.mediaType === 'video' ? 'video' : 'photo',
    category,
    contentTheme: normalizeContentTheme(item.contentTheme),
    foodItems: normalizeStringArray(item.foodItems),
    tags: normalizeStringArray(legacyTag ? [...item.tags, legacyTag] : item.tags),
    seasonTags: normalizeStringArray(item.seasonTags),
    platformTags: normalizeStringArray(item.platformTags),
    favorite: Boolean(item.favorite),
    archived: Boolean(item.archived),
    usedStatus: item.useCount > 0 || item.usedStatus === 'Used' ? 'Used' : 'Unused',
    useCount: Number.isFinite(item.useCount) ? Math.max(0, item.useCount) : 0,
    notes: item.notes ?? '',
    title: item.title ?? '',
    description: item.description ?? '',
    orientation: item.orientation ?? 'Unknown',
    photographerCreditRequired: Boolean(item.photographerCreditRequired),
    photographerName: item.photographerName?.trim() ?? '',
    photographerInstagram,
    photographerWebsite: item.photographerWebsite?.trim() ?? '',
    photographerNotes: item.photographerNotes ?? '',
    metadataReviewStatus: normalizeMetadataReviewStatus(item.metadataReviewStatus, suggestionSource),
    suggestionSource,
    metadataReasoning: item.metadataReasoning?.trim() ?? '',
    aiAnalysisUnavailable: Boolean(item.aiAnalysisUnavailable),
    sourceType: normalizeContentBankItemSourceType(item.sourceType),
    sourceEventId: item.sourceEventId?.trim() || undefined,
    sourceEventName: item.sourceEventName?.trim() || undefined,
    sourceMediaLibraryId: item.sourceMediaLibraryId?.trim() || undefined,
  }
}

function normalizeContentBankItemSourceType(value: unknown): ContentBankItemSourceType | undefined {
  if (value === 'event' || value === 'direct_upload' || value === 'media_library') return value
  return undefined
}

function getMediaIdFromSrc(src: string) {
  const trimmed = src.trim()
  if (!trimmed) return ''
  const idbMediaPrefix = 'fireova-idb-media://'
  const idbPosterPrefix = 'fireova-idb-poster://'

  if (trimmed.startsWith(idbMediaPrefix)) return trimmed.slice(idbMediaPrefix.length)
  if (trimmed.startsWith(idbPosterPrefix)) return trimmed.slice(idbPosterPrefix.length)
  return ''
}

function normalizeMetadataReviewStatus(value: unknown, suggestionSource: ContentBankSuggestionSource): ContentBankMetadataReviewStatus {
  if (value === 'Approved' || value === 'Manually Edited') return value
  if (value === 'AI Suggested') return suggestionSource === 'ai' ? 'AI Suggested' : 'Auto-suggested'
  if (value === 'Auto-suggested') return value
  return 'Needs Review'
}

function normalizeSuggestionSource(value: unknown): ContentBankSuggestionSource {
  if (value === 'ai' || value === 'manual' || value === 'imported') return value
  return 'local'
}

function getInitialMetadataReviewStatus(metadata: ContentBankInitialUploadMetadata): ContentBankMetadataReviewStatus {
  if (metadata.aiAnalysisUnavailable) return 'Auto-suggested'
  if (!metadata.category.trim() || !metadata.contentTheme.trim()) return 'Needs Review'
  return metadata.suggestionSource === 'ai' ? 'AI Suggested' : 'Auto-suggested'
}

function normalizeContentBankDraft(draft: ContentBankDraft): ContentBankDraft {
  const normalizedCredit = draft.mediaCredit ? normalizeMediaCreditSnapshot(draft.mediaCredit) : undefined
  const legacyTag = getLegacyCategoryTag(draft.context.category)

  return {
    ...draft,
    mediaItems: Array.isArray(draft.mediaItems) && draft.mediaItems.length > 0 ? draft.mediaItems : [draft.media],
    sourceType: draft.sourceType ?? 'Media Library',
    sourceId: draft.sourceId ?? draft.contentBankItemIds[0],
    sourceLabel: draft.sourceLabel,
    mediaCredit: normalizedCredit,
    mediaCreditText: draft.mediaCreditText ?? normalizedCredit?.creditText,
    context: {
      ...draft.context,
      category: normalizeContentBankCategory(draft.context.category),
      contentTheme: normalizeContentTheme(draft.context.contentTheme),
      foodItems: normalizeStringArray(draft.context.foodItems),
      tags: normalizeStringArray(legacyTag ? [...draft.context.tags, legacyTag] : draft.context.tags),
      seasonTags: normalizeStringArray(draft.context.seasonTags),
      platformTags: normalizeStringArray(draft.context.platformTags),
      notes: draft.context.notes ?? '',
      mediaType: draft.context.mediaType === 'video' ? 'video' : 'photo',
    },
  }
}

function normalizeContentBankCategory(value: unknown): ContentBankCategory {
  if (value === 'Hot Sides') return 'Sides'
  if (typeof value === 'string' && CONTENT_BANK_CATEGORIES.includes(value as ContentBankCategory)) {
    return value as ContentBankCategory
  }

  return 'Other'
}

function normalizeContentTheme(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getLegacyCategoryTag(value: unknown) {
  return typeof value === 'string' ? LEGACY_CATEGORY_TAGS[value] : undefined
}

function hasContentBankItemMigration(item: LocalContentBankItem, sourceItem: LocalContentBankItem) {
  return (
    item.category !== sourceItem.category ||
    item.contentTheme !== normalizeContentTheme(sourceItem.contentTheme) ||
    item.tags.join('\u0000') !== normalizeStringArray(sourceItem.tags).join('\u0000')
  )
}

export function normalizeInstagramHandle(value: unknown) {
  if (typeof value !== 'string') return ''

  const handle = value.trim().replace(/^@+/, '').trim()
  return handle ? `@${handle}` : ''
}

export function createMediaCreditSnapshot(item: LocalContentBankItem): ContentBankMediaCreditSnapshot | undefined {
  const normalizedItem = normalizeContentBankItem(item)
  if (!normalizedItem.photographerCreditRequired) return undefined

  const creditText = createMediaCreditText(normalizedItem)

  return {
    mediaId: normalizedItem.mediaId,
    photographerCreditRequired: normalizedItem.photographerCreditRequired,
    photographerName: normalizedItem.photographerName,
    photographerInstagram: normalizedItem.photographerInstagram,
    photographerWebsite: normalizedItem.photographerWebsite,
    creditText,
    mediaType: normalizedItem.mediaType,
  }
}

export function createMediaCreditText(item: LocalContentBankItem | ContentBankMediaCreditSnapshot) {
  const mediaLabel = item.mediaType === 'video' ? 'Video' : 'Photo'
  const instagram = normalizeInstagramHandle(item.photographerInstagram)
  const name = item.photographerName?.trim() ?? ''
  const creditValue = [name, instagram].filter(Boolean).join(' · ') || item.photographerWebsite?.trim() || ''

  return creditValue ? `${mediaLabel}: ${creditValue}` : ''
}

function normalizeMediaCreditSnapshot(snapshot: ContentBankMediaCreditSnapshot): ContentBankMediaCreditSnapshot {
  const normalizedSnapshot = {
    ...snapshot,
    photographerCreditRequired: Boolean(snapshot.photographerCreditRequired),
    photographerName: snapshot.photographerName?.trim() ?? '',
    photographerInstagram: normalizeInstagramHandle(snapshot.photographerInstagram),
    photographerWebsite: snapshot.photographerWebsite?.trim() ?? '',
    mediaType: snapshot.mediaType === 'video' ? 'video' as const : 'photo' as const,
  }

  return {
    ...normalizedSnapshot,
    creditText: snapshot.creditText?.trim() || createMediaCreditText(normalizedSnapshot),
  }
}

function isContentBankItem(value: unknown): value is LocalContentBankItem {
  if (!value || typeof value !== 'object') return false

  const item = value as Partial<LocalContentBankItem>
  return (
    typeof item.id === 'string' &&
    typeof item.mediaId === 'string' &&
    (item.mediaType === 'photo' || item.mediaType === 'video') &&
    typeof item.originalFileName === 'string' &&
    typeof item.createdAt === 'string'
  )
}

function isContentBankDraft(value: unknown): value is ContentBankDraft {
  if (!value || typeof value !== 'object') return false

  const draft = value as Partial<ContentBankDraft>
  const context = draft.context as Partial<ContentBankDraft['context']> | undefined

  return (
    draft.source === 'Content Bank' &&
    typeof draft.id === 'string' &&
    typeof draft.caption === 'string' &&
    Array.isArray(draft.hashtags) &&
    Boolean(draft.media) &&
    Array.isArray(draft.contentBankItemIds) &&
    Boolean(context) &&
    typeof context?.category === 'string'
  )
}

function readJsonRecord<T extends string>(key: string, validator: (value: unknown) => value is T): Record<string, T> {
  if (typeof window === 'undefined') return {}

  try {
    const rawValue = window.localStorage.getItem(key)
    if (!rawValue) return {}

    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, T>>((acc, [id, value]) => {
      if (validator(value)) acc[id] = value
      return acc
    }, {})
  } catch {
    return {}
  }
}

function isLocalPostDraftStatus(value: unknown): value is LocalPostDraftStatus {
  return value === 'Draft' || value === 'Approved' || value === 'Skipped'
}

function createFileSignature(file: File) {
  return [normalizeFileName(file.name), file.size, file.type, file.lastModified].join('|')
}

function createItemSignature(item: LocalContentBankItem) {
  return [normalizeFileName(item.originalFileName), item.fileSize, item.mimeType, item.lastModified].join('|')
}

function normalizeFileName(fileName: string) {
  return fileName.trim().toLowerCase().replace(/\s+/g, ' ')
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value.filter((item): item is string => typeof item === 'string')) : []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function getContentBankDisplayTitle(item: Pick<LocalContentBankItem, 'title' | 'contentTheme' | 'foodItems' | 'category' | 'originalFileName'>) {
  return getUsefulContentBankTitle(item.title, item.originalFileName)
    || getUsefulContentBankTitle(item.contentTheme, item.originalFileName)
    || getUsefulContentBankTitle(item.foodItems[0], item.originalFileName)
    || (item.category && item.category !== 'Other' ? item.category : '')
    || 'Untitled Content'
}

export function getUsefulContentBankTitle(value?: string, originalFileName?: string) {
  const title = value?.trim() ?? ''
  if (!title) return ''
  if (title.toLowerCase() === 'untitled') return ''
  if (isFileNameLikeTitle(title, originalFileName)) return ''
  return title
}

function isFileNameLikeTitle(value: string, originalFileName?: string) {
  const normalized = normalizeTitleText(value)
  if (!normalized) return true

  const original = normalizeTitleText(originalFileName ?? '')
  const stem = normalizeTitleText((originalFileName ?? '').replace(/\.[^.]+$/, ''))
  if (original && (normalized === original || normalized === stem)) return true

  if (/^(img|image|dsc|dcim|pxl|vid|video|mov|screen shot|screenshot)[\s_-]*\d+/i.test(value.trim())) return true
  if (/\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|m4v)$/i.test(value.trim())) return true

  const words = normalized.split(' ').filter(Boolean)
  const hasMostlySeoTokens = words.length >= 4 && words.some((word) => ['photographer', 'photography', 'website', 'gallery', 'download', 'copy'].includes(word))
  if (hasMostlySeoTokens) return true

  return false
}

function normalizeTitleText(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
