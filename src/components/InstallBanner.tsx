import { useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

export function InstallBanner() {
  const { canInstall, install } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(false)

  if (!canInstall || dismissed) return null

  return (
    <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span>⚽</span>
        <span className="font-medium">Install Soccer Scheduler for the best experience</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={install}
          className="bg-white text-green-700 font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors"
        >
          Download App
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-green-200 hover:text-white text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
