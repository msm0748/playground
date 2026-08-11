import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusOverlay } from './StatusOverlay'

describe('StatusOverlay', () => {
  it('shows the camera CTA while idle', () => {
    const onStart = vi.fn()

    render(
      <StatusOverlay
        cameraStatus="idle"
        cameraError={null}
        trackerLoading={false}
        trackerError={null}
        gesturePhase="idle"
        onStart={onStart}
        onRestart={vi.fn()}
        onRetryTracker={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '카메라 허용' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('shows model loading and the exact idle hint', () => {
    const { rerender } = render(
      <StatusOverlay
        cameraStatus="live"
        cameraError={null}
        trackerLoading
        trackerError={null}
        gesturePhase="idle"
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onRetryTracker={vi.fn()}
      />,
    )

    expect(screen.getByText('모델 로딩 중…')).toBeTruthy()

    rerender(
      <StatusOverlay
        cameraStatus="live"
        cameraError={null}
        trackerLoading={false}
        trackerError={null}
        gesturePhase="idle"
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onRetryTracker={vi.fn()}
      />,
    )

    expect(screen.getByText('양손으로 프레임을 만들어 보세요')).toBeTruthy()
  })

  it('prioritizes tracker and camera errors', () => {
    const { rerender } = render(
      <StatusOverlay
        cameraStatus="live"
        cameraError={null}
        trackerLoading={false}
        trackerError="추적 실패"
        gesturePhase="idle"
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onRetryTracker={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toBe('추적 실패')

    rerender(
      <StatusOverlay
        cameraStatus="error"
        cameraError="카메라 실패"
        trackerLoading={false}
        trackerError={null}
        gesturePhase="idle"
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onRetryTracker={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('카메라 실패')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })

  it('retries the tracker without touching the camera', () => {
    const onRetryTracker = vi.fn()
    const onRestart = vi.fn()

    render(
      <StatusOverlay
        cameraStatus="live"
        cameraError={null}
        trackerLoading={false}
        trackerError="모델을 불러올 수 없습니다"
        gesturePhase="idle"
        onStart={vi.fn()}
        onRestart={onRestart}
        onRetryTracker={onRetryTracker}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetryTracker).toHaveBeenCalledOnce()
    expect(onRestart).not.toHaveBeenCalled()
  })
})
