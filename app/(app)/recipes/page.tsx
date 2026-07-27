'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CATEGORIES = ['Pizza', 'Small Bites', 'Salads', 'Sides', 'Sweets', 'Sauces', 'Dough', 'Other'] as const
type Category = typeof CATEGORIES[number]

interface Ingredient {
  amount: string
  item: string
}

interface Recipe {
  id: string
  user_id: string
  name: string
  category: Category
  description: string
  yield_amount: string
  oven_temp: string
  cook_time: string
  ingredients: Ingredient[]
  steps: string[]
  notes: string
  created_at: string
  updated_at: string
}

type RecipeForm = Omit<Recipe, 'id' | 'user_id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: RecipeForm = {
  name: '',
  category: 'Other',
  description: '',
  yield_amount: '',
  oven_temp: '',
  cook_time: '',
  ingredients: [{ amount: '', item: '' }],
  steps: [''],
  notes: '',
}

const CATEGORY_COLORS: Record<Category, string> = {
  Pizza: 'bg-orange-100 text-orange-700',
  'Small Bites': 'bg-amber-100 text-amber-700',
  Salads: 'bg-emerald-100 text-emerald-700',
  Sides: 'bg-blue-100 text-blue-700',
  Sweets: 'bg-pink-100 text-pink-700',
  Sauces: 'bg-red-100 text-red-700',
  Dough: 'bg-stone-100 text-stone-700',
  Other: 'bg-stone-100 text-stone-600',
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<RecipeForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    loadRecipes()
  }, [])

  async function loadRecipes() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    setRecipes(data ?? [])
    setLoading(false)
  }

  function openRecipe(recipe: Recipe) {
    setSelected(recipe)
    setIsNew(false)
    setForm({
      name: recipe.name,
      category: recipe.category as Category,
      description: recipe.description ?? '',
      yield_amount: recipe.yield_amount ?? '',
      oven_temp: recipe.oven_temp ?? '',
      cook_time: recipe.cook_time ?? '',
      ingredients: recipe.ingredients?.length ? recipe.ingredients : [{ amount: '', item: '' }],
      steps: recipe.steps?.length ? recipe.steps : [''],
      notes: recipe.notes ?? '',
    })
    setConfirmDelete(false)
    setError(null)
    setSaved(false)
  }

  function openNew() {
    setSelected(null)
    setIsNew(true)
    setForm(EMPTY_FORM)
    setConfirmDelete(false)
    setError(null)
    setSaved(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Recipe name is required.'); return }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setSaving(false); return }

    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      category: form.category,
      description: form.description,
      yield_amount: form.yield_amount,
      oven_temp: form.oven_temp,
      cook_time: form.cook_time,
      ingredients: form.ingredients.filter((i) => i.item.trim()),
      steps: form.steps.filter((s) => s.trim()),
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }

    if (isNew) {
      const { data, error: err } = await supabase.from('recipes').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      const created = data as Recipe
      setRecipes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setSelected(created)
      setIsNew(false)
    } else if (selected) {
      const { data, error: err } = await supabase
        .from('recipes')
        .update(payload)
        .eq('id', selected.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      const updated = data as Recipe
      setRecipes((prev) => prev.map((r) => r.id === updated.id ? updated : r).sort((a, b) => a.name.localeCompare(b.name)))
      setSelected(updated)
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('recipes').delete().eq('id', selected.id)
    if (err) { setError(err.message); setDeleting(false); return }
    setRecipes((prev) => prev.filter((r) => r.id !== selected.id))
    setSelected(null)
    setIsNew(false)
    setConfirmDelete(false)
    setDeleting(false)
  }

  // Ingredients helpers
  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    setForm((prev) => {
      const next = [...prev.ingredients]
      next[index] = { ...next[index], [field]: value }
      return { ...prev, ingredients: next }
    })
  }
  function addIngredient() {
    setForm((prev) => ({ ...prev, ingredients: [...prev.ingredients, { amount: '', item: '' }] }))
  }
  function removeIngredient(index: number) {
    setForm((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== index) }))
  }

  // Steps helpers
  function updateStep(index: number, value: string) {
    setForm((prev) => {
      const next = [...prev.steps]
      next[index] = value
      return { ...prev, steps: next }
    })
  }
  function addStep() {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, ''] }))
  }
  function removeStep(index: number) {
    setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }))
  }
  function moveStep(index: number, direction: -1 | 1) {
    setForm((prev) => {
      const next = [...prev.steps]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, steps: next }
    })
  }

  // Group recipes by category for sidebar
  const grouped = CATEGORIES.reduce<Record<string, Recipe[]>>((acc, cat) => {
    const items = recipes.filter((r) => r.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const showPanel = isNew || selected !== null

  return (
    <div>
      <div className="page-header">
        <h1 className="text-xl font-semibold text-stone-900">Recipes</h1>
        <p className="text-stone-500 text-sm mt-0.5">Store and manage all Fireova recipes in one place.</p>
      </div>

      <div className="page-content">
        <div className="flex gap-5 items-start">
          {/* Left panel */}
          <div className="w-56 flex-shrink-0">
            <button
              onClick={openNew}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-ember-600 hover:bg-ember-700 text-white text-sm font-medium transition-colors mb-4"
            >
              <PlusIcon className="w-4 h-4" />
              New Recipe
            </button>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-stone-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recipes.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">No recipes yet.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold tracking-wider text-stone-400 uppercase px-1 mb-1">{cat}</p>
                    <div className="space-y-0.5">
                      {items.map((recipe) => {
                        const isActive = selected?.id === recipe.id && !isNew
                        return (
                          <button
                            key={recipe.id}
                            onClick={() => openRecipe(recipe)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              isActive
                                ? 'bg-stone-800 text-white'
                                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                            }`}
                          >
                            {recipe.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0">
            {!showPanel ? (
              <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[320px]">
                <RecipeEmptyIcon className="w-10 h-10 text-stone-300 mb-3" />
                <p className="text-stone-500 text-sm font-medium">Select a recipe or create a new one</p>
                <p className="text-stone-400 text-xs mt-1">Your full recipe library lives here.</p>
              </div>
            ) : (
              <div className="card p-6 space-y-5">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-stone-900">
                    {isNew ? 'New Recipe' : form.name || 'Untitled Recipe'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {saved && (
                      <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                        <CheckIcon className="w-4 h-4" />
                        Saved
                      </span>
                    )}
                    {!isNew && !confirmDelete && (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="text-xs text-stone-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                    {confirmDelete && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">Are you sure?</span>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ember-600 hover:bg-ember-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                    >
                      {saving && <Spinner />}
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                {/* Name + Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Recipe Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Margherita Pizza"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as Category }))}
                      className="input"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="label">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description of this recipe"
                    rows={2}
                    className="input resize-none"
                  />
                </div>

                {/* Yield / Temp / Time */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Yield</label>
                    <input
                      type="text"
                      value={form.yield_amount}
                      onChange={(e) => setForm((p) => ({ ...p, yield_amount: e.target.value }))}
                      placeholder="12 inch / 8 slices"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Oven Temp</label>
                    <input
                      type="text"
                      value={form.oven_temp}
                      onChange={(e) => setForm((p) => ({ ...p, oven_temp: e.target.value }))}
                      placeholder="900°F"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Cook Time</label>
                    <input
                      type="text"
                      value={form.cook_time}
                      onChange={(e) => setForm((p) => ({ ...p, cook_time: e.target.value }))}
                      placeholder="90 seconds"
                      className="input"
                    />
                  </div>
                </div>

                {/* Ingredients */}
                <div>
                  <label className="label">Ingredients</label>
                  <div className="space-y-2">
                    {form.ingredients.map((ing, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ing.amount}
                          onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
                          placeholder="Amount"
                          className="input w-28 flex-shrink-0"
                        />
                        <input
                          type="text"
                          value={ing.item}
                          onChange={(e) => updateIngredient(idx, 'item', e.target.value)}
                          placeholder="Ingredient"
                          className="input flex-1"
                        />
                        <button
                          onClick={() => removeIngredient(idx)}
                          className="text-stone-300 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                          title="Remove"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addIngredient}
                      className="text-xs text-stone-400 hover:text-ember-600 border border-dashed border-stone-300 hover:border-ember-400 px-3 py-1.5 rounded-lg w-full transition-colors"
                    >
                      + Add ingredient
                    </button>
                  </div>
                </div>

                {/* Steps */}
                <div>
                  <label className="label">Steps</label>
                  <div className="space-y-2">
                    {form.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone-100 text-stone-500 text-xs font-semibold flex items-center justify-center mt-2">
                          {idx + 1}
                        </span>
                        <textarea
                          value={step}
                          onChange={(e) => updateStep(idx, e.target.value)}
                          placeholder={`Step ${idx + 1}`}
                          rows={2}
                          className="input flex-1 resize-none"
                        />
                        <div className="flex flex-col gap-0.5 flex-shrink-0 pt-1.5">
                          <button
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className="text-stone-300 hover:text-stone-500 disabled:opacity-30 p-0.5 transition-colors"
                            title="Move up"
                          >
                            <ChevronUpIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === form.steps.length - 1}
                            className="text-stone-300 hover:text-stone-500 disabled:opacity-30 p-0.5 transition-colors"
                            title="Move down"
                          >
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeStep(idx)}
                          className="text-stone-300 hover:text-red-400 transition-colors flex-shrink-0 p-1 mt-1"
                          title="Remove"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addStep}
                      className="text-xs text-stone-400 hover:text-ember-600 border border-dashed border-stone-300 hover:border-ember-400 px-3 py-1.5 rounded-lg w-full transition-colors"
                    >
                      + Add step
                    </button>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Tips, variations, sourcing notes..."
                    rows={3}
                    className="input resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function RecipeEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
