import { useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { registerPushSubscription } from '../lib/notifications'

interface OnboardingPageProps {
  userId: string
  onComplete: (profile: Profile) => void
}

export function OnboardingPage({ userId, onComplete }: OnboardingPageProps) {
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: userId, nickname: nickname.trim() })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Register for push notifications (optional, won't block onboarding)
    registerPushSubscription().catch(err => 
      console.log('Push subscription failed, but continuing:', err)
    )

    onComplete(data as Profile)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-4xl mb-4 text-center">👋</div>
        <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Welcome!</h2>
        <p className="text-gray-500 text-sm mb-6 text-center">
          Choose a nickname to show on the team sheet.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Your nickname (e.g. Pele)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !nickname.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  )
}
