import { useCallback, useEffect, useState } from 'react'
import { useCamera } from './camera/useCamera'
import { HandFrameStage } from './pixi/HandFrameStage'
import type { FilterSettings, GesturePhase } from './types'
import { DEFAULT_FILTER_SETTINGS } from './types'
import { Controls } from './ui/Controls'
import { StatusOverlay } from './ui/StatusOverlay'

function App() {
  const { videoRef, state, start, restart } = useCamera()
  const [settings, setSettings] = useState<FilterSettings>(
    DEFAULT_FILTER_SETTINGS,
  )
  const [paused, setPaused] = useState(
    () => document.visibilityState === 'hidden',
  )
  const [trackerError, setTrackerError] = useState<string | null>(null)
  const [trackerLoading, setTrackerLoading] = useState(false)
  const [trackerKey, setTrackerKey] = useState(0)
  const [gesturePhase, setGesturePhase] = useState<GesturePhase>('idle')

  useEffect(() => {
    setTrackerError(null)
    setGesturePhase('idle')
    setTrackerLoading(state.status === 'live')
  }, [state.status])

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPaused(document.visibilityState === 'hidden')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const handlePhaseChange = useCallback((phase: GesturePhase) => {
    setTrackerLoading(false)
    setGesturePhase(phase)
  }, [])

  const handleTrackerError = useCallback((message: string) => {
    setTrackerLoading(false)
    setTrackerError(message)
  }, [])

  const handleRetryTracker = useCallback(() => {
    setTrackerError(null)
    setGesturePhase('idle')
    setTrackerLoading(true)
    setTrackerKey((key) => key + 1)
  }, [])

  return (
    <main className="app">
      <video
        className="camera-input"
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
      />
      {state.status === 'live' && (
        <HandFrameStage
          videoRef={videoRef}
          settings={settings}
          paused={paused}
          trackerKey={trackerKey}
          onPhaseChange={handlePhaseChange}
          onTrackerError={handleTrackerError}
        />
      )}
      <Controls
        settings={settings}
        onChange={setSettings}
        onRestartCamera={() => void restart()}
      />
      <StatusOverlay
        cameraStatus={state.status}
        cameraError={state.errorMessage}
        trackerLoading={trackerLoading}
        trackerError={trackerError}
        gesturePhase={gesturePhase}
        onStart={() => void start()}
        onRestart={() => void restart()}
        onRetryTracker={handleRetryTracker}
      />
    </main>
  )
}

export default App
