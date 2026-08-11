import { useCallback, useEffect, useState } from 'react'
import { useCamera } from './camera/useCamera'
import { HandFrameStage } from './pixi/HandFrameStage'
import type { FilterMode, FilterSettings, GesturePhase } from './types'
import { DEFAULT_FILTER_MODE, DEFAULT_FILTER_SETTINGS } from './types'
import { Controls } from './ui/Controls'
import { StatusOverlay } from './ui/StatusOverlay'

function App() {
  const { videoRef, state, start, restart } = useCamera()
  const [settings, setSettings] = useState<FilterSettings>(
    DEFAULT_FILTER_SETTINGS,
  )
  const [mode, setMode] = useState<FilterMode>(DEFAULT_FILTER_MODE)
  const [paused, setPaused] = useState(
    () => document.visibilityState === 'hidden',
  )
  const [handTrackerError, setHandTrackerError] = useState<string | null>(null)
  const [modeResourceError, setModeResourceError] = useState<{
    mode: FilterMode
    message: string
  } | null>(null)
  const [trackerLoading, setTrackerLoading] = useState(false)
  const [trackerKey, setTrackerKey] = useState(0)
  const [resourceKey, setResourceKey] = useState(0)
  const [gesturePhase, setGesturePhase] = useState<GesturePhase>('idle')

  useEffect(() => {
    setHandTrackerError(null)
    setModeResourceError(null)
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

  const handleHandTrackerError = useCallback((message: string) => {
    setTrackerLoading(false)
    setHandTrackerError(message)
  }, [])

  const handleModeResourceError = useCallback(
    (errorMode: FilterMode, message: string) => {
      setTrackerLoading(false)
      setModeResourceError({ mode: errorMode, message })
    },
    [],
  )

  const handleModeChange = useCallback(
    (nextMode: FilterMode) => {
      if (nextMode === mode) return
      setModeResourceError(null)
      setMode(nextMode)
    },
    [mode],
  )

  const handleRetryTracker = useCallback(() => {
    const retryingHandTracker = handTrackerError !== null
    if (handTrackerError) {
      setTrackerKey((key) => key + 1)
      setGesturePhase('idle')
    }
    if (modeResourceError?.mode === mode) {
      setResourceKey((key) => key + 1)
    }
    setHandTrackerError(null)
    setModeResourceError(null)
    setTrackerLoading(retryingHandTracker)
  }, [handTrackerError, mode, modeResourceError])

  const trackerError =
    handTrackerError ??
    (modeResourceError?.mode === mode ? modeResourceError.message : null)

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
          mode={mode}
          settings={settings}
          paused={paused}
          trackerKey={trackerKey}
          resourceKey={resourceKey}
          onPhaseChange={handlePhaseChange}
          onHandTrackerError={handleHandTrackerError}
          onModeResourceError={handleModeResourceError}
        />
      )}
      <Controls
        mode={mode}
        settings={settings}
        onModeChange={handleModeChange}
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
