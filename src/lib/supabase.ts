import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  nickname: string
  role: 'admin' | 'user'
  push_token: string | null
  notifications_enabled: boolean
  notify_on_created: boolean
  notify_on_opened: boolean
  created_at: string
}

export type Event = {
  id: string
  title: string
  location: string
  starts_at: string
  registration_opens_at: string
  max_attendees: number
  is_recurring: boolean
  created_by: string | null
  created_at: string
}

export type Attendance = {
  id: string
  event_id: string
  user_id: string
  created_at: string
}
