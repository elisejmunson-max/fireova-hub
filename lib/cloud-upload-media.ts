'use client'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-msvideo',
])

export type PreparedCloudUpload = {
  file: File
  originalName: string
  originalMimeType: string
  detectedMimeType: string
  convertedFrom?: string
  thumbnail?: File
}

function extensionMimeType(name: string) {
  if (/\.hei[cf]$/i.test(name)) return /\.heif$/i.test(name) ? 'image/heif' : 'image/heic'
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.mov$/i.test(name)) return 'video/quicktime'
  if (/\.m4v$/i.test(name)) return 'video/x-m4v'
  if (/\.mp4$/i.test(name)) return 'video/mp4'
  if (/\.webm$/i.test(name)) return 'video/webm'
  if (/\.avi$/i.test(name)) return 'video/x-msvideo'
  return ''
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

export async function detectCloudUploadMimeType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) {
    return 'image/png'
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'AVI ') return 'video/x-msvideo'
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'image/gif'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm'

  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase()
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic'
    if (['heif', 'mif1', 'msf1'].includes(brand)) return 'image/heif'
    if (brand === 'qt  ') return 'video/quicktime'
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'm4v '].includes(brand)) return 'video/mp4'
  }

  const reported = file.type.toLowerCase()
  if (reported && reported !== 'application/octet-stream') return reported
  return extensionMimeType(file.name) || 'application/octet-stream'
}

export async function prepareCloudUploadFile(file: File): Promise<PreparedCloudUpload> {
  const detectedMimeType = await detectCloudUploadMimeType(file)
  const originalMimeType = file.type || 'application/octet-stream'

  if (detectedMimeType === 'image/heic' || detectedMimeType === 'image/heif') {
    try {
      const heic2any = (await import('heic2any')).default
      const typedSource = file.type === detectedMimeType
        ? file
        : new Blob([file], { type: detectedMimeType })
      const result = await heic2any({
        blob: typedSource,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      const jpeg = Array.isArray(result) ? result[0] : result
      if (!jpeg) throw new Error('The converter returned no image.')
      const jpegName = file.name.replace(/\.hei[cf]$/i, '') + '.jpg'
      return {
        file: new File([jpeg], jpegName, {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        }),
        originalName: file.name,
        originalMimeType,
        detectedMimeType,
        convertedFrom: detectedMimeType,
        thumbnail: await createImageThumbnail(new File([jpeg], jpegName, { type: 'image/jpeg' })),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown conversion error.'
      throw new Error(`HEIC conversion failed for ${file.name}: ${message}`)
    }
  }

  if (!ALLOWED_IMAGE_TYPES.has(detectedMimeType) && !ALLOWED_VIDEO_TYPES.has(detectedMimeType)) {
    throw new Error(`Unsupported file type for ${file.name}: ${detectedMimeType}`)
  }

  const normalizedFile = file.type === detectedMimeType
      ? file
      : new File([file], file.name, { type: detectedMimeType, lastModified: file.lastModified })
  const thumbnail = detectedMimeType.startsWith('image/')
    ? await createImageThumbnail(normalizedFile)
    : await createVideoPoster(normalizedFile)

  return {
    file: normalizedFile,
    originalName: file.name,
    originalMimeType,
    detectedMimeType,
    thumbnail,
  }
}

async function createImageThumbnail(file: File) {
  if (typeof document === 'undefined') return undefined
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return canvasJpeg(image, image.naturalWidth, image.naturalHeight, `${file.name}-thumbnail.jpg`)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createVideoPoster(file: File) {
  if (typeof document === 'undefined') return undefined
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<File | undefined>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      let settled = false
      const finish = (poster?: File) => {
        if (settled) return
        settled = true
        video.removeAttribute('src')
        video.load()
        resolve(poster)
      }
      const capture = () => finish(canvasJpeg(video, video.videoWidth, video.videoHeight, `${file.name}-poster.jpg`))
      video.onloadedmetadata = () => {
        if (video.duration > 0.5) video.currentTime = 0.5
        else capture()
      }
      video.onseeked = capture
      video.onloadeddata = () => { if (!settled && video.duration <= 0.5) capture() }
      video.onerror = () => finish()
      window.setTimeout(() => finish(), 8000)
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  name: string
) {
  if (!sourceWidth || !sourceHeight) return undefined
  const maximum = 960
  const scale = Math.min(1, maximum / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (character) => character.charCodeAt(0))
  return new File([bytes], name, { type: 'image/jpeg' })
}
