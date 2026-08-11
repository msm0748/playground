import { useEffect, useState } from 'react'
import { useCamera } from './camera/useCamera'
import {
  createHandTracker,
  type HandTracker,
} from './tracking/handTracker'

function App() {
  const { videoRef, state, start, restart } = useCamera()
  const [trackerError, setTrackerError] = useState<string | null>(null)

  useEffect(() => {
    if (state.status !== 'live') return

    let cancelled = false
    let animationFrameId: number | null = null
    let tracker: HandTracker | null = null
    setTrackerError(null)

    void createHandTracker()
      .then((createdTracker) => {
        if (cancelled) {
          createdTracker.close()
          return
        }
        tracker = createdTracker

        const detectHands = (timestampMs: number) => {
          const video = videoRef.current
          if (!video || cancelled) return
          const hands = createdTracker.detect(video, timestampMs)
          console.log(hands.length)
          animationFrameId = requestAnimationFrame(detectHands)
        }
        animationFrameId = requestAnimationFrame(detectHands)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setTrackerError(
          error instanceof Error
            ? error.message
            : '손 추적 모델을 불러올 수 없습니다',
        )
      })

    return () => {
      cancelled = true
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
      tracker?.close()
    }
  }, [state.status, videoRef])

  return (
    <main className="app">
      <h1>Hand Frame Cell Shade</h1>
      <p>Webcam demo placeholder — gesture tracking and cell shading coming soon.</p>

      <video ref={videoRef} playsInline muted />
      {state.status === 'idle' && (
        <button type="button" onClick={() => void start()}>
          카메라 허용
        </button>
      )}
      {state.status === 'requesting' && <p>카메라 권한 요청 중…</p>}
      {state.status === 'error' && (
        <>
          <p role="alert">{state.errorMessage}</p>
          <button type="button" onClick={() => void restart()}>
            다시 시도
          </button>
        </>
      )}
      {trackerError && <p role="alert">{trackerError}</p>}
    </main>
  )
}

export default App
