import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_COLORS, PILLAR_COLORS, PILLARS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import ContentBankFolders from './content-bank-folders'

export const metadata: Metadata = { title: 'Content Bank' }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface PageProps {
  searchParams: { status?: string; pillar?: string; format?: string }
}

export default async function ContentBankPage({ searchParams }: PageProps) {
  const supabase = createClient()

  let query = supabase.from('posts').select('*').order('created_at', { ascending: false })

  if (searchParams.status && ['draft', 'scheduled', 'published'].includes(searchParams.status)) {
    query = query.eq('status', searchParams.status)
  }
  if (searchParams.pillar && PILLARS.includes(searchParams.pillar as typeof PILLARS[number])) {
    query = query.eq('pillar', searchParams.pillar)
  }
  if (searchParams.format && ['Reel', 'Carousel', 'Photo'].includes(searchParams.format)) {
    query = query.eq('format', searchParams.format)
  }

  const { data, count } = await query
  const posts: Post[] = data ?? []

  const activeFilters = [
    searchParams.status && `Status: ${searchParams.status}`,
    searchParams.pillar && `Pillar: ${searchParams.pillar}`,
    searchParams.format && `Format: ${searchParams.format}`,
  ].filter(Boolean)

  return (
    <div>
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Content Bank</h1>
            <p className="text-stone-500 text-sm mt-0.5">
              {posts.length} post{posts.length !== 1 ? 's' : ''}
              {activeFilters.length > 0 && ` matching ${activeFilters.join(', ')}`}
            </p>
          </div>
          <Link href="/create" className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            New Post
          </Link>
        </div>
      </div>

      <div className="page-content space-y-4">
        {/* Filter bar */}
        <FilterBar searchParams={searchParams} />

        {posts.length === 0 ? (
          <EmptyState hasFilters={activeFilters.length > 0} />
        ) : (
          <ContentBankFolders posts={posts} />
        )}
      </div>
    </div>
  )
}


function FilterBar({ searchParams }: { searchParams: PageProps['searchParams'] }) {
  const statuses = ['draft', 'scheduled', 'published']
  const formats = ['Reel', 'Carousel', 'Photo']

  function buildHref(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams()
    const merged = { ...searchParams, ...updates }
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })
    const str = params.toString()
    return `/content-bank${str ? `?${str}` : ''}`
  }

  const hasFilters = searchParams.status || searchParams.pillar || searchParams.format

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status */}
      <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-1">
        <Link
          href={buildHref({ status: undefined })}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            !searchParams.status ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          All
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: searchParams.status === s ? undefined : s })}
            className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
              searchParams.status === s ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {/* Format */}
      <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-1">
        {formats.map((f) => (
          <Link
            key={f}
            href={buildHref({ format: searchParams.format === f ? undefined : f })}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              searchParams.format === f ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {f}
          </Link>
        ))}
      </div>

      {hasFilters && (
        <Link href="/content-bank" className="text-xs text-stone-400 hover:text-stone-700 px-2 py-1">
          Clear filters
        </Link>
      )}
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
        <ContentIcon className="w-6 h-6 text-stone-400" />
      </div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1">
        {hasFilters ? 'No posts match those filters' : 'Nothing in the bank yet'}
      </h3>
      <p className="text-sm text-stone-500 mb-5 max-w-xs mx-auto">
        {hasFilters
          ? 'Try adjusting your filters or clearing them to see all posts.'
          : 'Every great post starts with an idea. Start building yours.'}
      </p>
      {!hasFilters && (
        <Link href="/create" className="btn-primary">
          <PlusIcon className="w-4 h-4" />
          Create your first post
        </Link>
      )}
      {hasFilters && (
        <Link href="/content-bank" className="btn-secondary">
          Clear filters
        </Link>
      )}
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  )
}
