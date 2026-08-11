import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterSettings } from './types'

const mocks = vi.hoisted(() => ({
  restart: vi.fn(),
  stageProps: [] as Array<{ settings: FilterSettings; paused: boolean }>,
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
  HandFrameStage: (props: { settings: FilterSettings; paused: boolean }) => {
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
})
