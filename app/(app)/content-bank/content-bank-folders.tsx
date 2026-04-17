'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PILLAR_COLORS, STATUS_COLORS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import PostThumbnail from './post-thumbnail'
import { LS_APPROVED_KEY, LS_REVIEW_KEY, getSet, saveSet } from './approve-post-button'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

type FolderName = 'approved' | 'review' | 'drafts'

const LS_FEEDBACK_KEY = 'fireova_post_feedback'

export default function ContentBankFolders({ posts }: { posts: Post[] }) {
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set())
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({})
  const [openFolders, setOpenFolders] = useState<Set<FolderName>>(new Set(['approved', 'review', 'drafts']))

  useEffect(() => {
    setApprovedIds(getSet(LS_APPROVED_KEY))
    setReviewIds(getSet(LS_REVIEW_KEY))
    try {
      const raw = localStorage.getItem(LS_FEEDBACK_KEY)
      setFeedbackMap(raw ? JSON.parse(raw) : {})
    } catch {}
  }, [])

  function submitForReview(postId: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const review = getSet(LS_REVIEW_KEY)
    const approved = getSet(LS_APPROVED_KEY)
    if (review.has(postId)) {
      review.delete(postId)
    } else {
      review.add(postId)
      approved.delete(postId) // can't be in both
      saveSet(LS_APPROVED_KEY, approved)
      setApprovedIds(new Set(approved))
    }
    saveSet(LS_REVIEW_KEY, review)
    setReviewIds(new Set(review))
  }

  function approvePost(postId: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const approved = getSet(LS_APPROVED_KEY)
    const review = getSet(LS_REVIEW_KEY)
    if (approved.has(postId)) {
      approved.delete(postId)
    } else {
      approved.add(postId)
      review.delete(postId) // move out of review
      saveSet(LS_REVIEW_KEY, review)
      setReviewIds(new Set(review))
    }
    saveSet(LS_APPROVED_KEY, approved)
    setApprovedIds(new Set(approved))
  }

  function toggleFolder(name: FolderName) {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const approvedPosts = posts.filter((p) => approvedIds.has(p.id))
  const draftPosts = posts.filter((p) => !approvedIds.has(p.id))

  const folders: { name: FolderName; label: string; posts: Post[]; color: string; desc: string }[] = [
    {
      name: 'approved',
      label: 'Approved',
      posts: approvedPosts,
      color: 'text-emerald-600',
      desc: 'Ready to schedule',
    },
    {
      name: 'drafts',
      label: 'Drafts',
      posts: draftPosts,
      color: 'text-stone-500',
      desc: 'Still being written',
    },
  ]

  return (
    <div className="space-y-3">
      {folders.map(({ name, label, posts: folderPosts, color, desc }) => (
        <div key={name} className="card overflow-hidden">
          {/* Folder header */}
          <button
            onClick={() => toggleFolder(name)}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-stone-50 transition-colors text-left"
          >
            <FolderIcon open={openFolders.has(name)} className={`w-4 h-4 ${color}`} />
            <span className="text-sm font-semibold text-stone-800">{label}</span>
            <span className="text-xs text-stone-400">{desc}</span>
            <span className="ml-auto text-xs font-medium text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {folderPosts.length}
            </span>
          </button>

          {/* Posts */}
          {openFolders.has(name) && folderPosts.length > 0 && (
            <div className="border-t border-stone-100 divide-y divide-stone-100">
              {folderPosts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  folder={name}
                  feedback={feedbackMap[post.id] ?? ''}
                  onSubmitReview={(e) => submitForReview(post.id, e)}
                  onApprove={(e) => approvePost(post.id, e)}
                />
              ))}
            </div>
          )}

          {openFolders.has(name) && folderPosts.length === 0 && (
            <div className="border-t border-stone-100 px-5 py-4 text-xs text-stone-400">
              {name === 'drafts' ? (
                <Link href="/quick-post" className="text-ember-600 hover:text-ember-700 font-medium">
                  + Create a new post
                </Link>
              ) : (
                `No posts in ${label.toLowerCase()} yet.`
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PostRow({
  post,
  folder,
  feedback,
  onSubmitReview,
  onApprove,
}: {
  post: Post
  folder: FolderName
  feedback: string
  onSubmitReview: (e: React.MouseEvent) => void
  onApprove: (e: React.MouseEvent) => void
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
      {/* Action button */}
      <div className="flex-shrink-0 pt-1">
        {folder === 'drafts' && (
          <button
            onClick={onApprove}
            title="Approve for scheduling"
            className="px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors whitespace-nowrap"
          >
            Approve
          </button>
        )}
        {folder === 'approved' && (
          <button
            onClick={onApprove}
            title="Move back to drafts"
            className="w-7 h-7 rounded-full bg-emerald-500 border border-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
          >
            <CheckIcon />
          </button>
        )}
      </div>

      {/* Post content link */}
      <Link href={`/content-bank/${post.id}`} className="flex items-start gap-3 flex-1 min-w-0">
        <PostThumbnail thumbnailUrl={post.thumbnail_url} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`badge ${PILLAR_COLORS[post.pillar] ?? 'bg-stone-100 text-stone-600'}`}>
              {post.pillar}
            </span>
            <span className="text-xs text-stone-400">{post.format}</span>
          </div>
          <p className="text-sm font-medium text-stone-900 truncate">{post.title}</p>
          {(post.caption_option1 || post.topic) && (
            <p className="text-xs text-stone-500 mt-0.5 truncate">{post.caption_option1 || post.topic}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <span className={`badge ${STATUS_COLORS[post.status]}`}>{post.status}</span>
          <p className="text-xs text-stone-400 mt-1">{formatDate(post.created_at)}</p>
        </div>
      </Link>
    </div>
  )
}

function FolderIcon({ open, className }: { open: boolean; className?: string }) {
  return open ? (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  ) : (
    <svg className={className} fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function FeedbackIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  )
}
