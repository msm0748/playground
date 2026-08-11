import type { CameraState } from '../camera/useCamera'
import type { GesturePhase } from '../types'

type StatusOverlayProps = {
  cameraStatus: CameraState['status']
  cameraError: string | null
  trackerLoading: boolean
  trackerError: string | null
  gesturePhase: GesturePhase
  onStart: () => void
  onRestart: () => void
  onRetryTracker: () => void
}

export function StatusOverlay({
  cameraStatus,
  cameraError,
  trackerLoading,
  trackerError,
  gesturePhase,
  onStart,
  onRestart,
  onRetryTracker,
}: StatusOverlayProps) {
  if (cameraStatus === 'idle') {
    return (
      <div className="status-overlay status-overlay--center">
        <button type="button" onClick={onStart}>
          카메라 허용
        </button>
      </div>
    )
  }

  if (cameraStatus === 'requesting') {
    return (
      <div className="status-overlay status-overlay--center">
        <p>카메라 권한 요청 중…</p>
      </div>
    )
  }

  if (cameraStatus === 'error') {
    return (
      <div className="status-overlay status-overlay--center">
        <p role="alert">{cameraError ?? '카메라를 사용할 수 없습니다'}</p>
        <button type="button" onClick={onRestart}>
          다시 시도
        </button>
      </div>
    )
  }

  if (trackerError) {
    return (
      <div className="status-overlay status-overlay--center">
        <p role="alert">{trackerError}</p>
        <button type="button" onClick={onRetryTracker}>
          다시 시도
        </button>
      </div>
    )
  }

  if (trackerLoading) {
    return (
      <div className="status-overlay status-overlay--hint">
        <p>모델 로딩 중…</p>
      </div>
    )
  }

  if (gesturePhase === 'idle') {
    return (
      <div className="status-overlay status-overlay--hint">
        <p>양손으로 프레임을 만들어 보세요</p>
      </div>
    )
  }

  return null
}
