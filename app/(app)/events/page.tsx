'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseConfigured, createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Event {
  id: string
  user_id: string
  event_name: string
  event_date: string | null
  leave_time: string | null
  drive_time: string | null
  on_site_time: string | null
  food_service_time: string | null
  guest_count: number | null
  confirmed: boolean
  address: string | null
  team_oven: string | null
  team_stretch_top: string | null
  team_expo: string | null
  team_buffet: string | null
  onsite_contact: string | null
  cocktail_hour: string | null
  dietary_meals: string | null
  couples_meal: string | null
  dinner_service: string | null
  dessert_notes: string | null
  special_notes: string | null
  selected_menu_items: string[]
  checked_pack_items: string[]
  created_at: string
  updated_at: string
}

type Tab = 'details' | 'menu' | 'packlist'

// ---------------------------------------------------------------------------
// Menu data
// ---------------------------------------------------------------------------

const MENU_CATEGORIES: { label: string; items: string[] }[] = [
  {
    label: 'Pizza',
    items: [
      'Margherita', 'Meat Lovers', 'Arugula Prosciutto', 'Pig Pen',
      'Tropical Debate', 'Pesto Pizza', 'Chicken Florentine', 'Veggie',
      'Street Taco', 'Philly', 'Buffalo Chicken',
    ],
  },
  {
    label: 'Small Bites',
    items: [
      'Caprese Skewers', 'Arugula Prosciutto Crostini', 'Roasted Tomato Crostini',
      'Stuffed Mushrooms', 'Smoked Salmon Bites', 'Prosciutto Wrapped Shrimp',
      'Caprese Platter', 'Smoked Salmon Dip', 'Charcuterie Board',
      'Grazing Table', 'Charcuterie Cups',
    ],
  },
  {
    label: 'Hot Sides',
    items: ['Meatballs', 'BBQ Wings', 'Lamb Lollipops', 'Ahi Tuna'],
  },
  {
    label: 'Salads',
    items: ['Caesar Salad', 'Farmers Market'],
  },
  {
    label: 'Dessert',
    items: ['Mini Cannolis'],
  },
]

// ---------------------------------------------------------------------------
// Pack list data
// ---------------------------------------------------------------------------

const FOOD_PACK_ALWAYS: string[] = [
  'Dough trays',
  'Gluten Free Dough',
  'Pizza sauce',
  'Mozzarella',
  'Oil',
  'Pizza Cutters',
  'Dough Scraper',
  'Pizza Sauce Spoon',
  'Pizza Serving Spatulas',
  'Knife',
]

const TRUCK_PACK_ALWAYS: string[] = [
  'Wooden Boards',
  'Pizza Stands',
  'Disposable Paper Plates',
  'Disposable Forks',
  'Napkins',
  'Silverware Caddy',
  '2 x 8ft tablecloths',
  '1 x 6ft tablecloth',
  'Semola Flour / GF Flour',
  'Sanitizer/Degreaser Spray bottle',
  'Towels 6+',
  'Trash bags / Trash Can',
  'Gloves M, LG, XL',
  'Aprons',
  'Tent + Tent Weather Sides',
  'Broom/dust pan',
  'Wood',
  'Gas in truck',
  'Pizza boxes 25+',
  'Wheel Chock',
  'Cross Wrench Bar',
  'Weather bungees and sand buckets',
  'LED tent lights',
  'Expo Lights / Fly Fans',
  'Bottled Water',
  'Emergency Kit / Fire Extinguisher',
  '12 ton Jack',
]

const MENU_PACK_ITEMS: Record<string, string[]> = {
  // PIZZA
  'Margherita': ['Basil'],
  'Meat Lovers': ['Pepperoni', 'Sausage', 'Meatball'],
  'Arugula Prosciutto': ['Arugula', 'Prosciutto', 'Shaved parm', 'Balsamic glaze'],
  'Pig Pen': ['Pulled pork', 'Jalapeno', 'Bbq sauce'],
  'Tropical Debate': ['Ham', 'Pineapple', 'Basil', 'Hot honey'],
  'Pesto Pizza': ['Pesto', 'Tomato', 'Artichoke', 'Bacon'],
  'Chicken Florentine': ['Chicken', 'Bacon', 'Spinach', 'Tomato'],
  'Veggie': ['Broccolini', 'Spinach', 'Red onion', 'Garlic'],
  'Street Taco': ['Steak', 'Pico di gallo', 'Spoon', 'Lime', 'Grill pan', 'Knife'],
  'Philly': ['Steak', 'Mushrooms', 'Roasted peppers', 'Shaved parmesan', 'Grill pan'],
  'Buffalo Chicken': ['Crispy chicken', 'Carrot/celery mix', 'Gorgonzola', 'Buffalo sauce', 'Green onions', 'Grill pan', 'Knife'],
  // SMALL BITES
  'Caprese Skewers': ['Balsamic glaze', 'Sea salt', 'Olive oil', 'Round platter'],
  'Arugula Prosciutto Crostini': ['Crostinis', 'Ricotta', 'Arugula', 'Prosciutto', 'Shaved parmesan', 'Balsamic glaze', 'Sheet pan for cooking', 'Olive oil', 'Mini Tongs', 'Rectangle platter'],
  'Roasted Tomato Crostini': ['Crostinis', 'Ricotta', 'Arugula', 'Marinated tomatoes', 'Sheet pan for tomatoes/crostini', 'Balsamic glaze', 'Mini Tongs', 'Rectangle platter'],
  'Stuffed Mushrooms': ['Pesto', 'Shaved parmesan', 'Rectangle platter'],
  'Smoked Salmon Bites': ['Cucumber', 'Sea salt', 'Dip', 'Salmon', 'Dill', 'Rectangle platter'],
  'Prosciutto Wrapped Shrimp': ['Lemon', 'Fresno aioli', 'Bowl/spoon', 'Parsley', 'Shrimp platter'],
  'Caprese Platter': ['Tomatoes', 'Basil', 'Rectangle platter', 'Sea salt', 'Balsamic glaze', 'Tongs'],
  'Smoked Salmon Dip': ['Salmon dip', 'Crostinis', 'Lemon', 'Parsley', 'Silver serving platter', 'Spoon'],
  'Charcuterie Board': ['Wooden board', 'Meat', 'Cheese', 'Fruit', 'Crackers', 'Tongs'],
  'Grazing Table': ['Butcher paper', 'Tape', 'Scissors', 'Meat', 'Cheese', 'Fruit', 'Dried fruit', 'Nuts', 'Crackers', 'Rosemary', 'Shaved parmesan', 'Circle brie stands', 'Tiered Stand', '2 rectangle boards for crackers/focaccia', 'Floral Decor/Flowers', 'App plates', 'Napkins'],
  'Charcuterie Cups': ['Sesame crackers', 'Long stick crackers', 'Rectangular crackers', 'Rosemary', 'Flowers', 'Fruit skewers', 'Antipasto skewers', 'Apricot or mango', 'Drunken goat or Manchego cheese', 'Loose grapes', 'Cups'],
  // HOT SIDES
  'Meatballs': ['Marinara', 'Shaved parmesan', 'Parsley', 'Chafing dish', 'Sternos', 'Extra pan', 'Serving spoon'],
  'BBQ Wings': ['Bbq sauce', 'Extra pan', 'Parsley', 'Chafing dish', 'Sterno', 'Tongs'],
  'Lamb Lollipops': ['Grill pan', 'Metal tongs', 'Silver serving platter', 'Fresno aioli', 'Spoon', 'Parsley'],
  'Ahi Tuna': ['Sesame Seeds', 'Tuna Steaks', 'Grill pan', 'Spring mix', 'Knife', 'Tomatoes', 'Lemon', 'Rectangle Board', 'Balsamic', 'Cucumber', 'Japanese bbq sauce'],
  // SALADS
  'Caesar Salad': ['Romaine', 'Croutons', 'Shaved parmesan', 'Caesar dressing', 'Salad Bowl', 'Tongs'],
  'Farmers Market': ['Spring mix', 'Cucumbers', 'Tomatoes', 'Carrots', 'Balsamic vinaigrette', 'Salad Bowl', 'Tongs'],
  // DESSERT
  'Mini Cannolis': ['Cannoli shells', 'Cannoli cream', 'Chocolate chips', 'Powdered sugar', 'Rectangle platter', 'Tongs'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePackKey(section: string, item: string) {
  return `${section}::${item}`
}

function formatDateDisplay(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function emptyEvent(userId: string): Omit<Event, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    event_name: 'New Event',
    event_date: null,
    leave_time: null,
    drive_time: null,
    on_site_time: null,
    food_service_time: null,
    guest_count: null,
    confirmed: false,
    address: null,
    team_oven: null,
    team_stretch_top: null,
    team_expo: null,
    team_buffet: null,
    onsite_contact: null,
    cocktail_hour: null,
    dietary_meals: null,
    couples_meal: null,
    dinner_service: null,
    dessert_notes: null,
    special_notes: null,
    selected_menu_items: [],
    checked_pack_items: [],
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EventsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [formDirty, setFormDirty] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -- Auth
  useEffect(() => {
    if (!supabaseConfigured) {
      setUserId('dev')
      setLoading(false)
      return
    }
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
      setLoading(false)
    })
  }, [])

  // -- Load events
  useEffect(() => {
    if (!userId || userId === 'dev') {
      setLoading(false)
      return
    }
    const supabase = createClient()
    supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (data) {
          setEvents(data as Event[])
          if (data.length > 0 && !selectedId) setSelectedId(data[0].id)
        }
        setLoading(false)
      })
  }, [userId])

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  // -- Save helpers
  function flashSave(msg = 'Saved') {
    setSaveMsg(msg)
    setTimeout(() => setSaveMsg(null), 2000)
  }

  async function saveEvent(patch: Partial<Event>, eventId: string) {
    if (!supabaseConfigured || userId === 'dev') {
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, ...patch, updated_at: new Date().toISOString() } : e))
      )
      flashSave()
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('events')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? (data as Event) : e)))
      flashSave()
    }
  }

  // -- Details form state
  const [form, setForm] = useState<Partial<Event>>({})

  useEffect(() => {
    if (selectedEvent) {
      setForm({ ...selectedEvent })
      setFormDirty(false)
    }
  }, [selectedId])

  function handleFormChange(field: keyof Event, value: string | number | boolean | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFormDirty(true)
  }

  async function handleSaveDetails() {
    if (!selectedId) return
    const patch: Partial<Event> = { ...form }
    delete (patch as Record<string, unknown>).id
    delete (patch as Record<string, unknown>).created_at
    delete (patch as Record<string, unknown>).updated_at
    await saveEvent(patch, selectedId)
    setFormDirty(false)
  }

  // -- Create event
  async function handleCreateEvent() {
    let uid = userId
    if (!uid && supabaseConfigured) {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      uid = data.user?.id ?? null
      if (uid) setUserId(uid)
    }
    if (!uid) return
    const newData = emptyEvent(uid)

    if (!supabaseConfigured || userId === 'dev') {
      const stub: Event = {
        ...newData,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setEvents((prev) => [stub, ...prev])
      setSelectedId(stub.id)
      setActiveTab('details')
      return
    }

    // Optimistic: show the event immediately so the UI responds
    const stub: Event = {
      ...newData,
      id: `pending-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setEvents((prev) => [stub, ...prev])
    setSelectedId(stub.id)
    setActiveTab('details')

    // Then persist to Supabase and replace stub with real record
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('events')
      .insert([newData])
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setEvents((prev) => prev.map((e) => e.id === stub.id ? (data as Event) : e))
      setSelectedId((data as Event).id)
    } else if (error) {
      console.error('Failed to save event to Supabase:', error.message)
      // Keep stub in local state so user can still interact
    }
  }

  // -- Delete event
  async function handleDeleteEvent(id: string) {
    if (!supabaseConfigured || userId === 'dev') {
      setEvents((prev) => prev.filter((e) => e.id !== id))
      if (selectedId === id) setSelectedId(events.find((e) => e.id !== id)?.id ?? null)
      setDeleteConfirmId(null)
      return
    }
    const supabase = createClient()
    await supabase.from('events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    if (selectedId === id) setSelectedId(events.find((e) => e.id !== id)?.id ?? null)
    setDeleteConfirmId(null)
  }

  // -- Duplicate event
  async function handleDuplicateEvent(event: Event) {
    let uid = userId
    if (!uid && supabaseConfigured) {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      uid = data.user?.id ?? null
      if (uid) setUserId(uid)
    }
    if (!uid) return
    const duped = {
      ...emptyEvent(uid),
      event_name: `${event.event_name} (Copy)`,
      event_date: event.event_date,
      leave_time: event.leave_time,
      drive_time: event.drive_time,
      on_site_time: event.on_site_time,
      food_service_time: event.food_service_time,
      guest_count: event.guest_count,
      address: event.address,
      team_oven: event.team_oven,
      team_stretch_top: event.team_stretch_top,
      team_expo: event.team_expo,
      team_buffet: event.team_buffet,
      onsite_contact: event.onsite_contact,
      cocktail_hour: event.cocktail_hour,
      dietary_meals: event.dietary_meals,
      couples_meal: event.couples_meal,
      dinner_service: event.dinner_service,
      dessert_notes: event.dessert_notes,
      special_notes: event.special_notes,
      selected_menu_items: [...event.selected_menu_items],
      checked_pack_items: [],
    }

    if (!supabaseConfigured || userId === 'dev') {
      const stub: Event = {
        ...duped,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setEvents((prev) => [stub, ...prev])
      setSelectedId(stub.id)
      setActiveTab('details')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('events').insert([duped]).select().single()
    setSaving(false)
    if (!error && data) {
      setEvents((prev) => [data as Event, ...prev])
      setSelectedId((data as Event).id)
      setActiveTab('details')
    }
  }

  // -- Menu toggle (auto-saves)
  async function handleMenuToggle(item: string) {
    if (!selectedId || !selectedEvent) return
    const current = selectedEvent.selected_menu_items ?? []
    const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item]

    // Remove checked pack items for unchecked menu item
    let checkedPack = selectedEvent.checked_pack_items ?? []
    if (!next.includes(item)) {
      const toRemove = (MENU_PACK_ITEMS[item] ?? []).map((pi) => makePackKey(item, pi))
      checkedPack = checkedPack.filter((k) => !toRemove.includes(k))
    }

    const patch = { selected_menu_items: next, checked_pack_items: checkedPack }

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) => (e.id === selectedId ? { ...e, ...patch } : e))
    )

    if (!supabaseConfigured || userId === 'dev') {
      flashSave()
      return
    }

    const supabase = createClient()
    await supabase
      .from('events')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', selectedId)
    flashSave()
  }

  // -- Pack list toggle (debounced auto-save)
  function handlePackToggle(key: string) {
    if (!selectedId || !selectedEvent) return
    const current = selectedEvent.checked_pack_items ?? []
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]

    setEvents((prev) =>
      prev.map((e) => (e.id === selectedId ? { ...e, checked_pack_items: next } : e))
    )

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!supabaseConfigured || userId === 'dev') { flashSave(); return }
      const supabase = createClient()
      await supabase
        .from('events')
        .update({ checked_pack_items: next, updated_at: new Date().toISOString() })
        .eq('id', selectedId)
      flashSave()
    }, 600)
  }

  // -- Pack list progress
  function getPackProgress() {
    if (!selectedEvent) return { checked: 0, total: 0 }
    const menuItems = selectedEvent.selected_menu_items ?? []
    const allItems: string[] = [
      ...FOOD_PACK_ALWAYS.map((i) => makePackKey('food', i)),
      ...menuItems.flatMap((m) => (MENU_PACK_ITEMS[m] ?? []).map((i) => makePackKey(m, i))),
      ...TRUCK_PACK_ALWAYS.map((i) => makePackKey('truck', i)),
    ]
    const checked = selectedEvent.checked_pack_items ?? []
    return {
      checked: allItems.filter((k) => checked.includes(k)).length,
      total: allItems.length,
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-400 text-sm">Loading events...</div>
      </div>
    )
  }

  const progress = getPackProgress()

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Left panel */}
      <div className="w-60 flex-shrink-0 bg-white border-r border-stone-200 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900">Events</h2>
          <button
            onClick={handleCreateEvent}
            className="flex items-center gap-1 text-xs font-medium text-ember-600 hover:text-ember-700 bg-ember-50 hover:bg-ember-100 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {events.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-stone-400 text-xs">No events yet.</p>
              <button
                onClick={handleCreateEvent}
                className="mt-3 text-xs text-ember-600 hover:text-ember-700 font-medium"
              >
                Create your first event
              </button>
            </div>
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => { setSelectedId(event.id); setActiveTab('details') }}
                className={`w-full text-left px-4 py-3 border-b border-stone-100 hover:bg-stone-50 transition-colors ${
                  selectedId === event.id ? 'bg-stone-50 border-l-2 border-l-ember-500' : ''
                }`}
              >
                <p className="text-sm font-medium text-stone-900 truncate">{event.event_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {event.event_date && (
                    <span className="text-xs text-stone-400">{formatDateDisplay(event.event_date)}</span>
                  )}
                  {event.guest_count != null && (
                    <span className="text-xs text-stone-400">{event.guest_count} guests</span>
                  )}
                </div>
                <div className="mt-1">
                  {event.confirmed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      <CheckCircleIcon className="w-3 h-3" />
                      Confirmed
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">Not confirmed</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-stone-50">
        {!selectedEvent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <ClipboardIcon className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 text-sm font-medium">Select an event or create a new one</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-stone-200 px-6 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-stone-900">{selectedEvent.event_name}</h1>
                  <div className="flex items-center gap-3 mt-1">
                    {selectedEvent.event_date && (
                      <span className="text-sm text-stone-500">{formatDateDisplay(selectedEvent.event_date)}</span>
                    )}
                    {selectedEvent.confirmed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        Confirmed
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">Not confirmed</span>
                    )}
                    {saveMsg && (
                      <span className="text-xs text-green-600 font-medium">{saveMsg}</span>
                    )}
                    {saving && (
                      <span className="text-xs text-stone-400">Saving...</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDuplicateEvent(selectedEvent)}
                    className="text-xs text-stone-500 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <DuplicateIcon className="w-3.5 h-3.5" />
                    Duplicate
                  </button>
                  {deleteConfirmId === selectedId ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-stone-500">Delete?</span>
                      <button
                        onClick={() => handleDeleteEvent(selectedId)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(selectedId)}
                      className="text-xs text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-4">
                {(['details', 'menu', 'packlist'] as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === tab
                        ? 'bg-ember-600 text-white'
                        : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {tab === 'details' ? 'Event Details' : tab === 'menu' ? 'Menu' : (
                      <span className="flex items-center gap-1.5">
                        Pack List
                        {progress.total > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            activeTab === 'packlist' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'
                          }`}>
                            {progress.checked}/{progress.total}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'details' && (
                <DetailsTab
                  form={form}
                  dirty={formDirty}
                  onChange={handleFormChange}
                  onSave={handleSaveDetails}
                />
              )}
              {activeTab === 'menu' && (
                <MenuTab
                  selected={selectedEvent.selected_menu_items ?? []}
                  onToggle={handleMenuToggle}
                />
              )}
              {activeTab === 'packlist' && (
                <PackListTab
                  selectedMenu={selectedEvent.selected_menu_items ?? []}
                  checkedItems={selectedEvent.checked_pack_items ?? []}
                  onToggle={handlePackToggle}
                  progress={progress}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Details Tab
// ---------------------------------------------------------------------------

function DetailsTab({
  form,
  dirty,
  onChange,
  onSave,
}: {
  form: Partial<Event>
  dirty: boolean
  onChange: (field: keyof Event, value: string | number | boolean | null) => void
  onSave: () => void
}) {
  function field(label: string, key: keyof Event, type: 'text' | 'date' | 'number' = 'text', placeholder?: string) {
    return (
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
        <input
          type={type}
          value={(form[key] as string | number) ?? ''}
          onChange={(e) => {
            const val = type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : (e.target.value || null)
            onChange(key, val)
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
        />
      </div>
    )
  }

  function textarea(label: string, key: keyof Event, placeholder?: string) {
    return (
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
        <textarea
          value={(form[key] as string) ?? ''}
          onChange={(e) => onChange(key, e.target.value || null)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors resize-none"
        />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {/* Basic info */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Event Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-stone-500 mb-1">Event Name *</label>
            <input
              type="text"
              value={(form.event_name as string) ?? ''}
              onChange={(e) => onChange('event_name', e.target.value || 'New Event')}
              placeholder="e.g. Johnson Wedding"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
            />
          </div>
          {field('Date', 'event_date', 'date')}
          {field('Guest Count', 'guest_count', 'number', '150')}
          <div className="sm:col-span-2">
            {field('Address', 'address', 'text', '123 Main St, Dallas, TX')}
          </div>
          <div className="sm:col-span-2">
            {field('Onsite Contact', 'onsite_contact', 'text', 'Name + phone number')}
          </div>
          <div className="sm:col-span-2 flex items-center gap-3 py-1">
            <button
              type="button"
              onClick={() => onChange('confirmed', !form.confirmed)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 ${
                form.confirmed ? 'bg-green-500' : 'bg-stone-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  form.confirmed ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${form.confirmed ? 'text-green-700' : 'text-stone-500'}`}>
              {form.confirmed ? 'Confirmed' : 'Not Confirmed'}
            </span>
          </div>
        </div>
      </section>

      {/* Timing */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Timing</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Leave Time', 'leave_time', 'text', '2:00 PM')}
          {field('Drive Time', 'drive_time', 'text', '45 min')}
          {field('On-Site Time', 'on_site_time', 'text', '4:00 PM')}
          {field('Food Service Time', 'food_service_time', 'text', '6:00 PM')}
        </div>
      </section>

      {/* Team */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Team</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Oven', 'team_oven', 'text')}
          {field('Stretch / Top', 'team_stretch_top', 'text')}
          {field('Expo', 'team_expo', 'text')}
          {field('Buffet', 'team_buffet', 'text')}
        </div>
      </section>

      {/* Food menu notes */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Food Menu Notes</h3>
        <div className="space-y-4">
          {textarea('Cocktail Hour', 'cocktail_hour', 'What is being served during cocktail hour?')}
          {textarea('Dietary Meals', 'dietary_meals', 'GF, dairy-free, vegetarian, etc.')}
          {textarea("Couple's Meal", 'couples_meal', "What are we making for the couple's plate?")}
          {textarea('Dinner Service', 'dinner_service', 'Dinner service details and notes')}
          {textarea('Dessert', 'dessert_notes', 'Dessert options and notes')}
        </div>
      </section>

      {/* Special notes */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Special Notes</h3>
        {textarea('Special Notes', 'special_notes', 'Anything else the team needs to know')}
      </section>

      <div className="pt-2 pb-8">
        <button
          onClick={onSave}
          className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
            dirty
              ? 'bg-ember-600 hover:bg-ember-700 text-white'
              : 'bg-stone-100 text-stone-400 cursor-default'
          }`}
        >
          {dirty ? 'Save Event Details' : 'All changes saved'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menu Tab
// ---------------------------------------------------------------------------

function MenuTab({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (item: string) => void
}) {
  return (
    <div className="p-6 max-w-3xl">
      <p className="text-sm text-stone-500 mb-6">
        Check items to include in this event. The pack list updates automatically.
      </p>
      <div className="space-y-6">
        {MENU_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">{cat.label}</h3>
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
              {cat.items.map((item) => {
                const checked = selected.includes(item)
                return (
                  <label
                    key={item}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(item)}
                      className="w-4 h-4 rounded border-stone-300 text-ember-600 focus:ring-ember-500 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className={`text-sm ${checked ? 'text-stone-900 font-medium' : 'text-stone-600'}`}>
                      {item}
                    </span>
                    {checked && MENU_PACK_ITEMS[item] && (
                      <span className="ml-auto text-xs text-stone-400">
                        {MENU_PACK_ITEMS[item].length} items
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pack List Tab
// ---------------------------------------------------------------------------

function PackListTab({
  selectedMenu,
  checkedItems,
  onToggle,
  progress,
}: {
  selectedMenu: string[]
  checkedItems: string[]
  onToggle: (key: string) => void
  progress: { checked: number; total: number }
}) {
  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0

  return (
    <div className="p-6 max-w-3xl pb-12">
      {/* Progress */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-stone-900">Pack Progress</span>
          <span className="text-sm font-semibold text-stone-700">
            {progress.checked} / {progress.total} items
          </span>
        </div>
        <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-ember-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && progress.total > 0 && (
          <p className="text-xs text-green-600 font-medium mt-2">All packed. Ready to roll.</p>
        )}
      </div>

      {/* Food Pack (always) */}
      <PackSection
        title="Food Pack"
        items={FOOD_PACK_ALWAYS}
        sectionKey="food"
        checkedItems={checkedItems}
        onToggle={onToggle}
        alwaysShow
      />

      {/* Menu items pack */}
      {selectedMenu.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Menu Items</h3>
          <div className="space-y-4">
            {selectedMenu.map((menuItem) => {
              const packItems = MENU_PACK_ITEMS[menuItem] ?? []
              if (packItems.length === 0) return null
              return (
                <div key={menuItem} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
                    <span className="text-xs font-semibold text-stone-600 uppercase tracking-wide">{menuItem}</span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {packItems.map((pi) => {
                      const key = makePackKey(menuItem, pi)
                      const checked = checkedItems.includes(key)
                      return (
                        <PackItem key={key} label={pi} checked={checked} onToggle={() => onToggle(key)} />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selectedMenu.length === 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700">
          No menu items selected. Go to the Menu tab to add items.
        </div>
      )}

      {/* Truck Pack (always) */}
      <div className="mt-6">
        <PackSection
          title="Truck Pack"
          items={TRUCK_PACK_ALWAYS}
          sectionKey="truck"
          checkedItems={checkedItems}
          onToggle={onToggle}
          alwaysShow
        />
      </div>
    </div>
  )
}

function PackSection({
  title,
  items,
  sectionKey,
  checkedItems,
  onToggle,
  alwaysShow,
}: {
  title: string
  items: string[]
  sectionKey: string
  checkedItems: string[]
  onToggle: (key: string) => void
  alwaysShow?: boolean
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">{title}</h3>
      <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
        {items.map((item) => {
          const key = makePackKey(sectionKey, item)
          const checked = checkedItems.includes(key)
          return (
            <PackItem key={key} label={item} checked={checked} onToggle={() => onToggle(key)} />
          )
        })}
      </div>
    </div>
  )
}

function PackItem({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 rounded border-stone-300 text-ember-600 focus:ring-ember-500 focus:ring-offset-0 cursor-pointer"
      />
      <span className={`text-sm ${checked ? 'line-through text-stone-400' : 'text-stone-700'}`}>
        {label}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}
