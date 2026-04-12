import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_COLORS, PILLAR_COLORS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import SocialStats from './social-stats'
import ApprovalBanner from './approval-banner'

export const metadata: Metadata = { title: 'Dashboard' }

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch posts
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const allPosts: Post[] = posts ?? []
  const recentPosts = allPosts.slice(0, 5)

  // Fetch media count
  const { count: mediaCount } = await supabase.from('media_assets').select('*', { count: 'exact', head: true })

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-stone-400 mb-1">{formatToday()}</p>
            <h1 className="text-xl font-semibold text-stone-900">{getGreeting()}.</h1>
            <p className="text-stone-500 text-sm mt-0.5">Here's what's cooking at Fireova.</p>
          </div>
          <Link href="/create" className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            Create Post
          </Link>
        </div>
      </div>

      <div className="page-content space-y-8">

        {/* Social media */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Social Following</h2>
            <span className="text-[11px] text-stone-400">Click any number to update</span>
          </div>
          <SocialStats />
        </section>

        {/* Content pipeline */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Content Pipeline</h2>

          {/* Approval banner + Needs Approval / Approved cards (client, reads localStorage) */}
          <ApprovalBanner />

        </section>

        {/* Quick access */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/media-bank" className="card p-5 flex items-center gap-4 hover:border-stone-300 transition-colors group">
              <div className="bg-blue-50 rounded-lg p-2.5 flex-shrink-0">
                <MediaIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900 group-hover:text-ember-700 transition-colors">Media Bank</p>
                <p className="text-xs text-stone-500 mt-0.5">{mediaCount ?? 0} asset{(mediaCount ?? 0) !== 1 ? 's' : ''}</p>
              </div>
            </Link>
            <Link href="/create" className="card p-5 flex items-center gap-4 hover:border-stone-300 transition-colors group">
              <div className="bg-ember-50 rounded-lg p-2.5 flex-shrink-0">
                <FlameIcon className="w-5 h-5 text-ember-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900 group-hover:text-ember-700 transition-colors">New Post</p>
                <p className="text-xs text-stone-500 mt-0.5">Build something that feels like Fireova</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Recent posts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Recent Posts</h2>
            {allPosts.length > 0 && (
              <Link href="/content-bank" className="text-xs text-ember-600 hover:text-ember-700 font-medium">
                View all
              </Link>
            )}
          </div>

          {recentPosts.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="card overflow-hidden">
              <div className="divide-y divide-stone-100">
                {recentPosts.map((post) => (
                  <Link
                    key={post.id}
                    href="/content-bank"
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-stone-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate group-hover:text-ember-700 transition-colors">
                        {post.title}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">{formatDate(post.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`badge ${PILLAR_COLORS[post.pillar] ?? 'bg-stone-100 text-stone-600'}`}>
                        {post.pillar}
                      </span>
                      <span className="text-xs text-stone-400 hidden sm:block">{post.format}</span>
                      <span className={`badge ${STATUS_COLORS[post.status]}`}>{post.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-ember-50 flex items-center justify-center mx-auto mb-4">
        <FlameIcon className="w-6 h-6 text-ember-500" />
      </div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1">No posts yet</h3>
      <p className="text-sm text-stone-500 mb-5 max-w-xs mx-auto">
        Fire up your first post. Build something that feels like Fireova, not a template.
      </p>
      <Link href="/create" className="btn-primary">
        <PlusIcon className="w-4 h-4" />
        Create your first post
      </Link>
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
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  )
}
function MediaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

