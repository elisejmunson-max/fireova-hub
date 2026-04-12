'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const LS_REVIEW_KEY   = 'fireova_review_posts'
const LS_APPROVED_KEY = 'fireova_approved_posts'

export default function ApprovalBanner() {
  const [reviewCount,   setReviewCount]   = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const review   = JSON.parse(localStorage.getItem(LS_REVIEW_KEY)   ?? '[]') as string[]
      const approved = JSON.parse(localStorage.getItem(LS_APPROVED_KEY) ?? '[]') as string[]
      setReviewCount(review.length)
      setApprovedCount(approved.length)
    } catch {}
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="space-y-4">
      {/* Needs approval callout */}
      {reviewCount > 0 && (
        <Link
          href="/content-bank?folder=needs-approval"
          className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 hover:border-amber-300 transition-colors group"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <ClockIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {reviewCount} post{reviewCount !== 1 ? 's' : ''} waiting for approval
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Review and approve before scheduling to the calendar.
            </p>
          </div>
          <span className="text-xs font-medium text-amber-700 group-hover:text-amber-900 flex-shrink-0">
            Review →
          </span>
        </Link>
      )}

      {/* Pipeline cards row */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/content-bank?folder=needs-approval"
          className="card p-5 hover:border-amber-200 transition-colors group"
        >
          <p className="text-xs text-stone-500 mb-3">Needs Approval</p>
          <p className="text-3xl font-semibold text-amber-600 group-hover:text-amber-700 transition-colors">
            {reviewCount}
          </p>
          <p className="text-xs text-stone-400 mt-2">awaiting review</p>
        </Link>

        <Link
          href="/content-bank?folder=approved"
          className="card p-5 hover:border-emerald-200 transition-colors group"
        >
          <p className="text-xs text-stone-500 mb-3">Approved</p>
          <p className="text-3xl font-semibold text-emerald-600 group-hover:text-emerald-700 transition-colors">
            {approvedCount}
          </p>
          <p className="text-xs text-stone-400 mt-2">ready to schedule</p>
        </Link>
      </div>
    </div>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
