'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface NavItem {
  href: string
  label: string
  icon: (p: { className?: string }) => JSX.Element
  badge?: string
}

interface NavSubGroup {
  subGroup: string
  items: NavItem[]
}

interface NavGroup {
  label: string
  collapsible: boolean
  children: (NavItem | NavSubGroup)[]
}

interface SidebarProps {
  user: User
}

const navGroups: NavGroup[] = [
  {
    label: 'Marketing',
    collapsible: true,
    children: [
      { href: '/media-bank', label: 'Media Bank', icon: MediaIcon },
      {
        subGroup: 'Social Media',
        items: [
          { href: '/quick-post', label: 'Create New Post', icon: QuickPostIcon },
          { href: '/content-bank', label: 'Content Bank', icon: ContentIcon },
          { href: '/calendar', label: 'Calendar', icon: CalendarIcon },
          { href: '/pillars', label: 'Pillars', icon: PillarsIcon },
        ],
      },
      {
        subGroup: 'Hiring Ads',
        items: [],
      },
      {
        subGroup: 'Promotions',
        items: [],
      },
    ],
  },
  {
    label: 'Operations',
    collapsible: true,
    children: [
      { href: '/recipes', label: 'Recipes', icon: RecipesIcon },
      { href: '/training', label: 'Training Manuals', icon: TrainingIcon },
      { href: '/events', label: 'Events & Pack Lists', icon: EventsIcon },
    ],
  },
  {
    label: 'Settings',
    collapsible: true,
    children: [
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

function isSubGroup(item: NavItem | NavSubGroup): item is NavSubGroup {
  return 'subGroup' in item
}

function allHrefsInGroup(group: NavGroup): string[] {
  return group.children.flatMap((child) =>
    isSubGroup(child) ? child.items.map((i) => i.href) : [child.href]
  )
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  }

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = user.email?.split('@')[0] ?? 'You'
  const initial = displayName.charAt(0).toUpperCase()

  function NavLink({ href, label, icon: Icon, badge, indent }: NavItem & { indent?: boolean }) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 rounded-lg font-medium transition-colors ${
          indent ? 'pl-7 pr-3 py-1.5 text-xs' : 'px-3 py-2.5 text-sm'
        } ${active ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'}`}
      >
        <Icon className={`flex-shrink-0 ${indent ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${active ? 'text-ember-400' : 'text-stone-500'}`} />
        {label}
        {badge && (
          <span className="ml-auto text-xs font-medium text-ember-400 bg-ember-950/60 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-ember-600 flex items-center justify-center flex-shrink-0">
            <FlameIcon className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">Fireova Hub</p>
            <p className="text-stone-500 text-xs mt-0.5">Content OS</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto sidebar-nav">
        {navGroups.map((group) => {
          const groupCollapsed = !!collapsedGroups[group.label]
          const hrefs = allHrefsInGroup(group)
          const hasActiveItem = hrefs.some((href) => isActive(href))

          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-stone-200 hover:text-white hover:bg-stone-800/40 transition-colors group"
              >
                <span className="text-sm font-bold tracking-wide">{group.label}</span>
                <svg
                  className={`w-3.5 h-3.5 text-stone-600 group-hover:text-stone-400 transition-transform duration-200 ${groupCollapsed ? '-rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {!groupCollapsed && (
                <div className="space-y-0.5 mt-0.5">
                  {group.children.map((child, i) => {
                    if (isSubGroup(child)) {
                      const subKey = `${group.label}::${child.subGroup}`
                      const subCollapsed = !!collapsedGroups[subKey]
                      const subHasActive = child.items.some((item) => isActive(item.href))

                      return (
                        <div key={subKey}>
                          <button
                            onClick={() => toggleGroup(subKey)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 transition-colors group/sub"
                          >
                            <div className="flex items-center gap-3">
                              <FolderIcon className={`w-4 h-4 flex-shrink-0 ${subHasActive ? 'text-ember-400' : 'text-stone-500'}`} />
                              <span className="text-sm font-medium">{child.subGroup}</span>
                            </div>
                            <svg
                              className={`w-3 h-3 text-stone-600 group-hover/sub:text-stone-400 transition-transform duration-200 ${subCollapsed ? '-rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {!subCollapsed && (
                            <div className="space-y-0.5 mt-0.5">
                              {child.items.map((item) => (
                                <NavLink key={item.href} {...item} indent />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return <NavLink key={child.href} {...child} />
                  })}
                </div>
              )}

              {groupCollapsed && hasActiveItem && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-ember-500" />
              )}
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-stone-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-ember-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-300 text-xs font-medium truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-stone-500 hover:text-stone-300 hover:bg-stone-800/60 text-sm transition-colors"
        >
          <SignOutIcon className="w-4 h-4" />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 bg-stone-950 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-ember-600 flex items-center justify-center">
            <FlameIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">Fireova Hub</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-stone-400 hover:text-white p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <CloseIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed top-0 left-0 bottom-0 z-40 w-64 bg-stone-950 pt-14">
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  )
}

// Icons
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}

function QuickPostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" />
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

function MediaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function RecipesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  )
}

function TrainingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function PillarsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
