import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type Event, type Profile } from '../lib/supabase'

interface EventDetailPageProps {
  profile: Profile
}

export function EventDetailPage({ profile }: EventDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<Event | null>(null)
  const [attendees, setAttendees] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [attending, setAttending] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')

  const fetchData = async () => {
    if (!id) return

    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()

    if (!eventData) {
      navigate('/')
      return
    }

    setEvent(eventData)

    const { data: attendancesData } = await supabase
      .from('attendances')
      .select('user_id, profiles(id, nickname)')
      .eq('event_id', id)
      .order('created_at', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles: Profile[] = (attendancesData ?? []).map((a: any) => a.profiles).filter(Boolean)
    setAttendees(profiles)
    setAttending(profiles.some((p) => p.id === profile.id))
    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel(`event-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances', filter: `event_id=eq.${id}` }, fetchData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleAttend = async () => {
    setActionLoading(true)
    setMessage('')

    const { data, error } = await supabase.rpc('attend_event', { p_event_id: id })

    if (error) {
      setMessage(error.message)
    } else if (data?.success === false) {
      setMessage(data.error ?? 'Could not register')
    } else {
      await fetchData()
    }

    setActionLoading(false)
  }

  const handleLeave = async () => {
    setActionLoading(true)
    setMessage('')

    const { error } = await supabase
      .from('attendances')
      .delete()
      .eq('event_id', id)
      .eq('user_id', profile.id)

    if (error) {
      setMessage(error.message)
    } else {
      await fetchData()
    }

    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    )
  }

  if (!event) return null

  const now = new Date()
  const registrationOpen = new Date(event.registration_opens_at) <= now
  const isFull = attendees.length >= event.max_attendees
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => navigate('/')} className="text-green-600 hover:text-green-700 text-sm mb-4 flex items-center gap-1">
        ← Back
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{event.title}</h2>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-gray-600">
            <span>📍</span>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
              {event.location}
            </a>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <span>🗓</span>
            <span>
              {new Date(event.starts_at).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <span>👥</span>
            <span>{attendees.length} / {event.max_attendees} players</span>
          </div>
        </div>

        {message && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm mb-4">
            {message}
          </div>
        )}

        {registrationOpen ? (
          attending ? (
            <button
              onClick={handleLeave}
              disabled={actionLoading}
              className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : 'Leave Match'}
            </button>
          ) : isFull ? (
            <button disabled className="w-full bg-gray-100 text-gray-400 font-semibold py-3 rounded-xl cursor-not-allowed">
              Match Full
            </button>
          ) : (
            <button
              onClick={handleAttend}
              disabled={actionLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Joining...' : 'Join Match ⚽'}
            </button>
          )
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800 text-center">
            Registration opens {new Date(event.registration_opens_at).toLocaleString()}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Players ({attendees.length}/{event.max_attendees})
        </h3>
        {attendees.length === 0 ? (
          <p className="text-gray-400 text-sm">No players yet. Be the first to join!</p>
        ) : (
          <div className="space-y-2">
            {attendees.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3"
              >
                <span className="text-gray-400 text-sm w-6">{idx + 1}.</span>
                <span className="font-medium text-gray-800">{p.nickname}</span>
                {p.id === profile.id && (
                  <span className="ml-auto text-xs text-green-600 font-medium">You</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
