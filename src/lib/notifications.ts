import { supabase } from './supabase'

export async function registerPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    // VAPID public key should be set in env
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      console.warn('VAPID public key not configured')
      return null
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    // Save the subscription to the user's profile
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({
          push_token: JSON.stringify(subscription),
          notifications_enabled: true,
        })
        .eq('id', user.id)

      if (error) {
        console.error('Failed to save push token:', error)
      }
    }

    return subscription
  } catch (e) {
    console.error('Failed to subscribe to push notifications:', e)
    return null
  }
}

export async function unregisterPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({
          push_token: null,
          notifications_enabled: false,
        })
        .eq('id', user.id)

      if (error) {
        console.error('Failed to clear push token:', error)
      }
    }
  } catch (e) {
    console.error('Failed to unsubscribe from push notifications:', e)
  }
}

export async function sendTestNotification(): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/notify-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type: 'test', user_id: session.user.id }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: text }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
