import {
  readLocalPostStatuses,
  writeLocalPostStatuses,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import {
  readContentBankDraftStatuses,
  writeContentBankDraftStatuses,
} from '@/lib/local-fireova-content-bank'

export const LOCAL_FIREOVA_SCHEDULE_KEY = 'fireova-marketing-hub-schedule-v1'

export type LocalScheduleSource = 'event' | 'content-library'
export type LocalSchedulePlatform = 'Instagram' | 'Facebook' | 'Instagram + Facebook' | 'Other'

export type LocalScheduledPost = {
  id: string
  source: LocalScheduleSource
  draftId: string
  eventId?: string
  contentBankItemId?: string
  scheduledDate: string
  scheduledTime: string
  scheduledPlatform: LocalSchedulePlatform
  schedulingNotes: string
  createdAt: string
  updatedAt: string
}

export type LocalScheduleInput = {
  source: LocalScheduleSource
  draftId: string
  eventId?: string
  contentBankItemId?: string
  scheduledDate: string
  scheduledTime?: string
  scheduledPlatform?: LocalSchedulePlatform
  schedulingNotes?: string
}

export function readLocalScheduledPosts(): LocalScheduledPost[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(LOCAL_FIREOVA_SCHEDULE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const normalized = parsed
      .filter(isScheduledPost)
      .map(normalizeScheduledPost)
      .filter((post) => post.scheduledDate)

    if (normalized.length !== parsed.length || normalized.some((post, index) => hasScheduleMigration(post, parsed[index]))) {
      writeLocalScheduledPosts(normalized)
    }

    return normalized
  } catch {
    return []
  }
}

export function writeLocalScheduledPosts(posts: LocalScheduledPost[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_FIREOVA_SCHEDULE_KEY, JSON.stringify(posts.map(normalizeScheduledPost)))
}

export function getLocalScheduleForDraft(source: LocalScheduleSource, draftId: string, eventId?: string) {
  return readLocalScheduledPosts().find((post) => isSameScheduledDraft(post, { source, draftId, eventId })) ?? null
}

export function upsertLocalDraftSchedule(input: LocalScheduleInput) {
  if (typeof window === 'undefined') return null

  const now = new Date().toISOString()
  const current = readLocalScheduledPosts()
  const existing = current.find((post) => isSameScheduledDraft(post, input))
  const nextPost = normalizeScheduledPost({
    id: existing?.id ?? `schedule-${Date.now()}-${crypto.randomUUID()}`,
    source: input.source,
    draftId: input.draftId,
    eventId: input.eventId,
    contentBankItemId: input.contentBankItemId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime ?? existing?.scheduledTime ?? '',
    scheduledPlatform: input.scheduledPlatform ?? existing?.scheduledPlatform ?? 'Instagram + Facebook',
    schedulingNotes: input.schedulingNotes ?? existing?.schedulingNotes ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  writeLocalScheduledPosts([
    nextPost,
    ...current.filter((post) => !isSameScheduledDraft(post, input)),
  ])
  setScheduledStatus(input, 'Scheduled')
  return nextPost
}

export function removeLocalDraftSchedule(source: LocalScheduleSource, draftId: string, eventId?: string) {
  if (typeof window === 'undefined') return

  writeLocalScheduledPosts(readLocalScheduledPosts().filter((post) => !isSameScheduledDraft(post, { source, draftId, eventId })))
  setScheduledStatus({ source, draftId, eventId }, 'Approved')
}

function setScheduledStatus(input: Pick<LocalScheduleInput, 'source' | 'draftId' | 'eventId'>, status: LocalPostDraftStatus) {
  if (input.source === 'event') {
    if (!input.eventId) return
    writeLocalPostStatuses(input.eventId, {
      ...readLocalPostStatuses(input.eventId),
      [input.draftId]: status,
    })
    return
  }

  writeContentBankDraftStatuses({
    ...readContentBankDraftStatuses(),
    [input.draftId]: status,
  })
}

function isSameScheduledDraft(post: LocalScheduledPost, input: Pick<LocalScheduleInput, 'source' | 'draftId' | 'eventId'>) {
  if (post.source !== input.source || post.draftId !== input.draftId) return false
  if (post.source === 'event') return post.eventId === input.eventId
  return true
}

function normalizeScheduledPost(post: LocalScheduledPost): LocalScheduledPost {
  return {
    id: typeof post.id === 'string' && post.id.trim() ? post.id : `schedule-${Date.now()}-${crypto.randomUUID()}`,
    source: post.source === 'event' ? 'event' : 'content-library',
    draftId: typeof post.draftId === 'string' ? post.draftId : '',
    eventId: typeof post.eventId === 'string' && post.eventId.trim() ? post.eventId : undefined,
    contentBankItemId: typeof post.contentBankItemId === 'string' && post.contentBankItemId.trim() ? post.contentBankItemId : undefined,
    scheduledDate: normalizeDate(post.scheduledDate),
    scheduledTime: typeof post.scheduledTime === 'string' ? post.scheduledTime : '',
    scheduledPlatform: normalizePlatform(post.scheduledPlatform),
    schedulingNotes: typeof post.schedulingNotes === 'string' ? post.schedulingNotes : '',
    createdAt: typeof post.createdAt === 'string' && post.createdAt ? post.createdAt : new Date().toISOString(),
    updatedAt: typeof post.updatedAt === 'string' && post.updatedAt ? post.updatedAt : new Date().toISOString(),
  }
}

function isScheduledPost(value: unknown): value is LocalScheduledPost {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as LocalScheduledPost).draftId === 'string' &&
    typeof (value as LocalScheduledPost).scheduledDate === 'string'
  )
}

function normalizeDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function normalizePlatform(value: unknown): LocalSchedulePlatform {
  if (value === 'Instagram' || value === 'Facebook' || value === 'Instagram + Facebook' || value === 'Other') return value
  return 'Instagram + Facebook'
}

function hasScheduleMigration(normalized: LocalScheduledPost, source: unknown) {
  const original = source as Partial<LocalScheduledPost>
  return normalized.scheduledDate !== original.scheduledDate || normalized.scheduledPlatform !== original.scheduledPlatform
}
