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
  ceremony_time: string | null
  cocktail_time: string | null
  dinner_time: string | null
  couples_meal_time: string | null
  guest_count: number | null
  status: string
  address: string | null
  venue_name: string | null
  team_oven: string | null
  team_stretch_top: string | null
  team_expo: string | null
  team_buffet: string | null
  team_buffet_phone: string | null
  team_driver: string | null
  team_driver_phone: string | null
  checkin_contact: string | null
  checkin_phone: string | null
  cocktail_hour: string | null
  dietary_meals: string | null
  couples_meal: string | null
  dinner_service: string | null
  dessert_notes: string | null
  special_notes: string | null
  cocktail_hour_items: { name: string; qty: string }[]
  selected_menu_items: string[]
  checked_pack_items: string[]
  created_at: string
  updated_at: string
}

type Tab = 'details' | 'driving' | 'notes' | 'menu' | 'packlist'

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
    ceremony_time: null,
    cocktail_time: null,
    dinner_time: null,
    couples_meal_time: null,
    guest_count: null,
    status: 'not_confirmed',
    address: null,
    venue_name: null,
    team_oven: null,
    team_stretch_top: null,
    team_expo: null,
    team_buffet: null,
    team_buffet_phone: null,
    team_driver: null,
    team_driver_phone: null,
    checkin_contact: null,
    checkin_phone: null,
    cocktail_hour: null,
    cocktail_hour_items: [],
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
      ceremony_time: event.ceremony_time,
      cocktail_time: event.cocktail_time,
      dinner_time: event.dinner_time,
      couples_meal_time: event.couples_meal_time,
      guest_count: event.guest_count,
      address: event.address,
      venue_name: event.venue_name,
      team_oven: event.team_oven,
      team_stretch_top: event.team_stretch_top,
      team_expo: event.team_expo,
      team_buffet: event.team_buffet,
      team_buffet_phone: event.team_buffet_phone,
      team_driver: event.team_driver,
      team_driver_phone: event.team_driver_phone,
      checkin_contact: event.checkin_contact,
      checkin_phone: event.checkin_phone,
      cocktail_hour: event.cocktail_hour,
      cocktail_hour_items: event.cocktail_hour_items ?? [],
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
                <div className="flex items-baseline gap-2">
                  {event.event_date && (
                    <span className="text-xs font-medium text-ember-600 flex-shrink-0">{formatDateDisplay(event.event_date)}</span>
                  )}
                  <p className="text-sm font-medium text-stone-900 truncate">{event.event_name}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {event.guest_count != null && (
                    <span className="text-xs text-stone-400">{event.guest_count} guests</span>
                  )}
                </div>
                <div className="mt-1">
                  {event.status === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      <CheckCircleIcon className="w-3 h-3" />
                      Confirmed
                    </span>
                  ) : event.status === 'waiting' ? (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Waiting</span>
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
                    {selectedEvent.status === 'confirmed' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        Confirmed
                      </span>
                    ) : selectedEvent.status === 'waiting' ? (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Waiting on Confirmation</span>
                    ) : (
                      <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">Not Confirmed</span>
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
                {(['details', 'driving', 'notes', 'menu', 'packlist'] as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'bg-ember-600 text-white'
                        : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {tab === 'details' ? 'Event Details'
                      : tab === 'driving' ? 'Driving & Parking'
                      : tab === 'notes' ? 'Menu Notes'
                      : tab === 'menu' ? 'Menu'
                      : (
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
              {activeTab === 'driving' && (
                <DrivingTab
                  form={form}
                  dirty={formDirty}
                  onChange={handleFormChange}
                  onSave={handleSaveDetails}
                  eventId={selectedEvent.id}
                />
              )}
              {activeTab === 'notes' && (
                <MenuNotesTab
                  form={form}
                  dirty={formDirty}
                  onChange={handleFormChange}
                  onSave={handleSaveDetails}
                  selectedMenuItems={selectedEvent.selected_menu_items ?? []}
                  onToggleMenu={handleMenuToggle}
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
// Drive time calculator (OpenStreetMap Nominatim + OSRM — no API key needed)
// ---------------------------------------------------------------------------

async function calcDriveTime(fromAddress: string, toAddress: string): Promise<{ driveTime?: string; error?: string }> {
  const res = await fetch('/api/drive-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromAddress, to: toAddress }),
  })
  return res.json()
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
      {/* Status selector — top of page */}
      <div className="flex gap-2">
        {([
          { value: 'not_confirmed', label: 'Not Confirmed', active: 'bg-stone-700 text-white', inactive: 'bg-white text-stone-500 border border-stone-200 hover:bg-stone-50' },
          { value: 'waiting', label: 'Waiting on Confirmation', active: 'bg-amber-500 text-white', inactive: 'bg-white text-stone-500 border border-stone-200 hover:bg-amber-50' },
          { value: 'confirmed', label: 'Confirmed', active: 'bg-green-600 text-white', inactive: 'bg-white text-stone-500 border border-stone-200 hover:bg-green-50' },
        ] as const).map(({ value, label, active, inactive }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange('status', value)}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${form.status === value ? active : inactive}`}
          >
            {label}
          </button>
        ))}
      </div>

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
            {field('Venue Name', 'venue_name', 'text', 'e.g. The Peach Orchard')}
          </div>
          <div className="sm:col-span-2">
            {field('Address', 'address', 'text', '123 Main St, Dallas, TX')}
          </div>
          <div className="sm:col-span-2">
            <div className="space-y-0 divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
              {/* On-Site Time — highlighted */}
              <div className="flex items-center gap-3 px-4 py-3.5 bg-ember-50 border-l-4 border-l-ember-500">
                <span className="text-xs font-bold text-ember-700 w-36 flex-shrink-0 uppercase tracking-wide">On-Site Time</span>
                <input type="text" value={(form.on_site_time as string) ?? ''}
                  onChange={(e) => onChange('on_site_time', e.target.value || null)}
                  placeholder="4:00 PM"
                  className="flex-1 px-2.5 py-1.5 text-sm font-semibold bg-white border border-ember-200 rounded-lg text-ember-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
              </div>
              {/* Ceremony */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Ceremony</span>
                <input type="text" value={(form.ceremony_time as string) ?? ''}
                  onChange={(e) => onChange('ceremony_time', e.target.value || null)}
                  placeholder="5:00 PM"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
              </div>
              {/* Cocktail Hour */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Cocktail Hour</span>
                <input type="text" value={(form.cocktail_time as string) ?? ''}
                  onChange={(e) => onChange('cocktail_time', e.target.value || null)}
                  placeholder="5:30 PM"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
              </div>
              {/* Couple's Meal */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Couple's Meal</span>
                <input type="text" value={(form.couples_meal_time as string) ?? ''}
                  onChange={(e) => onChange('couples_meal_time', e.target.value || null)}
                  placeholder="7:00 PM"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
              </div>
              {/* Dinner Service */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Dinner Service</span>
                <input type="text" value={(form.dinner_time as string) ?? ''}
                  onChange={(e) => onChange('dinner_time', e.target.value || null)}
                  placeholder="7:30 PM"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="space-y-0 divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Check In Contact</span>
                <input
                  type="text"
                  value={(form.checkin_contact as string) ?? ''}
                  onChange={(e) => onChange('checkin_contact', e.target.value || null)}
                  placeholder="Contact name"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
                />
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Phone Number</span>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="tel"
                    value={(form.checkin_phone as string) ?? ''}
                    onChange={(e) => onChange('checkin_phone', e.target.value || null)}
                    placeholder="(555) 000-0000"
                    className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
                  />
                  {form.checkin_phone && (
                    <a
                      href={`tel:${(form.checkin_phone as string).replace(/\D/g, '')}`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Team</h3>
        <div className="space-y-0 divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">

          {/* Oven / Driver — at top with phone + call */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Oven / Driver</span>
            <select
              value={(form.team_oven as string) ?? ''}
              onChange={(e) => onChange('team_oven', e.target.value || null)}
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
            >
              <option value="">— Unassigned —</option>
              {['Jarod', 'Devon', 'Sergei', 'Benji'].map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <input
              type="tel"
              value={(form.team_driver_phone as string) ?? ''}
              onChange={(e) => onChange('team_driver_phone', e.target.value || null)}
              placeholder="Phone"
              className="w-28 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
            />
            <div className="flex items-center gap-1.5">
              {(form.team_driver_phone as string)?.trim() ? (
                <a href={`tel:${(form.team_driver_phone as string).replace(/\D/g, '')}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call
                </a>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-300 bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap cursor-default">Call</span>
              )}
              {(form.team_driver_phone as string)?.trim() ? (
                <a href={`sms:${(form.team_driver_phone as string).replace(/\D/g, '')}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Text
                </a>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-300 bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap cursor-default">Text</span>
              )}
            </div>
          </div>

          {([
            { label: 'Stretch / Top', key: 'team_stretch_top', members: ['Jose', 'Carlos', 'Arthur', 'Miguel', 'Maria'] },
            { label: 'Expo', key: 'team_expo', members: ['Joel', 'Taylor', 'Bre', 'Elise'] },
          ] as { label: string; key: keyof Event; members: string[] }[]).map(({ label, key, members }) => (
            <div key={key as string} className="flex items-center gap-3 px-4 py-3 bg-white">
              <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">{label}</span>
              <select
                value={(form[key] as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value || null)}
                className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
              >
                <option value="">— Unassigned —</option>
                {members.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          ))}

          {/* Buffet — with phone + call */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Buffet</span>
            <input
              type="text"
              value={(form.team_buffet as string) ?? ''}
              onChange={(e) => onChange('team_buffet', e.target.value || null)}
              placeholder="Name"
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
            />
            <input
              type="tel"
              value={(form.team_buffet_phone as string) ?? ''}
              onChange={(e) => onChange('team_buffet_phone', e.target.value || null)}
              placeholder="Phone"
              className="w-28 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
            />
            <div className="flex items-center gap-1.5">
              {(form.team_buffet_phone as string)?.trim() ? (
                <a href={`tel:${(form.team_buffet_phone as string).replace(/\D/g, '')}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call
                </a>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-300 bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap cursor-default">Call</span>
              )}
              {(form.team_buffet_phone as string)?.trim() ? (
                <a href={`sms:${(form.team_buffet_phone as string).replace(/\D/g, '')}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Text
                </a>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-300 bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap cursor-default">Text</span>
              )}
            </div>
          </div>
        </div>
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
// Driving / Parking Tab
// ---------------------------------------------------------------------------

function DrivingTab({
  form,
  dirty,
  onChange,
  onSave,
  eventId,
}: {
  form: Partial<Event>
  dirty: boolean
  onChange: (field: keyof Event, value: string | number | boolean | null) => void
  onSave: () => void
  eventId: string
}) {
  const [fromAddress, setFromAddress] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('fireova_base_address') || '3839 Market St Suite 107, Denton, TX 76209') : '3839 Market St Suite 107, Denton, TX 76209'
  )
  const [calculating, setCalculating] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [parkingPhotos, setParkingPhotos] = useState<{ path: string; url: string }[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const parkingInputRef = useRef<HTMLInputElement>(null)

  const [permits, setPermits] = useState<{ path: string; url: string; name: string }[]>([])
  const [uploadingPermit, setUploadingPermit] = useState(false)
  const [permitError, setPermitError] = useState<string | null>(null)
  const permitInputRef = useRef<HTMLInputElement>(null)

  // Keep a ref to the latest handleCalcDriveTime so the debounce effect can call it
  const calcDriveRef = useRef<(() => void) | null>(null)

  // Load existing parking photos on mount
  useEffect(() => {
    if (!supabaseConfigured) return
    async function loadPhotos() {
      const supabase = createClient()
      const { data } = await supabase.storage.from('media').list(`events/${eventId}/parking`, { limit: 50 })
      if (!data?.length) return
      const photos = data.map((f) => {
        const path = `events/${eventId}/parking/${f.name}`
        const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
        return { path, url }
      })
      setParkingPhotos(photos)
    }
    loadPhotos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function handleParkingUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (!supabaseConfigured) { setPhotoError('Supabase not configured'); return }
    setUploadingPhoto(true)
    setPhotoError(null)
    const supabase = createClient()
    const added: { path: string; url: string }[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `events/${eventId}/parking/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file)
      if (error) { setPhotoError(`Failed to upload ${file.name}`); continue }
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      added.push({ path, url })
    }
    setParkingPhotos((prev) => [...prev, ...added])
    setUploadingPhoto(false)
    if (parkingInputRef.current) parkingInputRef.current.value = ''
  }

  async function handleDeleteParkingPhoto(path: string) {
    if (!supabaseConfigured) { setParkingPhotos((prev) => prev.filter((p) => p.path !== path)); return }
    const supabase = createClient()
    await supabase.storage.from('media').remove([path])
    setParkingPhotos((prev) => prev.filter((p) => p.path !== path))
  }

  // Permits
  useEffect(() => {
    if (!supabaseConfigured) return
    async function loadPermits() {
      const supabase = createClient()
      const { data } = await supabase.storage.from('media').list(`events/${eventId}/permits`, { limit: 50 })
      if (!data?.length) return
      const files = data.map((f) => {
        const path = `events/${eventId}/permits/${f.name}`
        const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
        return { path, url, name: f.name }
      })
      setPermits(files)
    }
    loadPermits()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function handlePermitUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (!supabaseConfigured) { setPermitError('Supabase not configured'); return }
    setUploadingPermit(true)
    setPermitError(null)
    const supabase = createClient()
    const added: { path: string; url: string; name: string }[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `events/${eventId}/permits/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('media').upload(path, file)
      if (error) { setPermitError(`Failed to upload ${file.name}`); continue }
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      added.push({ path, url, name: file.name })
    }
    setPermits((prev) => [...prev, ...added])
    setUploadingPermit(false)
    if (permitInputRef.current) permitInputRef.current.value = ''
  }

  async function handleDeletePermit(path: string) {
    if (!supabaseConfigured) { setPermits((prev) => prev.filter((p) => p.path !== path)); return }
    const supabase = createClient()
    await supabase.storage.from('media').remove([path])
    setPermits((prev) => prev.filter((p) => p.path !== path))
  }

  async function handleCalcDriveTime() {
    const toAddress = form.address as string | null
    if (!toAddress?.trim()) { setCalcError('Enter an event address in Event Details first'); return }
    if (!fromAddress.trim()) { setCalcError('Enter your starting address'); return }
    setCalculating(true)
    setCalcError(null)
    const res = await fetch('/api/drive-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddress, to: toAddress }),
    })
    const result = await res.json()
    setCalculating(false)
    if (result.driveTime) {
      onChange('drive_time', result.driveTime)
    } else {
      setCalcError(result.error ?? 'Could not calculate. Check both addresses.')
    }
  }

  function handleCalcLeaveTime() {
    const onSiteTime = form.on_site_time as string | null
    const driveTime = form.drive_time as string | null
    if (!onSiteTime?.trim()) { setCalcError('Enter On-Site Time first'); return }
    if (!driveTime?.trim()) { setCalcError('Calculate Drive Time first'); return }
    const timeMatch = onSiteTime.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i)
    if (!timeMatch) { setCalcError('On-Site Time should be like "4:00 PM"'); return }
    let hours = parseInt(timeMatch[1])
    const mins = parseInt(timeMatch[2] ?? '0')
    const ampm = timeMatch[3].toUpperCase()
    if (ampm === 'PM' && hours !== 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    const onSiteMinutes = hours * 60 + mins
    let driveMinutes = 0
    const hrMatch = driveTime.match(/(\d+)\s*hr/)
    const minMatch = driveTime.match(/(\d+)\s*min/)
    if (hrMatch) driveMinutes += parseInt(hrMatch[1]) * 60
    if (minMatch) driveMinutes += parseInt(minMatch[1])
    if (driveMinutes === 0) { setCalcError('Could not read Drive Time value'); return }
    const leaveMinutes = onSiteMinutes - driveMinutes
    const leaveHour24 = (Math.floor(leaveMinutes / 60) + 24) % 24
    const leaveMins = ((leaveMinutes % 60) + 60) % 60
    const leaveAmpm = leaveHour24 >= 12 ? 'PM' : 'AM'
    const leaveHour12 = leaveHour24 % 12 || 12
    onChange('leave_time', `${leaveHour12}:${leaveMins.toString().padStart(2, '0')} ${leaveAmpm}`)
    setCalcError(null)
  }

  // Keep ref in sync so the debounce timer always calls the latest version
  calcDriveRef.current = handleCalcDriveTime

  // Auto-calculate drive time when event address or starting address changes (debounced 900ms)
  useEffect(() => {
    const address = form.address as string | null
    if (!address?.trim() || !fromAddress.trim()) return
    const timer = setTimeout(() => { calcDriveRef.current?.() }, 900)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.address, fromAddress])

  // Auto-calculate leave time whenever drive time or on-site time changes
  useEffect(() => {
    const driveTime = form.drive_time as string | null
    const onSiteTime = form.on_site_time as string | null
    if (driveTime?.trim() && onSiteTime?.trim()) {
      handleCalcLeaveTime()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.drive_time, form.on_site_time])

  function field(label: string, key: keyof Event, placeholder?: string) {
    return (
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
        <input
          type="text"
          value={(form[key] as string) ?? ''}
          onChange={(e) => onChange(key, e.target.value || null)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      {/* Driver banner — always visible */}
      <div className="flex items-center gap-3 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl">
        <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-0.5">Driver</p>
          <p className={`text-sm font-medium ${(form.team_oven as string) ? 'text-stone-800' : 'text-stone-400'}`}>
            {(form.team_oven as string) || 'Not assigned — set in Event Details'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(form.team_driver_phone as string)?.trim() ? (
            <a href={`tel:${(form.team_driver_phone as string).replace(/\D/g, '')}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </a>
          ) : (
            <span className="px-2.5 py-1.5 text-xs font-medium text-stone-300 bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap cursor-default">Call</span>
          )}
          {(form.team_driver_phone as string)?.trim() ? (
            <a href={`sms:${(form.team_driver_phone as string).replace(/\D/g, '')}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Text
            </a>
          ) : (
            <span className="px-2.5 py-1.5 text-xs font-medium text-stone-300 bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap cursor-default">Text</span>
          )}
        </div>
      </div>

      {/* Event address display */}
      {form.address ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2 px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg">
            <svg className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-500 font-medium mb-0.5">Event Address</p>
              <p className="text-sm text-stone-800">{form.address as string}</p>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(form.address as string)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ember-600 hover:text-ember-700 font-medium whitespace-nowrap mt-0.5"
            >
              Open in Maps
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(form.address as string)}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-ember-600 hover:bg-ember-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Start Drive
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fromAddress)}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-700 hover:bg-stone-800 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Return to Kitchen
            </a>
          </div>
          <p className="text-[10px] text-stone-400 text-center">Opens Google Maps. Tap Share trip progress to let others track you.</p>
        </div>
      ) : (
        <div className="px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg">
          <p className="text-xs text-stone-400">No address set — add it in Event Details.</p>
        </div>
      )}

      {/* Timing — vertical single column */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Timing</h3>
        <div className="space-y-0 divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
          {/* Drive Time */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">
              Drive Time
              {calculating && <span className="ml-1.5 text-[10px] text-ember-500 animate-pulse">calculating...</span>}
            </span>
            <input
              type="text"
              value={(form.drive_time as string) ?? ''}
              onChange={(e) => onChange('drive_time', e.target.value || null)}
              placeholder="Auto-calculated"
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors"
            />
          </div>

          {/* Leave Time — highlighted */}
          <div className="flex items-center gap-3 px-4 py-3.5 bg-ember-50 border-l-4 border-l-ember-500">
            <span className="text-xs font-bold text-ember-700 w-36 flex-shrink-0 uppercase tracking-wide">Leave Time</span>
            <input type="text" value={(form.leave_time as string) ?? ''}
              onChange={(e) => onChange('leave_time', e.target.value || null)}
              placeholder="Auto-calculated"
              className="flex-1 px-2.5 py-1.5 text-sm font-semibold bg-white border border-ember-200 rounded-lg text-ember-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
          </div>

          {/* On-Site Time — highlighted */}
          <div className="flex items-center gap-3 px-4 py-3.5 bg-ember-50 border-l-4 border-l-ember-500">
            <span className="text-xs font-bold text-ember-700 w-36 flex-shrink-0 uppercase tracking-wide">On-Site Time</span>
            <input type="text" value={(form.on_site_time as string) ?? ''}
              onChange={(e) => onChange('on_site_time', e.target.value || null)}
              placeholder="4:00 PM"
              className="flex-1 px-2.5 py-1.5 text-sm font-semibold bg-white border border-ember-200 rounded-lg text-ember-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
          </div>

          {/* Ceremony Time */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Ceremony Time</span>
            <input type="text" value={(form.ceremony_time as string) ?? ''}
              onChange={(e) => onChange('ceremony_time', e.target.value || null)}
              placeholder="5:00 PM"
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
          </div>

          {/* Cocktail Hour */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Cocktail Hour</span>
            <input type="text" value={(form.cocktail_time as string) ?? ''}
              onChange={(e) => onChange('cocktail_time', e.target.value || null)}
              placeholder="5:30 PM"
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
          </div>

          {/* Couple's Meal */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Couple's Meal</span>
            <input type="text" value={(form.couples_meal_time as string) ?? ''}
              onChange={(e) => onChange('couples_meal_time', e.target.value || null)}
              placeholder="7:00 PM"
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
          </div>

          {/* Dinner Service */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <span className="text-xs font-medium text-stone-500 w-36 flex-shrink-0">Dinner Service</span>
            <input type="text" value={(form.dinner_time as string) ?? ''}
              onChange={(e) => onChange('dinner_time', e.target.value || null)}
              placeholder="7:30 PM"
              className="flex-1 px-2.5 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors" />
          </div>
        </div>
        {calcError && <p className="text-xs text-red-500 mt-3">{calcError}</p>}
      </section>

      {/* Parking */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Parking</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Parking Notes</label>
            <textarea
              value={(form.special_notes as string) ?? ''}
              onChange={(e) => onChange('special_notes', e.target.value || null)}
              placeholder="Parking location, access code, load-in instructions, restrictions..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors resize-none"
            />
          </div>

          {/* Parking Photos */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">Parking Photos</label>
            <input ref={parkingInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleParkingUpload} />

            {parkingPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                {parkingPhotos.map((photo) => (
                  <div key={photo.path} className="relative group aspect-square rounded-lg overflow-hidden bg-stone-100 border border-stone-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="Parking" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleDeleteParkingPhoto(photo.path)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => parkingInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
            >
              {uploadingPhoto ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              {uploadingPhoto ? 'Uploading...' : 'Upload Photos'}
            </button>
            {photoError && <p className="text-xs text-red-500 mt-2">{photoError}</p>}
          </div>
        </div>
      </section>

      {/* Permits */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">Permits</h3>
        <input ref={permitInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple className="hidden" onChange={handlePermitUpload} />

        {permits.length > 0 && (
          <div className="space-y-2 mb-3">
            {permits.map((permit) => (
              <div key={permit.path} className="flex items-center gap-3 px-3 py-2.5 bg-white border border-stone-200 rounded-lg">
                <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <a href={permit.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-sm text-stone-700 hover:text-ember-600 truncate transition-colors">
                  {permit.name}
                </a>
                <button type="button" onClick={() => handleDeletePermit(permit.path)}
                  className="w-5 h-5 flex items-center justify-center text-stone-300 hover:text-red-400 transition-colors flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => permitInputRef.current?.click()}
          disabled={uploadingPermit}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          {uploadingPermit ? (
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          {uploadingPermit ? 'Uploading...' : 'Upload Permit'}
        </button>
        {permitError && <p className="text-xs text-red-500 mt-2">{permitError}</p>}
      </section>

      <div className="pt-2">
        <button onClick={onSave} disabled={!dirty}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dirty ? 'bg-ember-600 hover:bg-ember-700 text-white' : 'bg-stone-100 text-stone-400 cursor-not-allowed'}`}>
          {dirty ? 'Save' : 'All changes saved'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cocktail Hour Builder
// ---------------------------------------------------------------------------

const COCKTAIL_SECTIONS: {
  label: string
  unit: string
  items: { name: string; sizes?: string[] }[]
}[] = [
  {
    label: 'Charcuterie',
    unit: 'size',
    items: [
      { name: 'Grazing Table', sizes: ['3ft', '4ft', '5ft', '6ft'] },
      { name: 'Charcuterie Board', sizes: ['Small', 'Medium', 'Large'] },
      { name: 'Charcuterie Cups' },
      { name: 'Custom' },
    ],
  },
  {
    label: 'Small Bites',
    unit: 'dozens',
    items: [
      { name: 'Prosciutto Wrapped Shrimp' },
      { name: 'Stuffed Mushrooms' },
      { name: 'Caprese Skewers' },
      { name: 'Roasted Tomato Crostini' },
      { name: 'Arugula Prosciutto Crostini' },
      { name: 'Smoked Salmon Bites' },
      { name: 'Smoked Salmon Dip' },
      { name: 'Caprese Platter' },
      { name: 'Custom' },
    ],
  },
  {
    label: 'Hot Sides',
    unit: 'pans',
    items: [
      { name: 'Meatballs' },
      { name: 'BBQ Wings' },
      { name: 'Lamb Lollipops' },
      { name: 'Ahi Tuna' },
      { name: 'Custom' },
    ],
  },
]

function CocktailHourBuilder({
  items,
  onChange,
}: {
  items: { name: string; qty: string; section?: string }[]
  onChange: (items: { name: string; qty: string; section?: string }[]) => void
}) {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('')
  const [customName, setCustomName] = useState('')

  function addItem(sectionLabel: string, unit: string) {
    const sectionDef = COCKTAIL_SECTIONS.find((s) => s.label === sectionLabel)
    const itemDef = sectionDef?.items.find((i) => i.name === newName)
    const name = newName === 'Custom' ? customName.trim() : newName
    if (!name) return
    const qty = newQty.trim() ? (itemDef?.sizes ? newQty : `${newQty} ${unit}`.trim()) : ''
    onChange([...items, { name, qty, section: sectionLabel }])
    setNewName('')
    setNewQty('')
    setCustomName('')
    setOpenSection(null)
  }

  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  function updateQty(idx: number, qty: string) {
    onChange(items.map((item, i) => i === idx ? { ...item, qty } : item))
  }

  return (
    <div className="space-y-2">
      {COCKTAIL_SECTIONS.map((section) => {
        const sectionItems = items.filter((i) => i.section === section.label)
        const isOpen = openSection === section.label
        const selectedDef = section.items.find((i) => i.name === newName)

        return (
          <div key={section.label} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{section.label}</span>
              <button
                type="button"
                onClick={() => { setOpenSection(isOpen ? null : section.label); setNewName(''); setNewQty(''); setCustomName('') }}
                className="flex items-center gap-1 text-xs text-ember-600 hover:text-ember-700 font-medium transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>

            {/* Selected items — clean plain list */}
            {sectionItems.length > 0 && (
              <div className="px-4 pb-2 divide-y divide-stone-100">
                {sectionItems.map((item, i) => {
                  const idx = items.indexOf(item)
                  return (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 text-sm text-stone-800">{item.name}</span>
                      <input
                        type="text"
                        value={item.qty}
                        onChange={(e) => updateQty(idx, e.target.value)}
                        placeholder="—"
                        className="w-20 text-sm text-right text-stone-600 bg-transparent border-none outline-none placeholder-stone-300 focus:bg-stone-50 focus:rounded px-1"
                      />
                      <button type="button" onClick={() => removeItem(idx)} className="text-stone-200 hover:text-red-400 transition-colors ml-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {isOpen && (
              <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNewQty('') }}
                    className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400"
                  >
                    <option value="">— Select item —</option>
                    {section.items.map((i) => (
                      <option key={i.name} value={i.name}>{i.name}</option>
                    ))}
                  </select>
                  {newName === 'Custom' && (
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Item name"
                      className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400"
                    />
                  )}
                </div>
                {newName && (
                  <div className="flex gap-2">
                    {selectedDef?.sizes ? (
                      <select
                        value={newQty}
                        onChange={(e) => setNewQty(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400"
                      >
                        <option value="">— Size —</option>
                        {selectedDef.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={newQty}
                        onChange={(e) => setNewQty(e.target.value)}
                        placeholder={`# of ${section.unit}`}
                        className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400"
                      />
                    )}
                    <button type="button" onClick={() => addItem(section.label, section.unit)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-ember-600 hover:bg-ember-700 rounded-lg transition-colors">
                      Add
                    </button>
                    <button type="button" onClick={() => { setOpenSection(null); setNewName(''); setNewQty(''); setCustomName('') }}
                      className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menu Notes Tab
// ---------------------------------------------------------------------------

function MenuNotesTab({
  form,
  dirty,
  onChange,
  onSave,
  selectedMenuItems,
  onToggleMenu,
}: {
  form: Partial<Event>
  dirty: boolean
  onChange: (field: keyof Event, value: string | number | boolean | null) => void
  onSave: () => void
  selectedMenuItems: string[]
  onToggleMenu: (item: string) => void
}) {
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

  function timeLabel(label: string, time: string | null | undefined) {
    return (
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-stone-500">{label}</span>
        {time ? (
          <span className="px-2 py-0.5 text-[11px] font-semibold text-ember-700 bg-ember-50 border border-ember-200 rounded-full">{time}</span>
        ) : (
          <span className="px-2 py-0.5 text-[11px] text-stone-300 bg-stone-50 border border-stone-200 rounded-full">No time set</span>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">

      <div>
        {timeLabel('Cocktail Hour', form.cocktail_time as string | null)}
        <CocktailHourBuilder
          items={(form.cocktail_hour_items as { name: string; qty: string }[]) ?? []}
          onChange={(items) => onChange('cocktail_hour_items', items as unknown as string)}
        />
        <textarea
          value={(form.cocktail_hour as string) ?? ''}
          onChange={(e) => onChange('cocktail_hour', e.target.value || null)}
          placeholder="Additional cocktail hour notes..."
          rows={2}
          className="mt-2 w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors resize-none"
        />
      </div>
      {textarea('Dietary Meals', 'dietary_meals', 'GF, dairy-free, vegetarian, etc.')}
      <div>
        {timeLabel("Couple's Meal", form.couples_meal_time as string | null)}
        <textarea
          value={(form.couples_meal as string) ?? ''}
          onChange={(e) => onChange('couples_meal', e.target.value || null)}
          placeholder="What are we making for the couple's plate?"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors resize-none"
        />
      </div>
      <div>
        {timeLabel('Dinner Service', form.dinner_time as string | null)}
        <textarea
          value={(form.dinner_service as string) ?? ''}
          onChange={(e) => onChange('dinner_service', e.target.value || null)}
          placeholder="Dinner service details and notes"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-400 transition-colors resize-none"
        />
      </div>
      {textarea('Dessert', 'dessert_notes', 'Dessert options and notes')}
      {textarea('Special Notes', 'special_notes', 'Anything else the team needs to know')}

      <div className="pt-2 pb-8">
        <button
          onClick={onSave}
          className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
            dirty ? 'bg-ember-600 hover:bg-ember-700 text-white' : 'bg-stone-100 text-stone-400 cursor-default'
          }`}
        >
          {dirty ? 'Save' : 'All changes saved'}
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
