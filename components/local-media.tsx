'use client'

import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { isIndexedDbMediaSrc, resolveIndexedDbMediaObjectUrl } from '@/lib/local-fireova-media'
import type { MockMedia } from '@/lib/mock-fireova-content'

type LocalMediaProps = {
  media: MockMedia
  className?: string
  controls?: boolean
  muted?: boolean
  autoPlay?: boolean
  onEnded?: () => void
  videoRef?: Ref<HTMLVideoElement>
  style?: CSSProperties
  onUnavailable?: () => void
}

export default function LocalMedia({ media, className, controls = false, muted = true, autoPlay = false, onEnded, videoRef, style, onUnavailable }: LocalMediaProps) {
  const [src, setSrc] = useState(isIndexedDbMediaSrc(media.src) ? '' : media.src)
  const [poster, setPoster] = useState(media.posterSrc && !isIndexedDbMediaSrc(media.posterSrc) ? media.posterSrc : '')
  const [failed, setFailed] = useState(false)
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable

  useEffect(() => {
    let active = true
    let objectUrl = ''
    let posterObjectUrl = ''

    async function resolveMedia() {
      setFailed(false)

      try {
        const nextSrc = await resolveIndexedDbMediaObjectUrl(media.src)
        const nextPoster = media.posterSrc ? await resolveIndexedDbMediaObjectUrl(media.posterSrc) : ''

        if (!active) {
          revokeIfObjectUrl(nextSrc)
          revokeIfObjectUrl(nextPoster)
          return
        }

        if (!nextSrc) {
          setSrc('')
          setPoster('')
          setFailed(true)
          return
        }

        objectUrl = isIndexedDbMediaSrc(media.src) ? nextSrc : ''
        posterObjectUrl = media.posterSrc && isIndexedDbMediaSrc(media.posterSrc) ? nextPoster : ''
        setSrc(nextSrc)
        setPoster(nextPoster || '')
        setFailed(false)
      } catch {
        if (!active) return
        setSrc('')
        setPoster('')
        setFailed(true)
        onUnavailableRef.current?.()
      }
    }

    resolveMedia()

    return () => {
      active = false
      revokeIfObjectUrl(objectUrl)
      revokeIfObjectUrl(posterObjectUrl)
    }
  }, [media.posterSrc, media.src])

  if (failed) {
    return (
      <div
        className={`${className ?? ''} flex flex-col items-center justify-center bg-stone-100 px-4 text-center text-stone-500`}
        style={style}
        role="img"
        aria-label={`${media.alt} is unavailable`}
        data-media-id={media.id}
        data-media-type={media.type}
        data-media-state="unavailable"
      >
        <span aria-hidden="true" className="text-xl">{media.type === 'video' ? '▶' : '▧'}</span>
        <span className="mt-2 text-xs font-semibold">Media unavailable</span>
        <span className="mt-1 max-w-full truncate text-[10px]">{media.alt}</span>
      </div>
    )
  }

  if (media.type === 'video') {
    return (
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className={className}
        style={style}
        controls={controls}
        muted={muted}
        autoPlay={autoPlay}
        onEnded={onEnded}
        onError={() => { setFailed(true); onUnavailableRef.current?.() }}
        playsInline
        preload={poster ? 'metadata' : 'auto'}
        onLoadedData={(event) => {
          const video = event.currentTarget
          if (!poster && video.currentTime === 0 && Number.isFinite(video.duration) && video.duration > 0.2) {
            video.currentTime = Math.min(0.25, video.duration / 4)
          }
        }}
        data-media-id={media.id}
        data-media-type="video"
      />
    )
  }

  return <img src={src} alt={media.alt} className={className} style={style} loading="lazy" onError={() => { setFailed(true); onUnavailableRef.current?.() }} data-media-id={media.id} data-media-type="photo" />
}

function revokeIfObjectUrl(value: string) {
  if (value.startsWith('blob:')) {
    URL.revokeObjectURL(value)
  }
}
