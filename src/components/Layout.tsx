import { Outlet, Link, useNavigate } from 'react-router-dom'
import { supabase, type Profile } from '../lib/supabase'

interface LayoutProps {
  profile: Profile
}

export function Layout({ profile }: LayoutProps) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-600 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            ⚽ Soccer Scheduler
          </Link>
          <nav className="flex items-center gap-4">
            {profile.role === 'admin' && (
              <Link to="/admin" className="text-green-100 hover:text-white transition-colors text-sm font-medium">
                Admin Panel
              </Link>
            )}
            <span className="text-green-200 text-sm">
              {profile.nickname}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm bg-green-700 hover:bg-green-800 px-3 py-1 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
