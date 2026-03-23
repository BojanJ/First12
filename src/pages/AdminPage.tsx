import { useEffect, useState } from 'react'
import { supabase, type Event } from '../lib/supabase'

interface EventFormData {
  title: string
  location: string
  starts_at: string
  registration_opens_at: string
  max_attendees: number
  is_recurring: boolean
  repeat_weeks: number
}

const defaultForm: EventFormData = {
  title: '',
  location: '',
  starts_at: '',
  registration_opens_at: '',
  max_attendees: 12,
  is_recurring: false,
  repeat_weeks: 4,
}

export function AdminPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [form, setForm] = useState<EventFormData>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })
    if (data) {
      setEvents(data)

      const { data: attendances } = await supabase
        .from('attendances')
        .select('event_id')
        .in('event_id', data.map((e) => e.id))

      const counts: Record<string, number> = {}
      ;(attendances ?? []).forEach((a) => {
        counts[a.event_id] = (counts[a.event_id] ?? 0) + 1
      })
      setAttendanceCounts(counts)
    }
  }

  useEffect(() => { fetchEvents() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('Not authenticated')
      setLoading(false)
      return
    }

    const eventData = {
      title: form.title,
      location: form.location,
      starts_at: new Date(form.starts_at).toISOString(),
      registration_opens_at: new Date(form.registration_opens_at).toISOString(),
      max_attendees: form.max_attendees,
      is_recurring: form.is_recurring,
      created_by: user.id,
    }

    if (editingId) {
      const { error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', editingId)
      if (error) { setMessage(error.message); setLoading(false); return }
      setMessage('Event updated!')
      setEditingId(null)
    } else {
      // Create single or recurring events
      const eventsToCreate = [eventData]

      if (form.is_recurring && form.repeat_weeks > 1) {
        for (let w = 1; w < form.repeat_weeks; w++) {
          const startsAt = new Date(form.starts_at)
          startsAt.setDate(startsAt.getDate() + w * 7)
          const regOpens = new Date(form.registration_opens_at)
          regOpens.setDate(regOpens.getDate() + w * 7)
          eventsToCreate.push({
            ...eventData,
            starts_at: startsAt.toISOString(),
            registration_opens_at: regOpens.toISOString(),
          })
        }
      }

      const { error } = await supabase.from('events').insert(eventsToCreate)
      if (error) { setMessage(error.message); setLoading(false); return }
      setMessage(`${eventsToCreate.length} event(s) created!`)
    }

    setForm(defaultForm)
    setLoading(false)
    fetchEvents()
  }

  const handleEdit = (event: Event) => {
    setEditingId(event.id)
    setForm({
      title: event.title,
      location: event.location,
      starts_at: event.starts_at.slice(0, 16),
      registration_opens_at: event.registration_opens_at.slice(0, 16),
      max_attendees: event.max_attendees,
      is_recurring: event.is_recurring,
      repeat_weeks: 4,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this event?')) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { setMessage(error.message); return }
    fetchEvents()
  }

  const handleClone = async (event: Event) => {
    const startsAt = new Date(event.starts_at)
    startsAt.setDate(startsAt.getDate() + 7)
    const regOpens = new Date(event.registration_opens_at)
    regOpens.setDate(regOpens.getDate() + 7)

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('events').insert({
      title: event.title,
      location: event.location,
      starts_at: startsAt.toISOString(),
      registration_opens_at: regOpens.toISOString(),
      max_attendees: event.max_attendees,
      is_recurring: event.is_recurring,
      created_by: user?.id,
    })

    if (error) { setMessage(error.message); return }
    setMessage('Event cloned to next week!')
    fetchEvents()
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          {editingId ? 'Edit Event' : 'Create New Event'}
        </h2>

        {message && (
          <div className={`rounded-lg px-4 py-2 text-sm mb-4 ${
            message.includes('error') || message.includes('Error')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Sunday 5-a-side"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Central Park, NY"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Match Time</label>
              <input
                type="datetime-local"
                required
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Opens</label>
              <input
                type="datetime-local"
                required
                value={form.registration_opens_at}
                onChange={(e) => setForm({ ...form, registration_opens_at: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Players</label>
            <input
              type="number"
              required
              min={2}
              max={100}
              value={form.max_attendees}
              onChange={(e) => setForm({ ...form, max_attendees: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="recurring"
              checked={form.is_recurring}
              onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
              className="w-4 h-4 text-green-600 rounded"
            />
            <label htmlFor="recurring" className="text-sm font-medium text-gray-700">
              Repeat weekly
            </label>
          </div>

          {form.is_recurring && !editingId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of weeks</label>
              <select
                value={form.repeat_weeks}
                onChange={(e) => setForm({ ...form, repeat_weeks: parseInt(e.target.value) })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {[2, 3, 4, 5, 6, 7, 8].map((w) => (
                  <option key={w} value={w}>{w} weeks</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? 'Saving...' : editingId ? 'Update Event' : 'Create Event'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm(defaultForm) }}
                className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">All Events</h3>
        {events.length === 0 ? (
          <p className="text-gray-400 text-sm">No events yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900">{event.title}</h4>
                    <p className="text-gray-500 text-sm">📍 {event.location}</p>
                    <p className="text-gray-500 text-sm">
                      🗓 {new Date(event.starts_at).toLocaleDateString('en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      👥 {attendanceCounts[event.id] ?? 0} / {event.max_attendees} players
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleClone(event)}
                      title="Clone to next week"
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-lg transition-colors"
                    >
                      Clone
                    </button>
                    <button
                      onClick={() => handleEdit(event)}
                      className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 px-2 py-1 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
