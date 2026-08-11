import { useCallback, useEffect, useState } from 'react'
import { useCamera } from './camera/useCamera'
import { HandFrameStage } from './pixi/HandFrameStage'
import type { GesturePhase } from './types'
import { DEFAULT_FILTER_SETTINGS } from './types'
import { StatusOverlay } from './ui/StatusOverlay'

function App() {
  const { videoRef, state, start, restart } = useCamera()
  const [trackerError, setTrackerError] = useState<string | null>(null)
  const [trackerLoading, setTrackerLoading] = useState(false)
  const [gesturePhase, setGesturePhase] = useState<GesturePhase>('idle')

  useEffect(() => {
    setTrackerError(null)
    setGesturePhase('idle')
    setTrackerLoading(state.status === 'live')
  }, [state.status])

  const handlePhaseChange = useCallback((phase: GesturePhase) => {
    setTrackerLoading(false)
    setGesturePhase(phase)
  }, [])

  const handleTrackerError = useCallback((message: string) => {
    setTrackerLoading(false)
    setTrackerError(message)
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
          settings={DEFAULT_FILTER_SETTINGS}
          paused={false}
          onPhaseChange={handlePhaseChange}
          onTrackerError={handleTrackerError}
        />
      )}
      <StatusOverlay
        cameraStatus={state.status}
        cameraError={state.errorMessage}
        trackerLoading={trackerLoading}
        trackerError={trackerError}
        gesturePhase={gesturePhase}
        onStart={() => void start()}
        onRestart={() => void restart()}
      />
    </main>
  )
}

export default App
