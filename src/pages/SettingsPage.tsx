import { useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import {
  registerPushSubscription,
  unregisterPushSubscription,
  sendTestNotification,
} from '../lib/notifications'

interface SettingsPageProps {
  profile: Profile
  onProfileUpdate: (updated: Profile) => void
}

export function SettingsPage({ profile, onProfileUpdate }: SettingsPageProps) {
  const [nickname, setNickname] = useState(profile.nickname)
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [nicknameMsg, setNicknameMsg] = useState('')
  const [nicknameMsgIsError, setNicknameMsgIsError] = useState(false)

  const [notifyOnCreated, setNotifyOnCreated] = useState(profile.notify_on_created)
  const [notifyOnOpened, setNotifyOnOpened] = useState(profile.notify_on_opened)
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile.notifications_enabled)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMsg, setNotifMsg] = useState('')
  const [notifMsgIsError, setNotifMsgIsError] = useState(false)

  const [testLoading, setTestLoading] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [testMsgIsError, setTestMsgIsError] = useState(false)

  const saveNickname = async () => {
    if (!nickname.trim()) return
    setNicknameSaving(true)
    setNicknameMsg('')
    const { data, error } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() })
      .eq('id', profile.id)
      .select()
      .single()

    if (error) {
      setNicknameMsgIsError(true)
      setNicknameMsg('Failed to save: ' + error.message)
    } else if (data) {
      onProfileUpdate(data as Profile)
      setNicknameMsgIsError(false)
      setNicknameMsg('Nickname saved!')
    }
    setNicknameSaving(false)
  }

  const handleToggleNotifications = async (enabled: boolean) => {
    setNotifSaving(true)
    setNotifMsg('')

    if (enabled) {
      const sub = await registerPushSubscription()
      if (sub) {
        setNotificationsEnabled(true)
        const { data, error } = await supabase
          .from('profiles')
          .update({ notifications_enabled: true })
          .eq('id', profile.id)
          .select()
          .single()
        if (!error && data) onProfileUpdate(data as Profile)
        setNotifMsgIsError(false)
        setNotifMsg('Push notifications enabled!')
      } else {
        setNotifMsgIsError(true)
        setNotifMsg('Could not enable notifications. Please check browser permissions.')
      }
    } else {
      await unregisterPushSubscription()
      setNotificationsEnabled(false)
      const { data, error } = await supabase
        .from('profiles')
        .update({ notifications_enabled: false, push_token: null })
        .eq('id', profile.id)
        .select()
        .single()
      if (!error && data) onProfileUpdate(data as Profile)
      setNotifMsgIsError(false)
      setNotifMsg('Push notifications disabled.')
    }

    setNotifSaving(false)
  }

  const saveNotificationPrefs = async () => {
    setNotifSaving(true)
    setNotifMsg('')
    const { data, error } = await supabase
      .from('profiles')
      .update({
        notify_on_created: notifyOnCreated,
        notify_on_opened: notifyOnOpened,
      })
      .eq('id', profile.id)
      .select()
      .single()

    if (error) {
      setNotifMsgIsError(true)
      setNotifMsg('Failed to save preferences: ' + error.message)
    } else if (data) {
      onProfileUpdate(data as Profile)
      setNotifMsgIsError(false)
      setNotifMsg('Preferences saved!')
    }
    setNotifSaving(false)
  }

  const handleTestNotification = async () => {
    setTestLoading(true)
    setTestMsg('')
    const result = await sendTestNotification()
    setTestMsgIsError(!result.success)
    setTestMsg(result.success ? 'Test notification sent!' : (result.error ?? 'Failed'))
    setTestLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>

      {/* Nickname */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Profile</h3>
        <div>
          <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
            Nickname
          </label>
          <div className="flex gap-2">
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Your nickname"
            />
            <button
              onClick={saveNickname}
              disabled={nicknameSaving || !nickname.trim()}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {nicknameSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {nicknameMsg && (
            <p className={`text-xs mt-1 ${nicknameMsgIsError ? 'text-red-600' : 'text-green-600'}`}>
              {nicknameMsg}
            </p>
          )}
        </div>
      </div>

      {/* Push Notifications */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Push Notifications</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Enable Notifications</p>
            <p className="text-xs text-gray-400">Receive alerts on your device</p>
          </div>
          <button
            onClick={() => handleToggleNotifications(!notificationsEnabled)}
            disabled={notifSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
              notificationsEnabled ? 'bg-green-600' : 'bg-gray-200'
            }`}
            role="switch"
            aria-checked={notificationsEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {notificationsEnabled && (
          <>
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Notify me when…</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">New game is planned</p>
                  <p className="text-xs text-gray-400">Admin creates a new event</p>
                </div>
                <button
                  onClick={() => setNotifyOnCreated(!notifyOnCreated)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    notifyOnCreated ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={notifyOnCreated}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      notifyOnCreated ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Registration opens</p>
                  <p className="text-xs text-orange-500 font-medium">High priority — grab your spot!</p>
                </div>
                <button
                  onClick={() => setNotifyOnOpened(!notifyOnOpened)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    notifyOnOpened ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={notifyOnOpened}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      notifyOnOpened ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button
              onClick={saveNotificationPrefs}
              disabled={notifSaving}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {notifSaving ? 'Saving…' : 'Save Preferences'}
            </button>
          </>
        )}

        {notifMsg && (
          <p className={`text-xs ${notifMsgIsError ? 'text-red-600' : 'text-green-600'}`}>
            {notifMsg}
          </p>
        )}
      </div>

      {/* Test Notification */}
      {notificationsEnabled && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">Test</h3>
          <p className="text-sm text-gray-500">
            Send a test push notification to confirm your device is set up correctly.
          </p>
          <button
            onClick={handleTestNotification}
            disabled={testLoading}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {testLoading ? 'Sending…' : 'Send Test Notification'}
          </button>
          {testMsg && (
            <p className={`text-xs ${testMsgIsError ? 'text-red-600' : 'text-green-600'}`}>
              {testMsg}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
