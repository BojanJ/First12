import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Event } from '../lib/supabase'

function useCountdown(target: string) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Open now')
        return
      }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      if (days > 0) setTimeLeft(`Opens in ${days}d ${hours}h`)
      else if (hours > 0) setTimeLeft(`Opens in ${hours}h ${mins}m`)
      else setTimeLeft(`Opens in ${mins}m`)
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [target])

  return timeLeft
}

function EventCard({ event, attendanceCount }: { event: Event; attendanceCount: number }) {
  const now = new Date()
  const registrationOpen = new Date(event.registration_opens_at) <= now
  const countdown = useCountdown(event.registration_opens_at)
  const spotsLeft = event.max_attendees - attendanceCount
  const isFull = spotsLeft <= 0

  return (
    <Link
      to={`/events/${event.id}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:border-green-300 hover:shadow-md transition-all p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-base truncate">{event.title}</h3>
          <p className="text-gray-500 text-sm mt-1">
            📍 {event.location}
          </p>
          <p className="text-gray-500 text-sm">
            🗓 {new Date(event.starts_at).toLocaleDateString('en-GB', {
              weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isFull ? (
            <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full">Full</span>
          ) : (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">
              {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
            </span>
          )}
          {!registrationOpen && (
            <span className="text-xs text-gray-400">{countdown}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })

      if (eventsData) {
        setEvents(eventsData)

        const { data: attendances } = await supabase
          .from('attendances')
          .select('event_id')
          .in('event_id', eventsData.map((e) => e.id))

        const counts: Record<string, number> = {}
        ;(attendances ?? []).forEach((a) => {
          counts[a.event_id] = (counts[a.event_id] ?? 0) + 1
        })
        setAttendanceCounts(counts)
      }

      setLoading(false)
    }

    fetchData()

    // Subscribe to realtime attendance changes
    const channel = supabase
      .channel('attendances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, () => {
        fetchData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="text-5xl mb-4">⚽</div>
        <p className="text-lg font-medium">No upcoming matches</p>
        <p className="text-sm">Check back later or ask your admin to create one.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming Matches</h2>
      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            attendanceCount={attendanceCounts[event.id] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
