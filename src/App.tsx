import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, type Profile } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { DashboardPage } from './pages/DashboardPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { AdminPage } from './pages/AdminPage'
import { Layout } from './components/Layout'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data)
        setLoading(false)
      })
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  if (!profile?.nickname) {
    return <OnboardingPage onComplete={(p) => setProfile(p)} userId={session.user.id} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout profile={profile} />}>
          <Route index element={<DashboardPage />} />
          <Route path="events/:id" element={<EventDetailPage profile={profile} />} />
          <Route
            path="admin"
            element={
              profile.role === 'admin' ? (
                <AdminPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
