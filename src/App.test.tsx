import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterSettings } from './types'

type StageProps = {
  settings: FilterSettings
  paused: boolean
  trackerKey?: number
  onTrackerError?: (message: string) => void
}

const mocks = vi.hoisted(() => ({
  restart: vi.fn(),
  stageProps: [] as Array<{
    settings: FilterSettings
    paused: boolean
    trackerKey?: number
    onTrackerError?: (message: string) => void
  }>,
}))

vi.mock('./camera/useCamera', () => ({
  useCamera: () => ({
    videoRef: { current: document.createElement('video') },
    state: { status: 'live', errorMessage: null },
    start: vi.fn(),
    restart: mocks.restart,
  }),
}))

vi.mock('./pixi/HandFrameStage', () => ({
  HandFrameStage: (props: StageProps) => {
    mocks.stageProps.push(props)
    return null
  },
}))

import App from './App'

describe('App controls and visibility', () => {
  beforeEach(() => {
    mocks.restart.mockClear()
    mocks.stageProps.length = 0
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('passes live settings and tab visibility to the stage', async () => {
    render(<App />)

    fireEvent.change(screen.getByRole('slider', { name: '셀 강도' }), {
      target: { value: '8' },
    })
    expect(mocks.stageProps.at(-1)?.settings.levels).toBe(8)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(mocks.stageProps.at(-1)?.paused).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: '카메라 재시작' }))
    expect(mocks.restart).toHaveBeenCalledOnce()
  })

  it('recreates the tracker on retry without restarting the camera', async () => {
    render(<App />)

    expect(mocks.stageProps.at(-1)?.trackerKey).toBe(0)

    const reportError = mocks.stageProps.at(-1)?.onTrackerError
    expect(reportError).toBeTypeOf('function')
    act(() => {
      reportError?.('모델을 불러올 수 없습니다')
    })

    expect(screen.getByRole('alert').textContent).toBe(
      '모델을 불러올 수 없습니다',
    )

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => {
      expect(mocks.stageProps.at(-1)?.trackerKey).toBe(1)
    })
    expect(mocks.restart).not.toHaveBeenCalled()
    expect(screen.getByText('모델 로딩 중…')).toBeTruthy()
  })
})
