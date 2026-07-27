'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function DraftComposerRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const ids = searchParams?.get('ids') ?? ''
    const angle = searchParams?.get('angle') ?? ''
    const params = new URLSearchParams({ source: 'media' })
    if (ids) params.set('ids', ids)
    if (angle) params.set('angle', angle)
    router.replace(`/content-studio?${params.toString()}`)
  }, [router, searchParams])

  return <div className="min-h-full bg-white" />
}
