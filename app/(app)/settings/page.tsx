'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BRAND_VOICE_OPTIONS,
  GOAL_GROUPS,
  createCustomGoal,
  createProfileItem,
  getActiveGoals,
  readBusinessProfile,
  writeBusinessProfile,
  type BusinessDetails,
  type BusinessGoal,
  type BusinessProfile,
  type ProfileListItem,
} from '@/lib/local-fireova-business-profile'

type ListKey = 'services' | 'idealClients' | 'brandPriorities'

export default function SettingsPage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [savedState, setSavedState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [newValues, setNewValues] = useState<Record<ListKey | 'goals', string>>({
    services: '',
    idealClients: '',
    brandPriorities: '',
    goals: '',
  })
  const loadedRef = useRef(false)

  useEffect(() => {
    setProfile(readBusinessProfile())
    loadedRef.current = true
  }, [])

  useEffect(() => {
    if (!profile || !loadedRef.current) return

    setSavedState('saving')
    const timeout = window.setTimeout(() => {
      writeBusinessProfile(profile)
      setSavedState('saved')
      window.setTimeout(() => setSavedState('idle'), 1800)
    }, 450)

    return () => window.clearTimeout(timeout)
  }, [profile])

  function updateProfile(updater: (current: BusinessProfile) => BusinessProfile) {
    setProfile((current) => current ? updater(current) : current)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (!profile) {
    return (
      <div className="min-h-full bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-[18px] bg-stone-50 p-6 ring-1 ring-stone-100">
          <p className="text-sm font-semibold text-stone-950">Loading Business Profile</p>
        </div>
      </div>
    )
  }

  const activeGoals = getActiveGoals(profile)

  return (
    <div className="min-h-full bg-white pb-12">
      <header className="px-5 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Business Profile</p>
            <h1 className="mt-2 text-[34px] font-semibold leading-tight text-stone-950 sm:text-5xl">
              Setting up your marketing
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-6 text-stone-500">
              Tell the app what you sell, who you serve, and what matters most right now. Recommendations will use this profile.
            </p>
          </div>
          <SaveState state={savedState} />
        </div>
      </header>

      <main className="px-5 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-7">
          <BusinessDetailsSection
            details={profile.businessDetails}
            onChange={(businessDetails) => updateProfile((current) => ({ ...current, businessDetails }))}
          />

          <EditableProfileList
            eyebrow="Services We Offer"
            title="Services"
            description="Choose the services Marketing should consider when recommending content."
            items={profile.services}
            newValue={newValues.services}
            placeholder="Add a service"
            onNewValueChange={(value) => setNewValues((current) => ({ ...current, services: value }))}
            onAdd={() => addListItem('services')}
            onChange={(items) => updateList('services', items)}
          />

          <EditableProfileList
            eyebrow="Ideal Clients"
            title="Ideal Clients"
            description="Choose the types of clients and events you want Marketing to prioritize."
            items={profile.idealClients}
            newValue={newValues.idealClients}
            placeholder="Add an ideal client"
            onNewValueChange={(value) => setNewValues((current) => ({ ...current, idealClients: value }))}
            onAdd={() => addListItem('idealClients')}
            onChange={(items) => updateList('idealClients', items)}
          />

          <GoalsSection
            goals={profile.goals}
            activeGoals={activeGoals}
            newGoal={newValues.goals}
            onNewGoalChange={(value) => setNewValues((current) => ({ ...current, goals: value }))}
            onAddGoal={addCustomGoal}
            onChange={(goals) => updateProfile((current) => ({ ...current, goals: normalizeGoalPriorities(goals) }))}
          />

          <VoiceSection
            selected={profile.brandVoice}
            onChange={(brandVoice) => updateProfile((current) => ({ ...current, brandVoice }))}
          />

          <EditableProfileList
            eyebrow="Brand Priorities"
            title="What should shape the work"
            description="Put the most important business outcomes first."
            items={profile.brandPriorities}
            newValue={newValues.brandPriorities}
            placeholder="Add a priority"
            onNewValueChange={(value) => setNewValues((current) => ({ ...current, brandPriorities: value }))}
            onAdd={() => addListItem('brandPriorities')}
            onChange={(items) => updateList('brandPriorities', items)}
          />

          <section className="rounded-[18px] bg-stone-50 p-5 ring-1 ring-stone-100">
            <h2 className="text-lg font-semibold text-stone-950">Account</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">Sign out when you are finished working.</p>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-4 inline-flex min-h-[42px] items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-red-600 ring-1 ring-red-100"
            >
              Sign out
            </button>
          </section>
        </div>
      </main>
    </div>
  )

  function updateList(key: ListKey, items: ProfileListItem[]) {
    updateProfile((current) => ({
      ...current,
      [key]: normalizeListOrders(items),
    }))
  }

  function addListItem(key: ListKey) {
    const label = newValues[key].trim()
    if (!label) return

    updateProfile((current) => ({
      ...current,
      [key]: [
        ...current[key],
        createProfileItem(label, current[key].length),
      ],
    }))
    setNewValues((current) => ({ ...current, [key]: '' }))
  }

  function addCustomGoal() {
    const label = newValues.goals.trim()
    if (!label) return

    updateProfile((current) => {
      const nextPriority = getActiveGoals(current).length
      return {
        ...current,
        goals: normalizeGoalPriorities([...current.goals, createCustomGoal(label, nextPriority)]),
      }
    })
    setNewValues((current) => ({ ...current, goals: '' }))
  }
}

function BusinessDetailsSection({
  details,
  onChange,
}: {
  details: BusinessDetails
  onChange: (details: BusinessDetails) => void
}) {
  function updateField(key: keyof BusinessDetails, value: string) {
    onChange({ ...details, [key]: value })
  }

  return (
    <section className="rounded-[22px] bg-white p-5 ring-1 ring-stone-200 sm:p-6">
      <SectionIntro eyebrow="Business Details" title="Who is this business?" description="The basics Marketing should know before making recommendations." />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TextField label="Business Name" value={details.businessName} onChange={(value) => updateField('businessName', value)} />
        <TextField label="Primary Service Area" value={details.primaryServiceArea} onChange={(value) => updateField('primaryServiceArea', value)} placeholder="DFW, Denton, North Texas" />
        <TextField label="Website" value={details.website} onChange={(value) => updateField('website', value)} placeholder="https://" />
        <TextField label="Instagram" value={details.instagram} onChange={(value) => updateField('instagram', value)} placeholder="@handle" />
        <TextField label="Facebook" value={details.facebook} onChange={(value) => updateField('facebook', value)} placeholder="Facebook page" />
        <label className="sm:col-span-2">
          <span className="mb-2 block text-sm font-semibold text-stone-700">Business Description</span>
          <textarea
            value={details.businessDescription}
            onChange={(event) => updateField('businessDescription', event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm leading-6 text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-ember-400"
            placeholder="Describe what the business does and what makes it different."
          />
        </label>
      </div>
    </section>
  )
}

function EditableProfileList({
  eyebrow,
  title,
  description,
  items,
  newValue,
  placeholder,
  onNewValueChange,
  onAdd,
  onChange,
}: {
  eyebrow: string
  title: string
  description: string
  items: ProfileListItem[]
  newValue: string
  placeholder: string
  onNewValueChange: (value: string) => void
  onAdd: () => void
  onChange: (items: ProfileListItem[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function updateItem(itemId: string, updates: Partial<ProfileListItem>) {
    onChange(items.map((current) => current.id === itemId ? { ...current, ...updates } : current))
  }

  function deleteItem(item: ProfileListItem) {
    if (!window.confirm(`Delete '${item.label}' from this section?`)) return

    setOpenMenuId(null)
    onChange(items.filter((current) => current.id !== item.id))
  }

  function handleAdd() {
    onAdd()
    setAdding(false)
  }

  return (
    <section className="rounded-[22px] bg-white p-5 ring-1 ring-stone-200 sm:p-6">
      <SectionIntro eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-6 max-w-3xl space-y-2">
        {items.map((item, index) => (
          <ProfileListRow
            key={item.id}
            item={item}
            editing={editingId === item.id}
            menuOpen={openMenuId === item.id}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            onStartEdit={() => {
              setEditingId(item.id)
              setOpenMenuId(null)
            }}
            onCancelEdit={() => setEditingId(null)}
            onUpdate={(updates) => updateItem(item.id, updates)}
            onDelete={() => deleteItem(item)}
            onMove={(direction) => {
              setOpenMenuId(null)
              onChange(moveItem(items, index, direction))
            }}
            onToggleMenu={() => setOpenMenuId((current) => current === item.id ? null : item.id)}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500 ring-1 ring-stone-100">
            Add the first item so recommendations have better context.
          </div>
        )}
      </div>
      <div className="mt-4 max-w-3xl">
        {adding ? (
          <div className="flex flex-col gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-100 sm:flex-row">
            <input
              autoFocus
              value={newValue}
              onChange={(event) => onNewValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAdd()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onNewValueChange('')
                  setAdding(false)
                }
              }}
              onBlur={() => {
                if (newValue.trim()) handleAdd()
              }}
              placeholder={placeholder}
              className="min-h-[40px] flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-ember-400"
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleAdd} className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white">
                Add
              </button>
              <button type="button" onClick={() => { onNewValueChange(''); setAdding(false) }} className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-stone-600 ring-1 ring-stone-200">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-stone-50 px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-100 transition-colors hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-ember-400 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4 text-ember-600" />
            {placeholder}
          </button>
        )}
      </div>
    </section>
  )
}

function GoalsSection({
  goals,
  activeGoals,
  newGoal,
  onNewGoalChange,
  onAddGoal,
  onChange,
}: {
  goals: BusinessGoal[]
  activeGoals: BusinessGoal[]
  newGoal: string
  onNewGoalChange: (value: string) => void
  onAddGoal: () => void
  onChange: (goals: BusinessGoal[]) => void
}) {
  const goalsByCategory = useMemo(() => {
    return GOAL_GROUPS.map((group) => ({
      ...group,
      goals: goals.filter((goal) => goal.category === group.category && !goal.isCustom),
    }))
  }, [goals])
  const customGoals = goals.filter((goal) => goal.isCustom)

  function updateGoal(goalId: string, updates: Partial<BusinessGoal>) {
    onChange(goals.map((goal) => goal.id === goalId ? { ...goal, ...updates } : goal))
  }

  function deleteGoal(goalId: string) {
    onChange(goals.filter((goal) => goal.id !== goalId || !goal.isCustom))
  }

  return (
    <section className="rounded-[22px] bg-white p-5 ring-1 ring-stone-200 sm:p-6">
      <SectionIntro eyebrow="Business Goals" title="Which goals matter most right now?" description="Activate more than one goal, then order active goals by priority." />

      <div className="mt-6 rounded-[18px] bg-stone-950 p-4 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-300">Active Priority</p>
            <p className="mt-1 text-sm text-stone-300">The top goal gets the strongest recommendation weight.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {activeGoals.length > 0 ? activeGoals.map((goal, index) => (
            <div key={goal.id} className="flex flex-col gap-3 rounded-lg bg-white/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                value={goal.label}
                onChange={(event) => goal.isCustom && updateGoal(goal.id, { label: event.target.value })}
                disabled={!goal.isCustom}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none disabled:opacity-100"
                aria-label={`Goal ${index + 1}`}
              />
              <div className="flex gap-2">
                <SmallButton disabled={index === 0} onClick={() => onChange(moveGoal(goals, goal.id, -1))}>Up</SmallButton>
                <SmallButton disabled={index === activeGoals.length - 1} onClick={() => onChange(moveGoal(goals, goal.id, 1))}>Down</SmallButton>
                <SmallButton onClick={() => updateGoal(goal.id, { isActive: false })}>Deactivate</SmallButton>
              </div>
            </div>
          )) : (
            <p className="rounded-lg bg-white/10 p-3 text-sm text-stone-300">Activate at least one goal to guide recommendations.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {goalsByCategory.map((group) => (
          <div key={group.category} className="rounded-[18px] bg-stone-50 p-4 ring-1 ring-stone-100">
            <h3 className="text-sm font-semibold text-stone-950">{group.category}</h3>
            <div className="mt-3 grid gap-2">
              {group.goals.map((goal) => (
                <GoalToggle key={goal.id} goal={goal} onChange={(updates) => updateGoal(goal.id, updates)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {customGoals.length > 0 && (
        <div className="mt-4 rounded-[18px] bg-stone-50 p-4 ring-1 ring-stone-100">
          <h3 className="text-sm font-semibold text-stone-950">Custom Goals</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {customGoals.map((goal) => (
              <div key={goal.id} className="flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-stone-200">
                <input
                  value={goal.label}
                  onChange={(event) => updateGoal(goal.id, { label: event.target.value })}
                  className="min-w-0 flex-1 rounded-md px-2 py-1 text-sm font-semibold text-stone-900 outline-none focus:bg-stone-50"
                />
                <button type="button" onClick={() => updateGoal(goal.id, { isActive: !goal.isActive })} className={`rounded-full px-3 py-1 text-xs font-semibold ${goal.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                  {goal.isActive ? 'Active' : 'Off'}
                </button>
                <button type="button" onClick={() => deleteGoal(goal.id)} className="rounded-full px-2 py-1 text-xs font-semibold text-stone-400 hover:text-red-600">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddRow value={newGoal} placeholder="Add a custom goal" onChange={onNewGoalChange} onAdd={onAddGoal} />
    </section>
  )
}

function VoiceSection({ selected, onChange }: { selected: string[]; onChange: (selected: string[]) => void }) {
  return (
    <section className="rounded-[22px] bg-white p-5 ring-1 ring-stone-200 sm:p-6">
      <SectionIntro eyebrow="Brand Voice" title="What should the brand sound like?" description="Choose the voice notes that should influence future content." />
      <div className="mt-6 flex flex-wrap gap-3">
        {BRAND_VOICE_OPTIONS.map((voice) => {
          const active = selected.includes(voice)
          return (
            <button
              key={voice}
              type="button"
              onClick={() => onChange(active ? selected.filter((item) => item !== voice) : [...selected, voice])}
              className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors ${
                active ? 'bg-stone-950 text-white ring-stone-950' : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'
              }`}
            >
              {voice}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ProfileListRow({
  item,
  editing,
  menuOpen,
  canMoveUp,
  canMoveDown,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onMove,
  onToggleMenu,
}: {
  item: ProfileListItem
  editing: boolean
  menuOpen: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onUpdate: (updates: Partial<ProfileListItem>) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
  onToggleMenu: () => void
}) {
  const [draftLabel, setDraftLabel] = useState(item.label)

  useEffect(() => {
    setDraftLabel(item.label)
  }, [item.label, editing])

  function saveLabel() {
    const nextLabel = draftLabel.trim()
    if (!nextLabel) {
      setDraftLabel(item.label)
      onCancelEdit()
      return
    }

    onUpdate({ label: nextLabel })
    onCancelEdit()
  }

  return (
    <div className={`relative flex min-h-[54px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
      item.isActive ? 'border-stone-200 bg-white text-stone-950' : 'border-stone-100 bg-stone-50 text-stone-500 opacity-80'
    }`}>
      <label className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-stone-50">
        <input
          type="checkbox"
          checked={item.isActive}
          onChange={(event) => onUpdate({ isActive: event.target.checked })}
          className="h-4 w-4 rounded border-stone-300 text-ember-600 accent-ember-600 focus:ring-ember-500"
          aria-label={`${item.isActive ? 'Deactivate' : 'Activate'} ${item.label}`}
        />
      </label>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveLabel()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraftLabel(item.label)
                onCancelEdit()
              }
            }}
            onBlur={saveLabel}
            className="min-h-[38px] w-full rounded-lg border border-ember-200 bg-white px-3 text-sm font-semibold text-stone-950 outline-none focus:border-ember-400"
            aria-label={`Rename ${item.label}`}
          />
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            className="block w-full truncate rounded-md px-1 py-2 text-left text-sm font-semibold outline-none hover:bg-stone-50 focus:ring-2 focus:ring-ember-400"
            title={`Edit ${item.label}`}
          >
            {item.label}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden h-9 w-9 items-center justify-center rounded-lg text-stone-300 sm:inline-flex" aria-hidden="true" title="Reorder">
          <GripIcon className="h-4 w-4" />
        </span>
        <IconButton label={`Edit ${item.label}`} title="Edit" onClick={onStartEdit}>
          <EditIcon className="h-4 w-4" />
        </IconButton>
        <div className="relative">
          <IconButton label={`More actions for ${item.label}`} title="More actions" onClick={onToggleMenu} ariaExpanded={menuOpen}>
            <MoreIcon className="h-4 w-4" />
          </IconButton>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 w-44 rounded-lg bg-white p-1 shadow-[0_18px_45px_rgba(28,25,23,0.16)] ring-1 ring-stone-200">
              <MenuAction disabled={!canMoveUp} onClick={() => onMove(-1)}>Move up</MenuAction>
              <MenuAction disabled={!canMoveDown} onClick={() => onMove(1)}>Move down</MenuAction>
              <MenuAction tone="danger" onClick={onDelete}>Delete</MenuAction>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GoalToggle({ goal, onChange }: { goal: BusinessGoal; onChange: (updates: Partial<BusinessGoal>) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange({ isActive: !goal.isActive })}
      className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ring-1 transition-colors ${
        goal.isActive ? 'bg-stone-950 text-white ring-stone-950' : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'
      }`}
    >
      {goal.label}
    </button>
  )
}

function IconButton({
  label,
  title,
  ariaExpanded,
  onClick,
  children,
}: {
  label: string
  title: string
  ariaExpanded?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      title={title}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-ember-400"
    >
      {children}
    </button>
  )
}

function MenuAction({
  children,
  disabled,
  tone = 'default',
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  tone?: 'default' | 'danger'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-stone-700 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  )
}

function AddRow({
  value,
  placeholder,
  onChange,
  onAdd,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onAdd: () => void
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onAdd()
          }
        }}
        placeholder={placeholder}
        className="min-h-[42px] flex-1 rounded-lg border border-stone-200 px-3 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-ember-400"
      />
      <button type="button" onClick={onAdd} className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white">
        Add
      </button>
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
    </svg>
  )
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 7l3 3" />
    </svg>
  )
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5h.01M12 12h.01M12 17.5h.01" />
    </svg>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-stone-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[42px] w-full rounded-lg border border-stone-200 px-3 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-ember-400"
      />
    </label>
  )
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold leading-tight text-stone-950">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>
    </div>
  )
}

function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  return (
    <div className="inline-flex h-10 items-center rounded-full bg-stone-50 px-4 text-sm font-semibold text-stone-600 ring-1 ring-stone-100">
      {state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : 'Autosave on'}
    </div>
  )
}

function SmallButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white disabled:opacity-30">
      {children}
    </button>
  )
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const currentItem = next[index]
  const targetItem = next[nextIndex]
  if (!currentItem || !targetItem) return items
  next[index] = targetItem
  next[nextIndex] = currentItem
  return normalizeListOrders(next as ProfileListItem[]) as T[]
}

function moveGoal(goals: BusinessGoal[], goalId: string, direction: -1 | 1) {
  const activeGoals = getActiveGoals({ goals })
  const activeIndex = activeGoals.findIndex((goal) => goal.id === goalId)
  const nextActiveIndex = activeIndex + direction
  if (activeIndex < 0 || nextActiveIndex < 0 || nextActiveIndex >= activeGoals.length) return goals

  const nextActive = [...activeGoals]
  const currentGoal = nextActive[activeIndex]
  const targetGoal = nextActive[nextActiveIndex]
  if (!currentGoal || !targetGoal) return goals
  nextActive[activeIndex] = targetGoal
  nextActive[nextActiveIndex] = currentGoal

  const priority = new Map(nextActive.map((goal, index) => [goal.id, index]))
  return goals.map((goal) => goal.isActive ? { ...goal, priority: priority.get(goal.id) ?? 999 } : goal)
}

function normalizeListOrders(items: ProfileListItem[]) {
  return items
    .filter((item) => item.label.trim().length > 0)
    .map((item, index) => ({ ...item, label: item.label.trim(), sortOrder: index }))
}

function normalizeGoalPriorities(goals: BusinessGoal[]) {
  const activeGoals = goals.filter((goal) => goal.isActive).sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
  const priority = new Map(activeGoals.map((goal, index) => [goal.id, index]))
  return goals
    .filter((goal) => goal.label.trim().length > 0)
    .map((goal) => ({
      ...goal,
      label: goal.label.trim(),
      priority: goal.isActive ? priority.get(goal.id) ?? 999 : 999,
    }))
}
