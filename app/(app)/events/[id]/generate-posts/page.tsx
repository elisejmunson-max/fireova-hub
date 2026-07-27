'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function GeneratePostsRedirectPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const nextParams = new URLSearchParams({
      source: 'event',
      eventId: params.id,
    })
    if (searchParams?.get('regenerate') === '1') nextParams.set('regenerate', '1')
    router.replace(`/content-studio?${nextParams.toString()}`)
  }, [params.id, router, searchParams])

  return <div className="min-h-full bg-white" />
}
