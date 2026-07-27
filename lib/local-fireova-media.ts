import type { MockMedia } from '@/lib/mock-fireova-content'

const DB_NAME = 'fireova-marketing-hub-media'
const DB_VERSION = 2
const STORE_NAME = 'media'
const MEDIA_SRC_PREFIX = 'fireova-idb-media://'
const POSTER_SRC_PREFIX = 'fireova-idb-poster://'

type StoredFireovaMedia = {
  id: string
  name: string
  kind: MockMedia['type']
  mimeType: string
  blob: Blob
  posterBlob?: Blob
  createdAt: string
}

export type BrowserRepresentativeFrame = {
  id: string
  mediaId: string
  timestampSeconds: number
  localAssetReference: string
  perceptualKey?: string
  analysisStatus: 'Ready for Review' | 'Failed'
}

export type CreateVideoRepresentativeFramesInput = {
  mediaId: string
  src: string
  maxFrames?: number
  thumbnailMaxDimension?: number
  jpegQuality?: number
}

export function isIndexedDbMediaSrc(src: string) {
  return src.startsWith(MEDIA_SRC_PREFIX) || src.startsWith(POSTER_SRC_PREFIX)
}

export function createIndexedDbMediaSrc(mediaId: string) {
  return `${MEDIA_SRC_PREFIX}${mediaId}`
}

export function createIndexedDbPosterSrc(mediaId: string) {
  return `${POSTER_SRC_PREFIX}${mediaId}`
}

export async function saveIndexedDbMediaFile(file: File, kind: MockMedia['type']): Promise<MockMedia> {
  const id = `${kind}-${Date.now()}-${crypto.randomUUID()}`
  const blob = createTypedUploadBlob(file)
  const posterBlob = kind === 'video' ? await createVideoPosterBlob(blob) : undefined
  const db = await openMediaDb()

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({
      id,
      name: file.name,
      kind,
      mimeType: blob.type,
      blob,
      posterBlob,
      createdAt: new Date().toISOString(),
    } satisfies StoredFireovaMedia)
    await waitForTransaction(transaction)
  } finally {
    db.close()
  }

  return {
    id,
    type: kind,
    src: `${MEDIA_SRC_PREFIX}${id}`,
    posterSrc: posterBlob ? `${POSTER_SRC_PREFIX}${id}` : undefined,
    alt: file.name,
  }
}

export function getUploadFileMediaKind(file: File): MockMedia['type'] {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('image/')) return 'photo'
  if (/\.(mp4|mov|m4v|avi|webm)$/i.test(file.name)) return 'video'
  return 'photo'
}

export function createUploadPreviewUrl(file: File) {
  return URL.createObjectURL(createTypedUploadBlob(file))
}

export async function resolveIndexedDbMediaObjectUrl(src: string) {
  if (!isIndexedDbMediaSrc(src)) return src

  const id = src.replace(MEDIA_SRC_PREFIX, '').replace(POSTER_SRC_PREFIX, '')
  const db = await openMediaDb()
  const record = await runStoreRequest<StoredFireovaMedia | undefined>(
    db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
  )
  db.close()

  if (!record) return ''

  const blob = src.startsWith(POSTER_SRC_PREFIX) ? record.posterBlob : record.blob
  return blob ? URL.createObjectURL(blob) : ''
}

export async function createVideoRepresentativeFrames({
  mediaId,
  src,
  maxFrames = 8,
  thumbnailMaxDimension = 640,
  jpegQuality = 0.78,
}: CreateVideoRepresentativeFramesInput): Promise<BrowserRepresentativeFrame[]> {
  if (typeof document === 'undefined') return []

  const frameCount = Math.max(1, Math.min(maxFrames, 8))
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true

  try {
    await loadVideoMetadata(video, src)

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    const timestamps = pickRepresentativeTimestamps(duration, frameCount)
    const frames: BrowserRepresentativeFrame[] = []
    const seen = new Set<string>()

    for (const timestamp of timestamps) {
      const frame = await captureVideoFrame(video, mediaId, timestamp, thumbnailMaxDimension, jpegQuality)
      if (frame.perceptualKey && seen.has(frame.perceptualKey)) continue

      if (frame.perceptualKey) seen.add(frame.perceptualKey)
      frames.push(frame)
    }

    return frames
  } finally {
    video.removeAttribute('src')
    video.load()
    if (src.startsWith('blob:')) URL.revokeObjectURL(src)
  }
}

export async function deleteIndexedDbMedia(media: MockMedia[]) {
  const ids = media
    .map((item) => item.src)
    .filter(isIndexedDbMediaSrc)
    .map((src) => src.replace(MEDIA_SRC_PREFIX, '').replace(POSTER_SRC_PREFIX, ''))

  if (ids.length === 0) return

  const db = await openMediaDb()
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    ids.forEach((id) => store.delete(id))
    await waitForTransaction(transaction)
  } finally {
    db.close()
  }
}

export async function deleteIndexedDbMediaByIds(mediaIds: string[]) {
  const ids = Array.from(new Set(mediaIds.filter(Boolean)))
  if (ids.length === 0) return

  const db = await openMediaDb()
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    ids.forEach((id) => store.delete(id))
    await waitForTransaction(transaction)
  } finally {
    db.close()
  }
}

export function isSupportedEventUploadFile(file: File) {
  if (file.name.startsWith('.') || file.name === '.DS_Store') return false
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true

  return /\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|m4v|avi|webm)$/i.test(file.name)
}

function createTypedUploadBlob(file: File) {
  const mimeType = getUploadFileMimeType(file)
  return file.type === mimeType ? file : new Blob([file], { type: mimeType })
}

function getUploadFileMimeType(file: File) {
  if (file.type) return file.type

  if (/\.mov$/i.test(file.name)) return 'video/quicktime'
  if (/\.m4v$/i.test(file.name)) return 'video/x-m4v'
  if (/\.mp4$/i.test(file.name)) return 'video/mp4'
  if (/\.avi$/i.test(file.name)) return 'video/x-msvideo'
  if (/\.webm$/i.test(file.name)) return 'video/webm'
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg'
  if (/\.png$/i.test(file.name)) return 'image/png'
  if (/\.webp$/i.test(file.name)) return 'image/webp'
  if (/\.gif$/i.test(file.name)) return 'image/gif'
  if (/\.heic$/i.test(file.name)) return 'image/heic'
  if (/\.heif$/i.test(file.name)) return 'image/heif'

  return 'application/octet-stream'
}

function openMediaDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser context.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open media database.'))
    request.onblocked = () => reject(new Error('Media database upgrade is blocked by another open tab. Close other Fireova tabs and retry.'))
  })
}

function runStoreRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Media database transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Media database transaction was aborted.'))
  })
}

function loadVideoMetadata(video: HTMLVideoElement, src: string) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Video metadata timed out.'))
    }, 8000)
    const finish = (error?: Error) => {
      if (settled) return

      settled = true
      window.clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }

    video.onloadedmetadata = () => finish()
    video.onerror = () => finish(new Error('Video metadata could not be loaded.'))
    video.src = src
  })
}

function pickRepresentativeTimestamps(duration: number, maxFrames: number) {
  if (!duration || duration <= 0.25) return [0]

  const safeStart = Math.min(0.5, duration * 0.1)
  const safeEnd = Math.max(safeStart, duration - Math.min(0.5, duration * 0.1))
  const count = Math.min(maxFrames, duration < 8 ? 5 : 8)

  if (count <= 1) return [safeStart]

  return Array.from({ length: count }, (_item, index) => {
    const ratio = index / (count - 1)
    return Number((safeStart + (safeEnd - safeStart) * ratio).toFixed(2))
  })
}

function captureVideoFrame(
  video: HTMLVideoElement,
  mediaId: string,
  timestampSeconds: number,
  thumbnailMaxDimension: number,
  jpegQuality: number
) {
  return new Promise<BrowserRepresentativeFrame>((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Video frame capture timed out.'))
    }, 8000)
    const finish = (frame?: BrowserRepresentativeFrame, error?: Error) => {
      if (settled) return

      settled = true
      window.clearTimeout(timeout)
      video.onseeked = null
      video.onerror = null
      if (error) reject(error)
      else if (frame) resolve(frame)
    }

    video.onseeked = () => {
      const scale = Math.min(1, thumbnailMaxDimension / Math.max(video.videoWidth || thumbnailMaxDimension, video.videoHeight || thumbnailMaxDimension))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round((video.videoWidth || thumbnailMaxDimension) * scale))
      canvas.height = Math.max(1, Math.round((video.videoHeight || thumbnailMaxDimension) * scale))
      const context = canvas.getContext('2d')

      if (!context) {
        finish(undefined, new Error('Canvas context could not be created.'))
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const perceptualKey = createCanvasPerceptualKey(context, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) {
          finish(undefined, new Error('Video frame thumbnail could not be created.'))
          return
        }

        finish({
          id: `frame-${mediaId}-${String(Math.round(timestampSeconds * 1000)).padStart(8, '0')}`,
          mediaId,
          timestampSeconds,
          localAssetReference: URL.createObjectURL(blob),
          perceptualKey,
          analysisStatus: 'Ready for Review',
        })
      }, 'image/jpeg', jpegQuality)
    }
    video.onerror = () => finish(undefined, new Error('Video frame could not be decoded.'))

    try {
      video.currentTime = timestampSeconds
    } catch (error) {
      finish(undefined, error instanceof Error ? error : new Error('Video frame seek failed.'))
    }
  })
}

function createCanvasPerceptualKey(context: CanvasRenderingContext2D, width: number, height: number) {
  const sampleWidth = 8
  const sampleHeight = 8
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = sampleWidth
  sampleCanvas.height = sampleHeight
  const sampleContext = sampleCanvas.getContext('2d')
  if (!sampleContext) return undefined

  sampleContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, sampleWidth, sampleHeight)
  const data = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data
  const buckets: string[] = []

  for (let index = 0; index < data.length; index += 16) {
    const red = Math.round(data[index] / 32)
    const green = Math.round(data[index + 1] / 32)
    const blue = Math.round(data[index + 2] / 32)
    buckets.push(`${red}${green}${blue}`)
  }

  return buckets.join('-')
}

async function createVideoPosterBlob(file: Blob) {
  const url = URL.createObjectURL(file)

  try {
    return await new Promise<Blob | undefined>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      let settled = false

      const cleanup = () => {
        video.removeAttribute('src')
        video.load()
      }
      const finish = (blob?: Blob) => {
        if (settled) return

        settled = true
        cleanup()
        resolve(blob)
      }
      const captureFrame = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 640
        const context = canvas.getContext('2d')
        if (!context) {
          finish()
          return
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob ?? undefined), 'image/jpeg', 0.86)
      }

      video.onloadedmetadata = () => {
        if (video.duration && video.duration > 0.5) {
          video.currentTime = 0.5
          return
        }

        captureFrame()
      }
      video.onseeked = captureFrame
      video.onloadeddata = () => {
        if (!settled && (!video.duration || video.duration <= 0.5)) captureFrame()
      }
      video.onerror = () => finish()
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
